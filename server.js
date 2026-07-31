import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Importar modelos e middleware
import { Contract } from './models.js';
import { authenticate, errorHandler, notFound } from './middleware.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB conectado!'))
.catch((err) => console.error('❌ Erro MongoDB:', err));

// =====================
// ROTAS DE AUTENTICAÇÃO
// =====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha obrigatórios' });
    }
    res.json({ mensagem: 'Registro funcionando', email });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    res.json({ mensagem: 'Login funcionando', token: 'fake-token-123' });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========================
// ROTAS DE CONTRATOS (CRUD)
// ========================

// GET todos os contratos
app.get('/api/contracts', async (req, res) => {
  try {
    console.log('📥 GET /api/contracts');
    const contratos = await Contract.find();
    console.log(`✅ Encontrados ${contratos.length} contratos`);
    res.json({ contratos });
  } catch (erro) {
    console.error('❌ Erro GET:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// POST novo contrato
app.post('/api/contracts', async (req, res) => {
  try {
    console.log('📤 POST /api/contracts', req.body);
    const contrato = new Contract(req.body);
    await contrato.save();
    console.log('✅ Contrato criado:', contrato._id);
    res.status(201).json({ mensagem: 'Contrato criado', contrato });
  } catch (erro) {
    console.error('❌ Erro POST:', erro);
    res.status(400).json({ erro: erro.message });
  }
});

// GET um contrato
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' });
    res.json({ contrato });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// PUT atualizar contrato
app.put('/api/contracts/:id', async (req, res) => {
  try {
    console.log('🔄 PUT /api/contracts/:id', req.params.id);
    const contrato = await Contract.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' });
    console.log('✅ Contrato atualizado');
    res.json({ mensagem: 'Contrato atualizado', contrato });
  } catch (erro) {
    console.error('❌ Erro PUT:', erro);
    res.status(400).json({ erro: erro.message });
  }
});

// DELETE contrato
app.delete('/api/contracts/:id', async (req, res) => {
  try {
    console.log('🗑️  DELETE /api/contracts/:id', req.params.id);
    const contrato = await Contract.findByIdAndDelete(req.params.id);
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' });
    console.log('✅ Contrato deletado');
    res.json({ mensagem: 'Contrato deletado' });
  } catch (erro) {
    console.error('❌ Erro DELETE:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// =====================
// ROTAS GERAIS
// =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api', (req, res) => {
  res.json({ 
    mensagem: 'Integrativa Desocupação API v1.0.0',
    endpoints: {
      GET: '/api/contracts',
      POST: '/api/contracts',
      PUT: '/api/contracts/:id',
      DELETE: '/api/contracts/:id'
    }
  });
});

// Middleware de erro
app.use(notFound);
app.use(errorHandler);

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`🌐 Web: http://localhost:${PORT}`);
});
