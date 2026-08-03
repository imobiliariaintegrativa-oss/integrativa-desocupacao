import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://imobiliariaintegrativa_db_user:FFRlnAqwA38UxRvK@cluster0.e5md0jn.mongodb.net/integrativa-desocupacao?retryWrites=true&w=majority&appName=Cluster0';

// ============= MIDDLEWARE =============
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============= MONGOOSE SCHEMAS =============

// Schema para Reparos (embutido em Contrato)
const reparoSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  descricao: String,
  urgencia: { type: String, enum: ['URGENTE', 'MEDIA', 'PEQUENA'], default: 'MEDIA' },
  responsavel: String,
  dataLimite: Date,
  status: { type: String, enum: ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'], default: 'PENDENTE' },
  dataCriacao: { type: Date, default: Date.now },
  dataConclusao: Date
});

// Schema para Contratos
const contratoSchema = new mongoose.Schema({
  contrato: { type: String, required: true, unique: true },
  endereco: String,
  locatario: String,
  comunicacaoInquilino: Date,
  comunicacaoProprietario: Date,
  agendamentoVistoria: Date,
  entregaChaves: Date,
  retiradaChaves: Date,
  reparosConstatados: String,
  status: String,
  statusChaves: { type: String, enum: ['pendente', 'recebidas', 'nao-recebidas'], default: 'pendente' },
  finalizado: String,
  responsavelComunicacao: String,
  responsavelVistoria: String,
  responsavelEntregaChaves: String,
  responsavelFinalizacao: String,
  reparos: [reparoSchema],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

const Contrato = mongoose.model('Contrato', contratoSchema);

// ============= CONEXÃO MONGODB =============
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB conectado com sucesso!');
})
.catch(err => {
  console.error('❌ Erro ao conectar MongoDB:', err.message);
});

// ============= ROTAS DE HEALTH CHECK =============
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ Server OK',
    version: 'V27-ES-Seed',
    mongodb: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'
  });
});

