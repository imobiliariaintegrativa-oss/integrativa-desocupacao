import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// SCHEMA
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
let mongodbConectado = false;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    mongodbConectado = true;
    console.log('✅ MongoDB conectado');
  })
  .catch(erro => {
    mongodbConectado = false;
    console.error('❌ Erro MongoDB:', erro.message);
  });

// ════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({
    sucesso: true,
    servidor: 'online',
    mongodb: mongodbConectado ? 'conectado' : 'desconectado',
    timestamp: new Date().toISOString(),
    versao: 'V31-ULTRA'
  });
});

// ════════════════════════════════════════════════════════════════
// BACKUP ULTRA SIMPLES
// ════════════════════════════════════════════════════════════════

// Usar /tmp para backups (mais confiável que pasta local)
const BACKUP_DIR = '/tmp/integrativa-backups';

// Criar pasta UMA ÚNICA VEZ no start
function inicializarBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o777 });
      console.log('✅ Pasta de backups criada:', BACKUP_DIR);
    }
  } catch (erro) {
    console.error('❌ Erro ao criar pasta de backups:', erro.message);
  }
}

inicializarBackup();

// FAZER BACKUP - VERSÃO ROBUSTA
app.post('/api/backup/fazer', async (req, res) => {
  try {
    console.log('\n🔄 [BACKUP] Iniciando...');

    // Verificar conexão MongoDB
    if (!mongodbConectado) {
      return res.status(500).json({
        sucesso: false,
        erro: 'MongoDB desconectado',
        debug: 'Servidor não está conectado ao MongoDB Atlas'
      });
    }

    console.log('[BACKUP] Buscando contratos...');
    const contratos = await Contract.find().lean();
    console.log(`[BACKUP] ${contratos.length} contratos encontrados`);

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const hora = String(agora.getHours()).padStart(2, '0');
    const minuto = String(agora.getMinutes()).padStart(2, '0');
    const segundo = String(agora.getSeconds()).padStart(2, '0');

    const nomeArquivo = `backup_${ano}${mes}${dia}_${hora}${minuto}${segundo}.json`;
    const caminhoBackup = `${BACKUP_DIR}/${nomeArquivo}`;

    console.log(`[BACKUP] Salvando em: ${caminhoBackup}`);

    const dadosBackup = {
      timestamp: agora.toISOString(),
      total: contratos.length,
      versao: 'V31-ULTRA',
      dados: contratos
    };

    // Salvar arquivo
    fs.writeFileSync(caminhoBackup, JSON.stringify(dadosBackup, null, 2));
    console.log(`✅ [BACKUP] Arquivo salvo: ${nomeArquivo}`);

    // Limpar backups antigos (manter 30)
    try {
      const arquivos = fs.readdirSync(BACKUP_DIR).sort().reverse();
      console.log(`[BACKUP] Total de backups: ${arquivos.length}`);

      if (arquivos.length > 30) {
        const aRemover = arquivos.slice(30);
        aRemover.forEach(arquivo => {
          try {
            fs.unlinkSync(`${BACKUP_DIR}/${arquivo}`);
            console.log(`[BACKUP] Deletado: ${arquivo}`);
          } catch (e) {
            console.log(`[BACKUP] Erro ao deletar ${arquivo}`);
          }
        });
      }
    } catch (e) {
      console.log('[BACKUP] Erro ao limpar backups antigos (não crítico)');
    }

    res.json({
      sucesso: true,
      arquivo: nomeArquivo,
      total: contratos.length,
      caminho: caminhoBackup,
      timestamp: agora.toISOString()
    });

  } catch (erro) {
    console.error('❌ [BACKUP] ERRO:', erro.message);
    console.error('[BACKUP] Stack:', erro.stack);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
      debug: 'Verifique os logs do servidor'
    });
  }
});

// LISTAR BACKUPS
app.get('/api/backup/listar', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({
        sucesso: true,
        total: 0,
        backups: [],
        mensagem: 'Nenhum backup ainda'
      });
    }

    const arquivos = fs.readdirSync(BACKUP_DIR).sort().reverse();

    const backups = arquivos.map(arquivo => {
      try {
        const caminhoCompleto = `${BACKUP_DIR}/${arquivo}`;
        const stats = fs.statSync(caminhoCompleto);
        const conteudo = JSON.parse(fs.readFileSync(caminhoCompleto, 'utf8'));

        return {
          arquivo,
          data: stats.birthtime,
          tamanho: (stats.size / 1024).toFixed(2) + ' KB',
          total: conteudo.total || 0,
          timestamp: conteudo.timestamp
        };
      } catch (e) {
        console.error(`Erro ao processar ${arquivo}:`, e.message);
        return null;
      }
    }).filter(b => b !== null);

    res.json({
      sucesso: true,
      total: backups.length,
      backups: backups
    });
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
});

// STATS
app.get('/api/backup/stats', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({
        sucesso: true,
        totalBackups: 0,
        tamanhoTotal: '0 MB',
        ultimoBackup: null,
        mongodb: mongodbConectado ? 'conectado' : 'desconectado'
      });
    }

    const arquivos = fs.readdirSync(BACKUP_DIR);
    let tamanhoTotal = 0;

    arquivos.forEach(arquivo => {
      try {
        const stats = fs.statSync(`${BACKUP_DIR}/${arquivo}`);
        tamanhoTotal += stats.size;
      } catch (e) {
        console.log('Erro ao calcular tamanho');
      }
    });

    res.json({
      sucesso: true,
      totalBackups: arquivos.length,
      tamanhoTotal: (tamanhoTotal / (1024 * 1024)).toFixed(2) + ' MB',
      ultimoBackup: arquivos.length > 0 ? arquivos[arquivos.length - 1] : null,
      mongodb: mongodbConectado ? 'conectado' : 'desconectado'
    });
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS EXISTENTES (MANTIDOS)
// ════════════════════════════════════════════════════════════════

app.get('/api/contracts', async (req, res) => {
  try {
    const contratos = await Contract.find();
    res.json(contratos);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/contracts', async (req, res) => {
  try {
    const contrato = new Contract(req.body);
    await contrato.save();
    res.json(contrato);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.put('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(contrato);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/api/contracts/:id', async (req, res) => {
  try {
    await Contract.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Deletado' });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n✅ Servidor V31-ULTRA rodando na porta ${PORT}`);
  console.log('✅ Backup automático ativo');
  console.log(`✅ Pasta de backups: ${BACKUP_DIR}\n`);
});
