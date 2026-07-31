import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes-auth.js';
import contractRoutes from './routes-contracts.js';
import { errorHandler, notFound } from './middleware.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ Conectado ao MongoDB'))
  .catch((err) => console.error('❌ Erro MongoDB:', err.message));

// Rotas API
app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractRoutes);

// Rota raiz - serve o frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API raiz
app.get('/api', (req, res) => {
  res.json({ message: 'Integrativa Desocupação API v1.0.0' });
});

// Tratamento de erros
app.use(notFound);
app.use(errorHandler);

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🎉 INTEGRATIVA DESOCUPAÇÃO - SERVIDOR ATIVO              ║');
  console.log(`║  URL: http://0.0.0.0:${PORT}                          `);
  console.log('║  Ambiente: ' + process.env.NODE_ENV + '                            ');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});
