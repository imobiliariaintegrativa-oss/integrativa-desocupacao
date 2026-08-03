import express from 'express';
import { Contract } from './models.js';

const router = express.Router();

// GET /api/repairs/:contractId - Listar reparos de um contrato
router.get('/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const contract = await Contract.findById(contractId);
    
    if (!contract) {
      return res.json({ sucesso: false, mensagem: 'Contrato não encontrado' });
    }

    res.json({
      sucesso: true,
      reparos: contract.reparos || []
    });
  } catch (erro) {
    console.error('Erro ao listar reparos:', erro);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar reparos' });
  }
});

// POST /api/repairs/:contractId - Criar novo reparo
router.post('/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const { descricao, urgencia, responsavel, dataLimite, status } = req.body;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.json({ sucesso: false, mensagem: 'Contrato não encontrado' });
    }

    const novoReparo = {
      _id: new Date().getTime().toString(),
      descricao,
      urgencia,
      responsavel,
      dataLimite: new Date(dataLimite),
      status: status || 'PENDENTE',
      dataCriacao: new Date()
    };

    if (!contract.reparos) {
      contract.reparos = [];
    }

    contract.reparos.push(novoReparo);
    contract.dataAtualizacao = new Date();

    await contract.save();

    res.json({
      sucesso: true,
      mensagem: 'Reparo registrado com sucesso',
      reparo: novoReparo
    });
  } catch (erro) {
    console.error('Erro ao criar reparo:', erro);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar reparo' });
  }
});

// PUT /api/repairs/:contractId/:repairId - Atualizar reparo
router.put('/:contractId/:repairId', async (req, res) => {
  try {
    const { contractId, repairId } = req.params;
    const { status, descricao, urgencia, responsavel, dataLimite } = req.body;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.json({ sucesso: false, mensagem: 'Contrato não encontrado' });
    }

    const reparo = contract.reparos.find(r => r._id === repairId);
    if (!reparo) {
      return res.json({ sucesso: false, mensagem: 'Reparo não encontrado' });
    }

    if (status) reparo.status = status;
    if (descricao) reparo.descricao = descricao;
    if (urgencia) reparo.urgencia = urgencia;
    if (responsavel) reparo.responsavel = responsavel;
    if (dataLimite) reparo.dataLimite = new Date(dataLimite);

    if (status === 'CONCLUIDO') {
      reparo.dataConclusao = new Date();
    }

    contract.dataAtualizacao = new Date();
    await contract.save();

    res.json({
      sucesso: true,
      mensagem: 'Reparo atualizado com sucesso',
      reparo
    });
  } catch (erro) {
    console.error('Erro ao atualizar reparo:', erro);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar reparo' });
  }
});

// DELETE /api/repairs/:contractId/:repairId - Deletar reparo
router.delete('/:contractId/:repairId', async (req, res) => {
  try {
    const { contractId, repairId } = req.params;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.json({ sucesso: false, mensagem: 'Contrato não encontrado' });
    }

    const indice = contract.reparos.findIndex(r => r._id === repairId);
    if (indice === -1) {
      return res.json({ sucesso: false, mensagem: 'Reparo não encontrado' });
    }

    contract.reparos.splice(indice, 1);
    contract.dataAtualizacao = new Date();

    await contract.save();

    res.json({
      sucesso: true,
      mensagem: 'Reparo deletado com sucesso'
    });
  } catch (erro) {
    console.error('Erro ao deletar reparo:', erro);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao deletar reparo' });
  }
});

export default router;
