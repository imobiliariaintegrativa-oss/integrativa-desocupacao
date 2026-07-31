import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  contrato: { type: String, required: true, unique: true, uppercase: true },
  endereco: { type: String, required: true },
  locatario: { type: String, required: true },
  comunicacaoInquilino: { type: Date, default: null },
  comunicacaoProprietario: { type: Date, default: null },
  agendamentoVistoria: { type: Date, default: null },
  entregaChaves: { type: Date, default: null },
  retiradaChaves: { type: Date, default: null },
  reparosConstatados: { type: String, enum: ['sim', 'nao', ''], default: '' },
  status: { type: String, enum: ['pendente', 'agendada', 'realizada'], default: 'pendente' },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

export const Contract = mongoose.model('Contract', contractSchema);
