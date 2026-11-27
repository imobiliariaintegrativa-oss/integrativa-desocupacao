import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Render fica atrás de um proxy: req.ip passa a ser o IP real
app.use(cors());
// Envio de arquivos (orçamentos em PDF/imagem) aceita até 15 MB; o resto, até 1 MB
const jsonPadrao = express.json({ limit: '1mb' });
const jsonArquivos = express.json({ limit: '15mb' });
app.use((req, res, next) => (req.path.endsWith('/arquivo') ? jsonArquivos : jsonPadrao)(req, res, next));

// ===== LOGIN (V34) =====
// JWT_SECRET deve ser configurado no Render. Sem ele, gera um segredo temporário:
// funciona, mas todos precisam entrar de novo sempre que o servidor reiniciar.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET não configurado: usando segredo temporário (sessões caem a cada reinício).');
}
const DURACAO_SESSAO = '12h';
const SENHA_MINIMA = 8;
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// SCHEMA COM TIPO DESOCUPACAO
const contractSchema = new mongoose.Schema({
  contrato: String,
  locatario: String,
  endereco: String,
  tipoDesocupacao: { type: String, enum: ['comum', 'despejo'], default: 'comum' },
  comunicacaoInquilino: Date,
  agendamentoVistoria: Date,
  entregaChaves: Date,
  dataRetiradaChaves: Date,
  dataDevolucaoChaves: Date,
  statusChaves: { type: String, enum: ['pendente', 'recebidas', 'nao-recebidas'], default: 'pendente' },
  finalizado: { type: String, enum: ['sim', 'nao'], default: 'nao' },
  dataFinalizacao: Date, // gravada automaticamente quando o contrato é finalizado
  nomeVistoriador: String,
  quantidadeChaves: { type: Number, default: 2 },
  responsavel: String,
  prioridade: { type: String, enum: ['baixa', 'media', 'alta', 'critica'], default: 'media' },
  statusImovel: { type: String, enum: ['em-desocupacao', 'em-reparo', 'pronto-para-aluguel', 'alugado', 'bloqueado'], default: 'em-desocupacao' },
  dataDisponivelAluguel: Date,
  reparos: [{
    descricao: String,
    urgencia: String,
    responsavel: String,
    dataLimite: Date,
    status: String,
    dataCriacao: { type: Date, default: Date.now },
    dataConclusao: Date,
    // Campos Prestador (V25.8)
    prestadorNome: String,
    prestadorTelefone: String,
    prestadorEmail: String,
    prestadorEspecialidade: String,
    dataRetiradaChaves: Date,
    dataDevolucaoChaves: Date,
    valorServico: Number
  }],
  // Rescisão (V33): ao finalizar a desocupação, o contrato é encaminhado ao administrativo
  rescisao: {
    encaminhadoEm: Date,
    responsavel: String,
    transferenciaContas: { type: Boolean, default: false }, // Transferência de água e energia
    calculoDebitos: { type: Boolean, default: false },
    descontoReparos: { type: Boolean, default: false },
    caucao: { type: Boolean, default: false },              // Caução / garantia
    termoAssinado: { type: Boolean, default: false },       // Termo de rescisão assinado
    observacoes: String,
    concluidaEm: Date,
    orcamentosEnviadosEm: Date // V36: orçamentos repassados ao administrativo (antes mesmo de finalizar)
  },
  // Garantia da locação (V36): define para quem vão os orçamentos
  garantiaTipo: { type: String, enum: ['seguro-fianca', 'garantidora', 'caucao', 'fiador', 'titulo', 'sem-garantia', null], default: null },
  garantiaEmpresa: String,
  // Fase dos reparos no quadro (V36): orçamentos → execução → concluído
  faseReparo: { type: String, enum: ['orcamentos', 'execucao', 'concluido', null], default: null },
  orcamentos: [{
    prestador: String,
    telefone: String,
    descricao: String,
    valor: Number,
    validade: Date,
    arquivoUrl: String,      // link do arquivo (Google Drive ou outro)
    arquivoNome: String,
    arquivoDriveId: String,
    escolhido: { type: Boolean, default: false },
    dataCriacao: { type: Date, default: Date.now }
  }],
  // Encaminhamento dos orçamentos à seguradora / garantidora / jurídico / proprietário
  encaminhamento: {
    destino: { type: String, enum: ['seguradora', 'garantidora', 'juridico', 'proprietario', null], default: null },
    empresa: String,
    enviadoEm: Date,
    situacao: { type: String, enum: ['aguardando', 'aprovado', 'negado', 'pago', null], default: null },
    valorAprovado: Number,
    observacoes: String
  },
  pastaDrive: { id: String, url: String },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

// Configurações gerais guardadas no banco (ex.: pasta raiz do Google Drive)
const configSchema = new mongoose.Schema({ chave: { type: String, unique: true }, valor: String });
const Config = mongoose.model('Config', configSchema);

// ===== GOOGLE DRIVE (V36) =====
// Usa OAuth com a conta Google da imobiliária. Variáveis no Render:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// Escopo "drive.file": o sistema só enxerga as pastas e arquivos que ele mesmo criou.
// A pasta raiz "Integrativa Desocupação - Orçamentos" é criada na primeira vez (ou use GOOGLE_DRIVE_PASTA_RAIZ_ID).
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = process.env.GOOGLE_DRIVE_API || 'https://www.googleapis.com/drive/v3';
const GOOGLE_UPLOAD_API = process.env.GOOGLE_UPLOAD_API || 'https://www.googleapis.com/upload/drive/v3';
const NOME_PASTA_RAIZ = 'Integrativa Desocupação - Orçamentos';
const TIPOS_ARQUIVO_PERMITIDOS = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

function driveConfigurado() {
  return !!(credencialGoogle('GOOGLE_CLIENT_ID') && credencialGoogle('GOOGLE_CLIENT_SECRET') && credencialGoogle('GOOGLE_REFRESH_TOKEN'));
}

// Lê uma credencial do Google ignorando espaços, quebras de linha e aspas coladas por engano
// (esses valores nunca têm espaços de verdade)
function credencialGoogle(nome) {
  return String(process.env[nome] || '').replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
}

let tokenDrive = { valor: null, expiraEm: 0 };

async function driveToken() {
  if (tokenDrive.valor && Date.now() < tokenDrive.expiraEm - 60000) return tokenDrive.valor;
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credencialGoogle('GOOGLE_CLIENT_ID'),
      client_secret: credencialGoogle('GOOGLE_CLIENT_SECRET'),
      refresh_token: credencialGoogle('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token'
    })
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.access_token) {
    const dicas = {
      invalid_client: 'confira GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Render',
      invalid_grant: 'o GOOGLE_REFRESH_TOKEN expirou ou foi revogado; gere outro no OAuth Playground',
      unauthorized_client: 'o refresh token foi gerado com outro ID do cliente'
    };
    const dica = dicas[dados.error] ? ` — ${dicas[dados.error]}` : '';
    throw new Error(`autorização do Google recusada (${dados.error || resp.status})${dica}`);
  }
  tokenDrive = { valor: dados.access_token, expiraEm: Date.now() + (dados.expires_in || 3600) * 1000 };
  return tokenDrive.valor;
}

