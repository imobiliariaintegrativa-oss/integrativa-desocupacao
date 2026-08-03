import mongoose from 'mongoose';

const reparoSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  descricao: { type: String, required: true },
  urgencia: { type: String, enum: ['URGENTE', 'MEDIA', 'PEQUENA'], required: true },
  responsavel: { type: String, default: '' },
  dataLimite: { type: Date, required: true },
  status: { type: String, enum: ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'], default: 'PENDENTE' },
  dataCriacao: { type: Date, default: Date.now },
  dataConclusao: { type: Date, default: null }
});

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
  statusChaves: { type: String, enum: ['pendente', 'recebidas', 'nao-recebidas'], default: 'pendente' },
  finalizado: { type: String, enum: ['sim', 'nao'], default: 'nao' },
  responsavelComunicacao: { type: String, default: '' },
  responsavelVistoria: { type: String, default: '' },
  responsavelEntregaChaves: { type: String, default: '' },
  responsavelFinalizacao: { type: String, default: '' },
  reparos: [reparoSchema],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

export const Contract = mongoose.model('Contract', contractSchema);
