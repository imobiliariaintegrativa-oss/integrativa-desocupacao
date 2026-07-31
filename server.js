import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/integrativa-desocupacao', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'Integrativa Desocupação API v1.0.0' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🎉 INTEGRATIVA DESOCUPAÇÃO - SERVIDOR ATIVO              ║
║  URL: http://0.0.0.0:${PORT}                              ║
║  Ambiente: ${process.env.NODE_ENV || 'development'}       ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
