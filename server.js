const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- SEGURANÇA E POLÍTICA DE CONTEÚDO (Correção do erro no Render) ---
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
  .then(() => console.log("🚀 Banco de dados NIPS-CERN conectado"))
  .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- MODELO DE DADOS ---
const SimulationSchema = new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: {
    energy_gev: Number,
    pileup_mu: Number
  },
  description: String,
  created_at: { type: Date, default: Date.now }
});

const Simulation = mongoose.model('Simulation', SimulationSchema);

// --- ROTAS DA API ---

// 1. Rota de Registro (chamada pelo Python)
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "Simulação indexada com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Rota de Listagem (para o site mostrar as pastas)
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const data = await Simulation.find().sort({ created_at: -1 });
    // Adiciona o link direto de navegação no Hugging Face
    const formattedData = data.map(sim => ({
      ...sim._doc,
      hf_url: `https://huggingface.co/datasets/${sim.hf_repo}/tree/main/${sim.root_path}`
    }));
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar simulações." });
  }
});

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
