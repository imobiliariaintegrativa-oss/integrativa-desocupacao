import express from 'express';
import { Contract } from './models.js';

const router = express.Router();

// GET - Listar todos os contratos (SEM autenticação)
router.get('/', async (req, res) => {
  try {
    const contratos = await Contract.find().sort({ dataCriacao: -1 });
    res.json({ sucesso: true, contratos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// GET - Buscar contrato por ID (SEM autenticação)
router.get('/:id', async (req, res) => {
  try {
    const contrato = await Contract.findById(req.params.id);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    res.json({ sucesso: true, contrato });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// POST - Criar contrato (SEM autenticação)
router.post('/', async (req, res) => {
  try {
    const novoContrato = new Contract(req.body);
    await novoContrato.save();
    res.status(201).json({ sucesso: true, mensagem: 'Contrato criado', contrato: novoContrato });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// PUT - Atualizar contrato (SEM autenticação)
router.put('/:id', async (req, res) => {
  try {
    const contrato = await Contract.findByIdAndUpdate(
      req.params.id,
      { ...req.body, dataAtualizacao: new Date() },
      { new: true, runValidators: true }
    );
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    res.json({ sucesso: true, mensagem: 'Contrato atualizado', contrato });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// DELETE - Deletar contrato (SEM autenticação)
router.delete('/:id', async (req, res) => {
  try {
    const contrato = await Contract.findByIdAndDelete(req.params.id);
    if (!contrato) {
      return res.status(404).json({ sucesso: false, erro: 'Contrato não encontrado' });
    }
    res.json({ sucesso: true, mensagem: 'Contrato deletado' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

export default router;
