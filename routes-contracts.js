import express from 'express';
import { Contract } from './models.js';
import { authenticate } from './middleware.js';
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const contratos = await Contract.find().sort({ dataCriacao: -1 });
    res.json({ contratos });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const novoContrato = new Contract(req.body);
    await novoContrato.save();
    res.status(201).json({ mensagem: 'Contrato criado', contrato: novoContrato });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const contrato = await Contract.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ mensagem: 'Contrato atualizado', contrato });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await Contract.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Contrato deletado' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;