// ============= ROTA DE SEED (Popular banco com dados) =============
app.post('/api/seed', async (req, res) => {
  try {
    console.log('🌱 Iniciando seed de dados...');

    // Deletar contratos antigos
    await Contrato.deleteMany({});
    console.log('🗑️  Contratos antigos deletados');

    // 10 contratos originais
    const contratos = [
      { contrato: 'CA0535/1', endereco: 'R. Conselheiro Antônio Prado 230', locatario: 'Município de Olímpia', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1814/2', endereco: 'Rua Ilda Carrara Canevarollo 205', locatario: 'Andre Ruiz Spegiorin', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1374/3', endereco: 'Rua Expedicionário Lonildo Porcionato 42', locatario: 'Maria de Lourdes Barriento', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1979/1', endereco: 'Rua do Tico-tico 308', locatario: 'Leonilda São Jose da Silva', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1338/2', endereco: 'Rua Paschoal Michelli 82', locatario: 'Richard Alexssander de Matos', statusChaves: 'pendente', reparos: [] },
      { contrato: 'AP0208/2', endereco: 'Alameda das Orquídeas 125, Apto 12', locatario: 'Aléxia Andreia Lomba', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2796/1', endereco: 'Rua Adevar José de Castro 48', locatario: 'Olivia Aparecida Pimenta', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2762/1', endereco: 'Rua Doutor Otávio Lopez Ferraz 622', locatario: 'Daniel Costa Paraguassu', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2902/1', endereco: 'Rua Alexandre Bonini 85', locatario: 'Naila Aparecida de Sá Gimente', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2458/1', endereco: 'Rua Sebastião Marins 149', locatario: 'Dionatan Vieira Costa', statusChaves: 'pendente', reparos: [] }
    ];

    // Inserir contratos
    const resultado = await Contrato.insertMany(contratos);
    console.log(`✅ ${resultado.length} contratos inseridos!`);

    res.json({
      sucesso: true,
      mensagem: `${resultado.length} contratos carregados com sucesso!`,
      contratos: resultado
    });
  } catch (erro) {
    console.error('❌ Erro ao fazer seed:', erro);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});
// ============= ROTA DE SEED =============
app.post('/api/seed', async (req, res) => {
  try {
    await Contrato.deleteMany({});
    const dados = [
      { contrato: 'CA0535/1', endereco: 'R. Conselheiro Antônio Prado 230', locatario: 'Município de Olímpia', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1814/2', endereco: 'Rua Ilda Carrara Canevarollo 205', locatario: 'Andre Ruiz Spegiorin', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1374/3', endereco: 'Rua Expedicionário Lonildo Porcionato 42', locatario: 'Maria de Lourdes Barriento', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1979/1', endereco: 'Rua do Tico-tico 308', locatario: 'Leonilda São Jose da Silva', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA1338/2', endereco: 'Rua Paschoal Michelli 82', locatario: 'Richard Alexssander de Matos', statusChaves: 'pendente', reparos: [] },
      { contrato: 'AP0208/2', endereco: 'Alameda das Orquídeas 125, Apto 12', locatario: 'Aléxia Andreia Lomba', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2796/1', endereco: 'Rua Adevar José de Castro 48', locatario: 'Olivia Aparecida Pimenta', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2762/1', endereco: 'Rua Doutor Otávio Lopez Ferraz 622', locatario: 'Daniel Costa Paraguassu', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2902/1', endereco: 'Rua Alexandre Bonini 85', locatario: 'Naila Aparecida de Sá Gimente', statusChaves: 'pendente', reparos: [] },
      { contrato: 'CA2458/1', endereco: 'Rua Sebastião Marins 149', locatario: 'Dionatan Vieira Costa', statusChaves: 'pendente', reparos: [] }
    ];
    const r = await Contrato.insertMany(dados);
    res.json({ sucesso: true, mensagem: r.length + ' contratos carregados!' });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});
// ============= ROTAS DE CONTRATOS =============

// GET - Listar todos os contratos (SEM autenticação)
app.get('/api/contracts', async (req, res) => {
  try {
    console.log('📥 GET /api/contracts');
    const contratos = await Contrato.find().sort({ dataCriacao: -1 });
    console.log(`✅ ${contratos.length} contratos encontrados`);
    res.json({ sucesso: true, contratos });
  } catch (erro) {
    console.error('❌ Erro ao buscar contratos:', erro);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// GET - Buscar contrato por ID (SEM autenticação)
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contrato.findById(req.params.id);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// POST - Criar contrato (SEM autenticação)
app.post('/api/contracts', async (req, res) => {
  try {
    const novoContrato = new Contrato(req.body);
    await novoContrato.save();
    console.log(`✅ Contrato criado: ${novoContrato.contrato}`);
    res.status(201).json({ sucesso: true, contrato: novoContrato });
  } catch (erro) {
    console.error('❌ Erro ao criar contrato:', erro);
    res.status(400).json({ sucesso: false, erro: erro.message });
  }
});

// PUT - Atualizar contrato (SEM autenticação)
app.put('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contrato.findByIdAndUpdate(
      req.params.id,
      { ...req.body, dataAtualizacao: new Date() },
      { new: true, runValidators: true }
    );
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    console.log(`✅ Contrato atualizado: ${contrato.contrato}`);
    res.json({ sucesso: true, contrato });
  } catch (erro) {
    console.error('❌ Erro ao atualizar contrato:', erro);
    res.status(400).json({ sucesso: false, erro: erro.message });
  }
});

// DELETE - Deletar contrato (SEM autenticação)
app.delete('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contrato.findByIdAndDelete(req.params.id);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    console.log(`✅ Contrato deletado: ${contrato.contrato}`);
    res.json({ sucesso: true, mensagem: 'Contrato deletado' });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ============= ROTAS DE REPAROS =============

// GET - Listar reparos de um contrato (SEM autenticação)
app.get('/api/repairs/:contractId', async (req, res) => {
  try {
    const contrato = await Contrato.findById(req.params.contractId);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    res.json({ sucesso: true, reparos: contrato.reparos || [] });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// POST - Criar reparo (SEM autenticação)
app.post('/api/repairs/:contractId', async (req, res) => {
  try {
    const contrato = await Contrato.findById(req.params.contractId);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }

    const novoReparo = {
      _id: new mongoose.Types.ObjectId().toString(),
      descricao: req.body.descricao,
      urgencia: req.body.urgencia || 'MEDIA',
      responsavel: req.body.responsavel || '',
      dataLimite: req.body.dataLimite ? new Date(req.body.dataLimite) : null,
      status: 'PENDENTE',
      dataCriacao: new Date(),
      dataConclusao: null
    };

    contrato.reparos.push(novoReparo);
    contrato.dataAtualizacao = new Date();
    await contrato.save();

    console.log(`✅ Reparo criado: ${novoReparo.descricao} (Contrato: ${contrato.contrato})`);
    res.status(201).json({ sucesso: true, reparo: novoReparo });
  } catch (erro) {
    console.error('❌ Erro ao criar reparo:', erro);
    res.status(400).json({ sucesso: false, erro: erro.message });
  }
});

// PUT - Atualizar reparo (SEM autenticação)
app.put('/api/repairs/:contractId/:repairId', async (req, res) => {
  try {
    const contrato = await Contrato.findById(req.params.contractId);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }

    const reparo = contrato.reparos.id(req.params.repairId);
    if (!reparo) {
      return res.status(404).json({ sucesso: false, erro: 'Reparo não encontrado' });
    }

    if (req.body.status) reparo.status = req.body.status;
    if (req.body.descricao) reparo.descricao = req.body.descricao;
    if (req.body.urgencia) reparo.urgencia = req.body.urgencia;
    if (req.body.responsavel) reparo.responsavel = req.body.responsavel;
    if (req.body.dataLimite) reparo.dataLimite = new Date(req.body.dataLimite);
    
    if (req.body.status === 'CONCLUIDO' && !reparo.dataConclusao) {
      reparo.dataConclusao = new Date();
    }

    contrato.dataAtualizacao = new Date();
    await contrato.save();

    console.log(`✅ Reparo atualizado: ${req.params.repairId}`);
    res.json({ sucesso: true, reparo });
  } catch (erro) {
    console.error('❌ Erro ao atualizar reparo:', erro);
    res.status(400).json({ sucesso: false, erro: erro.message });
  }
});

// DELETE - Deletar reparo (SEM autenticação)
app.delete('/api/repairs/:contractId/:repairId', async (req, res) => {
  try {
    const contrato = await Contrato.findById(req.params.contractId);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }

    const reparo = contrato.reparos.id(req.params.repairId);
    if (!reparo) {
      return res.status(404).json({ sucesso: false, erro: 'Reparo não encontrado' });
    }

    reparo.deleteOne();
    contrato.dataAtualizacao = new Date();
    await contrato.save();

    console.log(`✅ Reparo deletado: ${req.params.repairId}`);
    res.json({ sucesso: true, mensagem: 'Reparo deletado' });
  } catch (erro) {
    console.error('❌ Erro ao deletar reparo:', erro);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ============= INICIAR SERVIDOR =============
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em porta ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
  console.log(`📋 Contratos: http://localhost:${PORT}/api/contracts\n`);
});

export default app;