async function driveCriarPasta(nome, paiId) {
  const resp = await fetch(`${GOOGLE_DRIVE_API}/files?fields=id,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await driveToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', ...(paiId ? { parents: [paiId] } : {}) })
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.id) throw new Error(`falha ao criar pasta (${dados.error?.message || resp.status})`);
  return dados;
}

async function drivePastaRaiz() {
  if (process.env.GOOGLE_DRIVE_PASTA_RAIZ_ID) return process.env.GOOGLE_DRIVE_PASTA_RAIZ_ID;
  const salva = await Config.findOne({ chave: 'drivePastaRaizId' });
  if (salva && salva.valor) return salva.valor;
  const pasta = await driveCriarPasta(NOME_PASTA_RAIZ, null);
  await new Config({ chave: 'drivePastaRaizId', valor: pasta.id }).save();
  return pasta.id;
}

// Uma pasta por imóvel: "CA1814-2 - Rua Ilda Carrara Canevarollo 205"
async function garantirPastaDoContrato(contrato) {
  if (contrato.pastaDrive && contrato.pastaDrive.id) return contrato.pastaDrive.id;
  const nome = `${contrato.contrato || 'Contrato'} - ${contrato.endereco || contrato.locatario || ''}`
    .replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
  const pasta = await driveCriarPasta(nome, await drivePastaRaiz());
  contrato.pastaDrive = { id: pasta.id, url: pasta.webViewLink };
  return pasta.id;
}

async function driveEnviarArquivo(nome, tipo, conteudo, pastaId) {
  const limite = `limite_${crypto.randomBytes(12).toString('hex')}`;
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nome, parents: [pastaId] })}\r\n`),
    Buffer.from(`--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${limite}--`)
  ]);
  const resp = await fetch(`${GOOGLE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await driveToken()}`, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: corpo
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.id) throw new Error(`falha no envio (${dados.error?.message || resp.status})`);
  return dados;
}

