import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

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
    prestadorNome: String,
    prestadorTelefone: String,
    prestadorEmail: String,
    prestadorEspecialidade: String,
    dataRetiradaChaves: Date,
    dataDevolucaoChaves: Date,
    valorServico: Number
  }],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

// CONECTAR MONGODB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(erro => console.error('❌ Erro MongoDB:', erro));

// ════════════════════════════════════════════════════════════════
// SISTEMA DE BACKUP AUTOMÁTICO (V31)
// ════════════════════════════════════════════════════════════════

// Criar pasta de backups se não existir
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('📁 Pasta de backups criada:', BACKUP_DIR);
}

// Função para fazer backup
async function fazerBackup() {
  try {
    console.log('🔄 [BACKUP] Iniciando backup...');
    
    const contratos = await Contract.find().lean();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeArquivo = `backup_${timestamp}.json`;
    const caminhoBackup = path.join(BACKUP_DIR, nomeArquivo);
    
    // Dados do backup
    const dadosBackup = {
      timestamp: new Date().toISOString(),
      total: contratos.length,
      versao: 'V31',
      dados: contratos
    };
    
    // Salvar arquivo JSON
    fs.writeFileSync(caminhoBackup, JSON.stringify(dadosBackup, null, 2));
    
    console.log(`✅ [BACKUP] Backup salvo: ${nomeArquivo}`);
    console.log(`📊 [BACKUP] Total de contratos: ${contratos.length}`);
    
    // Limpar backups antigos (manter apenas 30 dias)
    const arquivos = fs.readdirSync(BACKUP_DIR).sort().reverse();
    if (arquivos.length > 30) {
      const aRemover = arquivos.slice(30);
      aRemover.forEach(arquivo => {
        fs.unlinkSync(path.join(BACKUP_DIR, arquivo));
      });
      console.log(`🗑️  [BACKUP] ${aRemover.length} backup(s) antigo(s) removido(s)`);
    }
    
    return { sucesso: true, arquivo: nomeArquivo, total: contratos.length };
  } catch (erro) {
    console.error('❌ [BACKUP] Erro:', erro.message);
    return { sucesso: false, erro: erro.message };
  }
}

// AGENDAR BACKUP DIÁRIO (2:00 AM)
cron.schedule('0 2 * * *', async () => {
  console.log('\n⏰ [AGENDADOR] Hora de fazer backup diário...');
  await fazerBackup();
});

console.log('⏰ [AGENDADOR] Backup automático agendado para 2:00 AM diariamente');

// ════════════════════════════════════════════════════════════════
// ENDPOINTS DE BACKUP
// ════════════════════════════════════════════════════════════════

// FAZER BACKUP MANUAL
app.post('/api/backup/fazer', async (req, res) => {
  const resultado = await fazerBackup();
  res.json(resultado);
});

