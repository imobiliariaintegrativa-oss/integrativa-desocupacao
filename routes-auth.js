import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, nome, senha } = req.body;
    
    if (!email || !nome || !senha) {
      return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }
    
    const senhaHash = await bcrypt.hash(senha, 10);
    const token = jwt.sign({ email, nome }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '7d' });
    
    res.status(201).json({ mensagem: 'Usuário registrado', token, usuario: { email, nome } });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatórios' });
    
    const token = jwt.sign({ email }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '7d' });
    res.json({ mensagem: 'Login realizado', token, usuario: { email } });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;