const ETAPAS_RESCISAO = ['transferenciaContas', 'calculoDebitos', 'descontoReparos', 'caucao', 'termoAssinado'];

// Grava/limpa a data de conclusão conforme todas as etapas estejam marcadas
function atualizarConclusaoRescisao(contrato) {
  const todas = ETAPAS_RESCISAO.every(k => contrato.get(`rescisao.${k}`) === true);
  if (todas && !contrato.get('rescisao.concluidaEm')) contrato.set('rescisao.concluidaEm', new Date());
  if (!todas) contrato.set('rescisao.concluidaEm', undefined);
}

// USUÁRIOS (V34)
const usuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senhaHash: { type: String, required: true },
  papel: { type: String, enum: ['admin', 'usuario'], default: 'usuario' },
  ativo: { type: Boolean, default: true },
  trocarSenha: { type: Boolean, default: false }, // obriga a trocar a senha no próximo acesso
  senhaAlteradaEm: Date,                          // sessões abertas antes disso deixam de valer
  ultimoAcesso: Date,
  dataCriacao: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

function usuarioPublico(u) {
  return {
    id: String(u._id), nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo,
    trocarSenha: !!u.trocarSenha, ultimoAcesso: u.ultimoAcesso || null, dataCriacao: u.dataCriacao || null
  };
}

function emailValido(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function senhaValida(senha) {
  return typeof senha === 'string' && senha.length >= SENHA_MINIMA;
}

function agoraEmSegundos() {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

function gerarToken(u) {
  return jwt.sign({ id: String(u._id), papel: u.papel }, JWT_SECRET, { expiresIn: DURACAO_SESSAO });
}

async function contarAdminsAtivos() {
  return Usuario.countDocuments({ papel: 'admin', ativo: true });
}

// Cria o primeiro administrador a partir das variáveis ADMIN_EMAIL e ADMIN_SENHA (só se não houver usuários)
async function criarAdminInicial() {
  const total = await Usuario.countDocuments({});
  if (total > 0) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || '';
  if (!emailValido(email) || !senhaValida(senha)) {
    console.warn(`⚠️  Nenhum usuário cadastrado. Configure ADMIN_EMAIL e ADMIN_SENHA (mín. ${SENHA_MINIMA} caracteres) no Render para criar o primeiro administrador.`);
    return;
  }
  const admin = new Usuario({
    nome: process.env.ADMIN_NOME || 'Administrador', email, papel: 'admin',
    senhaHash: await bcrypt.hash(senha, 10), trocarSenha: true
  });
  await admin.save();
  console.log(`✅ Administrador inicial criado: ${email} (deverá trocar a senha no primeiro acesso)`);
}

// Limite de tentativas de login: 5 erros a cada 15 minutos por IP + e-mail
const tentativasLogin = new Map();
const LIMITE_TENTATIVAS = 5;
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

function chaveTentativa(req, email) { return `${req.ip}|${email}`; }

function bloqueadoPorTentativas(chave) {
  const t = tentativasLogin.get(chave);
  if (!t) return false;
  if (Date.now() - t.inicio > JANELA_TENTATIVAS_MS) { tentativasLogin.delete(chave); return false; }
  return t.erros >= LIMITE_TENTATIVAS;
}

function registrarErroLogin(chave) {
  const t = tentativasLogin.get(chave);
  if (!t || Date.now() - t.inicio > JANELA_TENTATIVAS_MS) tentativasLogin.set(chave, { erros: 1, inicio: Date.now() });
  else t.erros++;
}

// Exige um token válido de um usuário ativo
async function exigirLogin(req, res, next) {
  try {
    const cab = req.headers.authorization || '';
    const token = cab.startsWith('Bearer ') ? cab.slice(7) : null;
    if (!token) return res.status(401).json({ sucesso: false, erro: 'Faça login para continuar' });

    const dados = jwt.verify(token, JWT_SECRET);
    const u = await Usuario.findById(dados.id);
    if (!u || !u.ativo) return res.status(401).json({ sucesso: false, erro: 'Acesso não autorizado' });
    if (u.senhaAlteradaEm && dados.iat * 1000 < u.senhaAlteradaEm.getTime()) {
      return res.status(401).json({ sucesso: false, erro: 'Sessão expirada. Entre novamente.' });
    }
    req.usuario = u;
    next();
  } catch (erro) {
    return res.status(401).json({ sucesso: false, erro: 'Sessão inválida ou expirada. Entre novamente.' });
  }
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== 'admin') {
    return res.status(403).json({ sucesso: false, erro: 'Apenas administradores podem fazer isso' });
  }
  next();
}

// CONECTAR MONGODB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { console.log('✅ MongoDB conectado'); return criarAdminInicial(); })
  .catch(err => console.error('❌ Erro:', err));

// ROTAS

// Servir HTML na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'V34-Login' });
});