// LISTAR BACKUPS DISPONÍVEIS
app.get('/api/backup/listar', (req, res) => {
  try {
    const arquivos = fs.readdirSync(BACKUP_DIR).sort().reverse();
    
    const backups = arquivos.map(arquivo => {
      const caminho = path.join(BACKUP_DIR, arquivo);
      const stats = fs.statSync(caminho);
      const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
      
      return {
        arquivo,
        data: stats.birthtime,
        tamanho: (stats.size / 1024).toFixed(2) + ' KB',
        total: conteudo.total,
        timestamp: conteudo.timestamp
      };
    });
    
    res.json({
      sucesso: true,
      total: backups.length,
      backups: backups
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// BAIXAR BACKUP ESPECÍFICO
app.get('/api/backup/download/:arquivo', (req, res) => {
  try {
    const { arquivo } = req.params;
    const caminho = path.join(BACKUP_DIR, arquivo);
    
    // Validação de segurança (evitar path traversal)
    if (!arquivo.startsWith('backup_') || !arquivo.endsWith('.json')) {
      return res.status(400).json({ sucesso: false, erro: 'Arquivo inválido' });
    }
    
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ sucesso: false, erro: 'Backup não encontrado' });
    }
    
    res.download(caminho, arquivo);
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// RESTAURAR DE UM BACKUP
app.post('/api/backup/restaurar/:arquivo', async (req, res) => {
  try {
    const { arquivo } = req.params;
    const caminho = path.join(BACKUP_DIR, arquivo);
    
    // Validação
    if (!arquivo.startsWith('backup_') || !arquivo.endsWith('.json')) {
      return res.status(400).json({ sucesso: false, erro: 'Arquivo inválido' });
    }
    
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ sucesso: false, erro: 'Backup não encontrado' });
    }
    
    const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    
    // Perguntar confirmação antes de restaurar (no frontend)
    if (!req.body.confirmar) {
      return res.json({
        sucesso: false,
        requerConfirmacao: true,
        mensagem: `⚠️ Restaurar ${conteudo.total} contratos de ${conteudo.timestamp}?`
      });
    }
    
    // Limpar contratos atuais
    await Contract.deleteMany({});
    
    // Inserir dados do backup
    await Contract.insertMany(conteudo.dados);
    
    console.log(`✅ [RESTAURO] ${conteudo.total} contratos restaurados`);
    
    res.json({
      sucesso: true,
      mensagem: `✅ ${conteudo.total} contratos restaurados com sucesso!`,
      total: conteudo.total
    });
  } catch (erro) {
    console.error('❌ [RESTAURO] Erro:', erro.message);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ESTATÍSTICAS DE BACKUP
app.get('/api/backup/stats', (req, res) => {
  try {
    const arquivos = fs.readdirSync(BACKUP_DIR);
    let tamanhoTotal = 0;
    
    arquivos.forEach(arquivo => {
      const stats = fs.statSync(path.join(BACKUP_DIR, arquivo));
      tamanhoTotal += stats.size;
    });
    
    res.json({
      sucesso: true,
      totalBackups: arquivos.length,
      tamanhoTotal: (tamanhoTotal / (1024 * 1024)).toFixed(2) + ' MB',
      ultimoBackup: arquivos.length > 0 ? arquivos[arquivos.length - 1] : null
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS EXISTENTES (MANTIDOS)
// ════════════════════════════════════════════════════════════════

// GET TODOS OS CONTRATOS
app.get('/api/contracts', async (req, res) => {
  try {
    const contratos = await Contract.find();
    res.json(contratos);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// GET CONTRATO POR ID
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' });
    res.json(contrato);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// CREATE CONTRATO
app.post('/api/contracts', async (req, res) => {
  try {
    const contrato = new Contract(req.body);
    await contrato.save();
    res.json(contrato);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// UPDATE CONTRATO
app.put('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(contrato);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// DELETE CONTRATO
app.delete('/api/contracts/:id', async (req, res) => {
  try {
    await Contract.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Contrato deletado' });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// EXPORTAR DADOS
app.get('/api/export', async (req, res) => {
  try {
    const contratos = await Contract.find({}).lean();
    res.json({
      sucesso: true,
      total: contratos.length,
      data: contratos,
      timestamp: new Date().toISOString()
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/api/export/json', async (req, res) => {
  try {
    const contratos = await Contract.find({}).lean();
    res.setHeader('Content-Disposition', 'attachment; filename="contratos-backup.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(contratos);
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/api/export/csv', async (req, res) => {
  try {
    const contratos = await Contract.find({}).lean();
    
    if (contratos.length === 0) {
      return res.json({ sucesso: false, mensagem: 'Nenhum contrato encontrado' });
    }

    const headers = ['Contrato', 'Locatário', 'Endereço', 'Tipo Desocupação', 'Status Imóvel', 'Finalizado'];
    const rows = contratos.map(c => [
      c.contrato || '',
      c.locatario || '',
      c.endereco || '',
      c.tipoDesocupacao || '',
      c.statusImovel || '',
      c.finalizado || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Disposition', 'attachment; filename="contratos-backup.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// SEED (Restaurar dados de teste)
app.post('/api/seed', async (req, res) => {
  try {
    const contratos = [
      { contrato: 'CA0535/1', locatario: 'Município de Olímpia', endereco: 'R. Conselheiro Antônio Prado 230', tipoDesocupacao: 'comum', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA1814/2', locatario: 'Andre Ruiz Spegiorin', endereco: 'Rua Ilda Carrara Canevarollo 205', tipoDesocupacao: 'comum', statusImovel: 'pronto-para-aluguel', finalizado: 'sim' },
      { contrato: 'CA1374/3', locatario: 'Maria de Lourdes Barriento', endereco: 'Rua Expedicionário Lonildo Porcionato 42', tipoDesocupacao: 'comum', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA1979/1', locatario: 'Leonilda São Jose da Silva', endereco: 'Rua do Tico-tico 308', tipoDesocupacao: 'comum', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA1338/2', locatario: 'Richard Alexssander de Matos', endereco: 'Rua Paschoal Michelli 82', tipoDesocupacao: 'comum', statusImovel: 'pronto-para-aluguel', finalizado: 'sim' },
      { contrato: 'AP0208/2', locatario: 'Aléxia Andreia Lomba', endereco: 'Alameda das Orquídeas 125, Apto 12', tipoDesocupacao: 'comum', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA2796/1', locatario: 'Olivia Aparecida Pimenta', endereco: 'Rua Adevar José de Castro 48', tipoDesocupacao: 'comum', statusImovel: 'pronto-para-aluguel', finalizado: 'sim' },
      { contrato: 'CA2762/1', locatario: 'Daniel Costa Paraguassu', endereco: 'Rua Doutor Otávio Lopez Ferraz 622', tipoDesocupacao: 'despejo', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA2902/1', locatario: 'Naila Aparecida de Sá Gimente', endereco: 'Rua Alexandre Bonini 85', tipoDesocupacao: 'comum', statusImovel: 'em-reparo', finalizado: 'nao' },
      { contrato: 'CA2458/1', locatario: 'Dionatan Vieira Costa', endereco: 'Rua Sebastião Marins 149', tipoDesocupacao: 'despejo', statusImovel: 'em-reparo', finalizado: 'nao' }
    ];
    
    await Contract.insertMany(contratos);
    res.json({ mensagem: '✅ Banco populado!' });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// START
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Servidor V31 rodando na porta ${PORT}`);
  console.log('🔐 Funcionalidades: Backup Automático + Contratos');
});
