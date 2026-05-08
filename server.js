const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- CORREÇÃO DE SEGURANÇA (CSP) ---
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https://huggingface.co; " +
    "connect-src 'self' https://huggingface.co https://*.mongodb.net;"
  );
  next();
});

app.use(cors());
app.use(express.json());

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 MongoDB Atlas conectado com sucesso"))
  .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- MODELO ---
const SimulationSchema = new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: {
    energy_gev: Number,
    pileup_mu: Number
  },
  created_at: { type: Date, default: Date.now }
});

const Simulation = mongoose.model('Simulation', SimulationSchema);

// --- ROTAS ---

// Rota raiz (Resolve o erro "Cannot GET /")
app.get('/', (req, res) => {
  res.send('<h1>Portal de Dados NIPS-CERN UFJF</h1><p>O servidor está rodando e pronto para receber dados.</p>');
});

// Rota de Registro (Para o Python)
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "Simulação indexada!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota de Listagem
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const data = await Simulation.find().sort({ created_at: -1 });
    const results = data.map(sim => ({
      ...sim._doc,
      url: `https://huggingface.co/datasets/${sim.hf_repo}/tree/main/${sim.root_path}`
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar dados." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor ativo na porta ${PORT}`));