// LOGIN (público)
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const chave = chaveTentativa(req, email);

    if (bloqueadoPorTentativas(chave)) {
      return res.status(429).json({ sucesso: false, erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
    }

    const u = email ? await Usuario.findOne({ email }) : null;
    // Compara mesmo quando o e-mail não existe, para o tempo de resposta não revelar quem é usuário
    const senhaOk = await bcrypt.compare(senha, u ? u.senhaHash : HASH_FICTICIO) && !!u && u.ativo;
    if (!senhaOk) {
      registrarErroLogin(chave);
      return res.status(401).json({ sucesso: false, erro: 'E-mail ou senha incorretos' });
    }

    tentativasLogin.delete(chave);
    u.ultimoAcesso = new Date();
    await u.save();
    res.json({ sucesso: true, token: gerarToken(u), usuario: usuarioPublico(u) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ===== A PARTIR DAQUI, TODA ROTA /api EXIGE LOGIN =====
app.use('/api', exigirLogin);

// Quem está logado
app.get('/api/auth/me', (req, res) => {
  res.json({ sucesso: true, usuario: usuarioPublico(req.usuario) });
});

// Trocar a própria senha
app.post('/api/auth/alterar-senha', async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const u = req.usuario;
    if (!(await bcrypt.compare(String(senhaAtual || ''), u.senhaHash))) {
      return res.status(400).json({ sucesso: false, erro: 'Senha atual incorreta' });
    }
    if (!senhaValida(novaSenha)) {
      return res.status(400).json({ sucesso: false, erro: `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres` });
    }
    if (await bcrypt.compare(novaSenha, u.senhaHash)) {
      return res.status(400).json({ sucesso: false, erro: 'A nova senha precisa ser diferente da atual' });
    }
    u.senhaHash = await bcrypt.hash(novaSenha, 10);
    u.trocarSenha = false;
    u.senhaAlteradaEm = agoraEmSegundos(); // derruba as outras sessões abertas
    await u.save();
    res.json({ sucesso: true, token: gerarToken(u), usuario: usuarioPublico(u) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// USUÁRIOS (somente administradores)
app.get('/api/usuarios', exigirAdmin, async (req, res) => {
  try {
    const lista = (await Usuario.find({})).map(usuarioPublico).sort((a, b) => a.nome.localeCompare(b.nome));
    res.json({ sucesso: true, usuarios: lista });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.post('/api/usuarios', exigirAdmin, async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha;
    const papel = req.body.papel === 'admin' ? 'admin' : 'usuario';

    if (!nome) return res.status(400).json({ sucesso: false, erro: 'Informe o nome' });
    if (!emailValido(email)) return res.status(400).json({ sucesso: false, erro: 'E-mail inválido' });
    if (!senhaValida(senha)) return res.status(400).json({ sucesso: false, erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres` });
    if (await Usuario.findOne({ email })) return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário com este e-mail' });

    const u = new Usuario({ nome, email, papel, senhaHash: await bcrypt.hash(senha, 10), trocarSenha: true });
    await u.save();
    res.status(201).json({ sucesso: true, usuario: usuarioPublico(u) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Editar nome/papel, ativar/desativar ou redefinir a senha de um usuário
app.put('/api/usuarios/:id', exigirAdmin, async (req, res) => {
  try {
    const u = await Usuario.findById(req.params.id);
    if (!u) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });
    const eleMesmo = String(u._id) === String(req.usuario._id);

    const novoPapel = req.body.papel === undefined ? u.papel : (req.body.papel === 'admin' ? 'admin' : 'usuario');
    const novoAtivo = typeof req.body.ativo === 'boolean' ? req.body.ativo : u.ativo;

    // Nunca deixar o sistema sem administrador ativo, nem o admin se bloquear sozinho
    if (eleMesmo && (!novoAtivo || novoPapel !== 'admin')) {
      return res.status(400).json({ sucesso: false, erro: 'Você não pode desativar nem remover o acesso de administrador da sua própria conta' });
    }
    if (u.papel === 'admin' && u.ativo && (novoPapel !== 'admin' || !novoAtivo) && (await contarAdminsAtivos()) <= 1) {
      return res.status(400).json({ sucesso: false, erro: 'É preciso manter pelo menos um administrador ativo' });
    }

    if (req.body.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome) return res.status(400).json({ sucesso: false, erro: 'Informe o nome' });
      u.nome = nome;
    }
    u.papel = novoPapel;
    if (u.ativo && !novoAtivo) u.senhaAlteradaEm = agoraEmSegundos(); // derruba as sessões de quem foi desativado
    u.ativo = novoAtivo;

    if (req.body.novaSenha !== undefined) {
      if (!senhaValida(req.body.novaSenha)) {
        return res.status(400).json({ sucesso: false, erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres` });
      }
      u.senhaHash = await bcrypt.hash(req.body.novaSenha, 10);
      u.trocarSenha = !eleMesmo;
      u.senhaAlteradaEm = agoraEmSegundos();
    }

    await u.save();
    res.json({ sucesso: true, usuario: usuarioPublico(u) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// GET contratos
app.get('/api/contracts', async (req, res) => {
  try {
    const contratos = await Contract.find();
    res.json({ sucesso: true, contratos });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// GET um contrato
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// CREATE contrato
app.post('/api/contracts', async (req, res) => {
  try {
    const novoContrato = new Contract({
      contrato: req.body.contrato,
      locatario: req.body.locatario,
      endereco: req.body.endereco,
      tipoDesocupacao: req.body.tipoDesocupacao || 'comum',
      comunicacaoInquilino: req.body.comunicacaoInquilino,
      agendamentoVistoria: req.body.agendamentoVistoria,
      entregaChaves: req.body.entregaChaves,
      dataRetiradaChaves: req.body.dataRetiradaChaves,
      dataDevolucaoChaves: req.body.dataDevolucaoChaves,
      statusChaves: req.body.statusChaves || 'pendente',
      finalizado: req.body.finalizado || 'nao',
      dataFinalizacao: req.body.finalizado === 'sim' ? new Date() : undefined,
      rescisao: req.body.finalizado === 'sim' ? { encaminhadoEm: new Date() } : undefined,
      responsavel: req.body.responsavel,
      prioridade: req.body.prioridade || 'media',
      statusImovel: req.body.statusImovel || 'em-desocupacao',
      dataDisponivelAluguel: req.body.dataDisponivelAluguel,
      reparos: req.body.reparos || []
    });
    await novoContrato.save();
    res.status(201).json({ sucesso: true, contrato: novoContrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// UPDATE contrato (COM TIPO!)
app.put('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });

    contrato.locatario = req.body.locatario || contrato.locatario;
    contrato.endereco = req.body.endereco || contrato.endereco;
    contrato.tipoDesocupacao = req.body.tipoDesocupacao || contrato.tipoDesocupacao;
    contrato.comunicacaoInquilino = req.body.comunicacaoInquilino || contrato.comunicacaoInquilino;
    contrato.agendamentoVistoria = req.body.agendamentoVistoria || contrato.agendamentoVistoria;
    contrato.entregaChaves = req.body.entregaChaves || contrato.entregaChaves;
    contrato.dataRetiradaChaves = req.body.dataRetiradaChaves || contrato.dataRetiradaChaves;
    contrato.dataDevolucaoChaves = req.body.dataDevolucaoChaves || contrato.dataDevolucaoChaves;
    contrato.statusChaves = req.body.statusChaves || contrato.statusChaves;
    // Data de finalização: grava quando passa para "sim" e limpa se voltar para "nao"
    const estavaFinalizado = contrato.finalizado === 'sim';
    contrato.finalizado = req.body.finalizado || contrato.finalizado;
    if (contrato.finalizado === 'sim' && !estavaFinalizado) {
      contrato.dataFinalizacao = new Date();
      // Encaminha ao administrativo para a rescisão (mantém a data se já tinha sido encaminhado)
      if (!contrato.get('rescisao.encaminhadoEm')) {
        contrato.set('rescisao.encaminhadoEm', new Date());
      }
    } else if (contrato.finalizado !== 'sim') {
      contrato.dataFinalizacao = undefined;
    }
    contrato.responsavel = req.body.responsavel || contrato.responsavel;
    contrato.prioridade = req.body.prioridade || contrato.prioridade;
    contrato.statusImovel = req.body.statusImovel || contrato.statusImovel;
    contrato.dataDisponivelAluguel = req.body.dataDisponivelAluguel || contrato.dataDisponivelAluguel;
    // V36: garantia e fase dos reparos ('' limpa o campo)
    if (req.body.garantiaTipo !== undefined) contrato.garantiaTipo = req.body.garantiaTipo || null;
    if (req.body.garantiaEmpresa !== undefined) contrato.garantiaEmpresa = String(req.body.garantiaEmpresa || '').trim();
    if (req.body.faseReparo !== undefined) contrato.faseReparo = req.body.faseReparo || null;
    else if (req.body.statusImovel === 'em-reparo') entrarEmOrcamentos(contrato);
    contrato.dataAtualizacao = new Date();

    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ===== ORÇAMENTOS (V36) =====
function dadosOrcamento(body) {
  const d = {};
  ['prestador', 'telefone', 'descricao', 'arquivoUrl', 'arquivoNome'].forEach(k => {
    if (body[k] !== undefined) d[k] = String(body[k] || '').trim();
  });
  if (body.valor !== undefined) d.valor = Number(body.valor) > 0 ? Number(body.valor) : undefined;
  if (body.validade !== undefined) d.validade = body.validade || undefined;
  if (typeof body.escolhido === 'boolean') d.escolhido = body.escolhido;
  return d;
}

function entrarEmOrcamentos(contrato) {
  if (contrato.finalizado !== 'sim' && (!contrato.faseReparo || contrato.faseReparo === 'concluido')) {
    contrato.faseReparo = 'orcamentos';
  }
}

app.post('/api/contracts/:id/orcamentos', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    const d = dadosOrcamento(req.body);
    if (!d.prestador) return res.status(400).json({ sucesso: false, erro: 'Informe o prestador' });
    contrato.orcamentos.push(d);
    entrarEmOrcamentos(contrato);
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.status(201).json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.put('/api/contracts/:id/orcamentos/:oid', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    const orc = contrato.orcamentos.id(req.params.oid);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });
    const d = dadosOrcamento(req.body);
    if (d.prestador === '') return res.status(400).json({ sucesso: false, erro: 'Informe o prestador' });
    // Só um orçamento pode ser o escolhido
    if (d.escolhido === true) contrato.orcamentos.forEach(o => { o.escolhido = false; });
    orc.set(d);
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.delete('/api/contracts/:id/orcamentos/:oid', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    const orc = contrato.orcamentos.id(req.params.oid);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });
    orc.deleteOne();
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Envia o arquivo do orçamento (PDF/imagem em base64) para a pasta do imóvel no Google Drive
app.post('/api/contracts/:id/orcamentos/:oid/arquivo', async (req, res) => {
  try {
    if (!driveConfigurado()) {
      return res.status(400).json({ sucesso: false, erro: 'Google Drive não configurado. Cole o link do arquivo no orçamento.' });
    }
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    const orc = contrato.orcamentos.id(req.params.oid);
    if (!orc) return res.status(404).json({ sucesso: false, erro: 'Orçamento não encontrado' });

    const nome = String(req.body.nome || 'orcamento').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const tipo = String(req.body.tipo || 'application/octet-stream');
    const conteudo = Buffer.from(String(req.body.base64 || ''), 'base64');
    if (!conteudo.length) return res.status(400).json({ sucesso: false, erro: 'Arquivo vazio' });
    if (!TIPOS_ARQUIVO_PERMITIDOS.includes(tipo)) {
      return res.status(400).json({ sucesso: false, erro: 'Envie PDF, imagem (JPG/PNG) ou documento do Word' });
    }

    const pastaId = await garantirPastaDoContrato(contrato);
    const prefixo = (orc.prestador || 'orcamento').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const arquivo = await driveEnviarArquivo(`${prefixo} - ${nome}`, tipo, conteudo, pastaId);

    orc.arquivoDriveId = arquivo.id;
    orc.arquivoUrl = arquivo.webViewLink;
    orc.arquivoNome = nome;
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    console.error('❌ Google Drive:', erro.message);
    res.status(502).json({ sucesso: false, erro: `Não foi possível enviar ao Google Drive: ${erro.message}` });
  }
});

// Encaminhamento dos orçamentos (seguradora / garantidora / jurídico / proprietário)
app.put('/api/contracts/:id/encaminhamento', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    const b = req.body;
    if (b.destino !== undefined) contrato.set('encaminhamento.destino', b.destino || null);
    if (b.empresa !== undefined) contrato.set('encaminhamento.empresa', String(b.empresa || '').trim());
    if (b.enviadoEm !== undefined) contrato.set('encaminhamento.enviadoEm', b.enviadoEm || undefined);
    if (b.situacao !== undefined) contrato.set('encaminhamento.situacao', b.situacao || null);
    if (b.valorAprovado !== undefined) contrato.set('encaminhamento.valorAprovado', Number(b.valorAprovado) > 0 ? Number(b.valorAprovado) : undefined);
    if (b.observacoes !== undefined) contrato.set('encaminhamento.observacoes', String(b.observacoes || ''));
    // Aprovado ou pago: o reparo pode começar
    if (['aprovado', 'pago'].includes(contrato.get('encaminhamento.situacao')) && contrato.faseReparo === 'orcamentos') {
      contrato.faseReparo = 'execucao';
    }
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Repassa os orçamentos ao administrativo: já abre a rescisão, mesmo antes de finalizar a desocupação
app.post('/api/contracts/:id/enviar-administrativo', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    if (!contrato.orcamentos.length) {
      return res.status(400).json({ sucesso: false, erro: 'Cadastre os orçamentos antes de enviar ao administrativo' });
    }
    if (!contrato.get('rescisao.encaminhadoEm')) contrato.set('rescisao.encaminhadoEm', new Date());
    contrato.set('rescisao.orcamentosEnviadosEm', new Date());
    contrato.dataAtualizacao = new Date();
    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/api/drive/status', (req, res) => {
  res.json({ sucesso: true, configurado: driveConfigurado() });
});

// RESCISÃO (V33) - encaminhar ao administrativo e atualizar o checklist
// Corpo aceito: { encaminhar: true, responsavel, observacoes, transferenciaContas, calculoDebitos,
//                 descontoReparos, caucao, termoAssinado }
app.put('/api/contracts/:id/rescisao', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    // V36: a rescisão também pode ter sido aberta antes, quando os orçamentos foram enviados ao administrativo
    if (contrato.finalizado !== 'sim' && !contrato.get('rescisao.encaminhadoEm')) {
      return res.status(400).json({ sucesso: false, erro: 'Finalize a desocupação antes de encaminhar a rescisão' });
    }

    if (!contrato.get('rescisao.encaminhadoEm')) {
      contrato.set('rescisao.encaminhadoEm', new Date());
    }
    if (req.body.responsavel !== undefined) contrato.set('rescisao.responsavel', String(req.body.responsavel).trim());
    if (req.body.observacoes !== undefined) contrato.set('rescisao.observacoes', String(req.body.observacoes));
    ETAPAS_RESCISAO.forEach(k => {
      if (typeof req.body[k] === 'boolean') contrato.set(`rescisao.${k}`, req.body[k]);
    });
    atualizarConclusaoRescisao(contrato);
    contrato.dataAtualizacao = new Date();

    await contrato.save();
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// DELETE contrato
app.delete('/api/contracts/:id', async (req, res) => {
  try {
    await Contract.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true, mensagem: 'Deletado' });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// REPAROS
app.post('/api/repairs/:contractId', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.contractId);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });

    contrato.reparos.push({
      descricao: req.body.descricao,
      urgencia: req.body.urgencia,
      responsavel: req.body.responsavel,
      dataLimite: req.body.dataLimite,
      status: 'PENDENTE',
      dataCriacao: new Date(),
      // V35: o formulário já enviava estes campos, mas o servidor não salvava
      prestadorNome: req.body.prestadorNome || undefined,
      prestadorTelefone: req.body.prestadorTelefone || undefined,
      prestadorEmail: req.body.prestadorEmail || undefined,
      prestadorEspecialidade: req.body.prestadorEspecialidade || undefined,
      dataRetiradaChaves: req.body.dataRetiradaChaves || undefined,
      dataDevolucaoChaves: req.body.dataDevolucaoChaves || undefined,
      valorServico: Number(req.body.valorServico) > 0 ? Number(req.body.valorServico) : undefined
    });
    entrarEmOrcamentos(contrato); // V36: reparo novo começa pelos orçamentos
    contrato.dataAtualizacao = new Date();
    await contrato.save();

    res.status(201).json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/api/repairs/:contractId', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.contractId);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });
    res.json({ sucesso: true, reparos: contrato.reparos });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.put('/api/repairs/:contractId/:reparoId', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.contractId);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });

    const reparo = contrato.reparos.id(req.params.reparoId);
    if (!reparo) return res.status(404).json({ sucesso: false, erro: 'Reparo não encontrado' });

    reparo.status = req.body.status || reparo.status;
    reparo.dataConclusao = req.body.status === 'CONCLUIDO' ? new Date() : null;
    // V36: todos os reparos concluídos durante a execução → fase concluída
    if (contrato.faseReparo === 'execucao' && contrato.reparos.every(r => r.status === 'CONCLUIDO')) {
      contrato.faseReparo = 'concluido';
    }
    if (req.body.status && req.body.status !== 'CONCLUIDO' && contrato.faseReparo === 'concluido') {
      contrato.faseReparo = 'execucao';
    }

    contrato.dataAtualizacao = new Date();
    await contrato.save();

    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.delete('/api/repairs/:contractId/:reparoId', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.contractId);
    if (!contrato) return res.status(404).json({ sucesso: false, erro: 'Não encontrado' });

    contrato.reparos.id(req.params.reparoId).deleteOne();
    contrato.dataAtualizacao = new Date();
    await contrato.save();

    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// SEED (somente administradores)
app.post('/api/seed', exigirAdmin, async (req, res) => {
  try {
    const existe = await Contract.findOne({ contrato: 'CA0535/1' });
    if (existe) return res.json({ sucesso: false, mensagem: 'Banco já populado' });

    const contratos = [
      { contrato: 'CA0535/1', locatario: 'Município de Olímpia', endereco: 'R. Conselheiro Antônio Prado 230', tipoDesocupacao: 'comum' },
      { contrato: 'CA1814/2', locatario: 'Andre Ruiz Spegiorin', endereco: 'Rua Ilda Carrara Canevarollo 205', tipoDesocupacao: 'comum' },
      { contrato: 'CA1374/3', locatario: 'Maria de Lourdes Barriento', endereco: 'Rua Expedicionário Lonildo Porcionato 42', tipoDesocupacao: 'comum' },
      { contrato: 'CA1979/1', locatario: 'Leonilda São Jose da Silva', endereco: 'Rua do Tico-tico 308', tipoDesocupacao: 'comum' },
      { contrato: 'CA1338/2', locatario: 'Richard Alexssander de Matos', endereco: 'Rua Paschoal Michelli 82', tipoDesocupacao: 'comum' },
      { contrato: 'AP0208/2', locatario: 'Aléxia Andreia Lomba', endereco: 'Alameda das Orquídeas 125, Apto 12', tipoDesocupacao: 'comum' },
      { contrato: 'CA2796/1', locatario: 'Olivia Aparecida Pimenta', endereco: 'Rua Adevar José de Castro 48', tipoDesocupacao: 'comum' },
      { contrato: 'CA2762/1', locatario: 'Daniel Costa Paraguassu', endereco: 'Rua Doutor Otávio Lopez Ferraz 622', tipoDesocupacao: 'comum' },
      { contrato: 'CA2902/1', locatario: 'Naila Aparecida de Sá Gimente', endereco: 'Rua Alexandre Bonini 85', tipoDesocupacao: 'comum' },
      { contrato: 'CA2458/1', locatario: 'Dionatan Vieira Costa', endereco: 'Rua Sebastião Marins 149', tipoDesocupacao: 'comum' }
    ];

    await Contract.insertMany(contratos);
    res.json({ sucesso: true, mensagem: '✅ Banco populado!' });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// START
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Servidor V34-Login rodando na porta ${PORT}`);
});
