import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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
    dataConclusao: Date
  }],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

// CONECTAR MONGODB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Erro:', err));

// ROTAS

// Servir HTML na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'V28-TipoDesocupacao' });
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
    contrato.finalizado = req.body.finalizado || contrato.finalizado;
    contrato.responsavel = req.body.responsavel || contrato.responsavel;
    contrato.prioridade = req.body.prioridade || contrato.prioridade;
    contrato.statusImovel = req.body.statusImovel || contrato.statusImovel;
    contrato.dataDisponivelAluguel = req.body.dataDisponivelAluguel || contrato.dataDisponivelAluguel;
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
      dataCriacao: new Date()
    });
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

// SEED
app.post('/api/seed', async (req, res) => {
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
  console.log(`✅ Servidor V28-TipoDesocupacao rodando na porta ${PORT}`);
});
