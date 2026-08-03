import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import contractRoutes from './routes-contracts.js';
import repairRoutes from './routes-repairs.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

// Conexão MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Rotas
app.use('/api/contracts', contractRoutes);
app.use('/api/repairs', repairRoutes);

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Server OK', version: 'V25' });
});

// Servir arquivos estáticos
app.use(express.static('public'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em porta ${PORT}`);
  console.log(`📊 Acesse: http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api`);
  console.log(`✅ V25: MongoDB Sync ativo`);
});
