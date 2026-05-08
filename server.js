const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 Conectado ao MongoDB Atlas"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// --- MODELO ATUALIZADO (Foco em HF) ---
const SimulationSchema = new mongoose.Schema({
  hf_repo: String,       // Ex: "nips-cern-ufjf/data"
  root_path: String,     // Ex: "simulacoes/lorenzetti_v045"
  physics_params: {
    event_type: String,
    energy_gev: Number,
    pileup_mu: Number
  },
  provenance: {
    author: String,
    framework: String,
    created_at: { type: Date, default: Date.now }
  }
});

const Simulation = mongoose.model('Simulation', SimulationSchema);

// --- ROTAS DA API ---

// 1. REGISTRO (Chamado pelo Python após o upload)
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const newSim = new Simulation(req.body);
    await newSim.save();
    res.status(201).json({ message: "Simulação registrada no portal!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. LISTAGEM PARA O FRONTEND
// Esta rota retorna as simulações e os links base para o Hugging Face
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const sims = await Simulation.find().sort({ 'provenance.created_at': -1 });
    
    // Transformamos os dados para incluir o link de navegação do HF
    const formatted = sims.map(s => ({
      ...s._doc,
      browser_url: `https://huggingface.co/datasets/${s.hf_repo}/tree/main/${s.root_path}`,
      raw_base_url: `https://huggingface.co/datasets/${s.hf_repo}/resolve/main/${s.root_path}`
    }));
    
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar dados." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor NIPS-CERN UFJF na porta ${PORT}`));
