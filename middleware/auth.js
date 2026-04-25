const jwt = require('jsonwebtoken');

function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ error: "Acesso negado. Token ausente." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Injeta os dados do admin na requisição
    next(); // Passa o controle para a rota
  } catch (err) {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

module.exports = verifyAdmin;