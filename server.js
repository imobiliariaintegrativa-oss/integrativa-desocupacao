const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

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
    version: 'V26',
    mongodb: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'
  });
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

module.exports = app;
