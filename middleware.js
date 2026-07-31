import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

export const errorHandler = (err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(err.status || 500).json({ erro: err.message || 'Erro interno' });
};

export const notFound = (req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
};
