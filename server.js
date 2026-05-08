const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- CORRECÇÃO DE SEGURANÇA (CSP) ---
// Resolve os erros "Content-Security-Policy" vistos no console
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
// Certifique-se de configurar a variável MONGO_URI no painel do Render
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 MongoDB Atlas conectado"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

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

// --- ROTAS ---

// Rota raiz: Resolve o erro "Cannot GET /"
app.get('/', (req, res) => {
  res.send(`
    <body style="font-family: sans-serif; padding: 40px;">
      <h1>Portal de Dados NIPS-CERN UFJF</h1>
      <p>O servidor está rodando e pronto para receber dados.</p>
      <div id="status">Verificando banco de dados...</div>
      <script>
        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const div = document.getElementById('status');
            if(data.length === 0) {
              div.innerHTML = "<b>Status:</b> Nenhuma simulação registrada ainda. Execute o script Python.";
            } else {
              div.innerHTML = "<b>Status:</b> " + data.length + " simulação(ões) encontrada(s)!";
            }
          });
      </script>
    </body>
  `);
});

// Rota de Registro (Chamada pelo Python)
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "Sincronizado com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota de Listagem
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const data = await Simulation.find().sort({ created_at: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar dados." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor ativo na porta ${PORT}`));
