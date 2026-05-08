const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORREÇÃO DE SEGURANÇA (CSP)
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

// CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 MongoDB Conectado"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// MODELO
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: { energy_gev: Number, pileup_mu: Number },
  created_at: { type: Date, default: Date.now }
}));

// INTERFACE VISUAL (Página Inicial)
app.get('/', (req, res) => {
  res.send(`
    <body style="font-family: sans-serif; padding: 40px; background: #f4f7f6;">
      <h1 style="color: #2c3e50;">Portal de Dados NIPS-CERN UFJF</h1>
      <hr>
      <h3>Simulações Disponíveis (Hugging Face)</h3>
      <table border="1" style="width: 100%; border-collapse: collapse; background: white;">
        <thead style="background: #ecf0f1;">
          <tr>
            <th style="padding: 10px;">Data</th>
            <th>Energia (GeV)</th>
            <th>Pile-up (mu)</th>
            <th>Acesso aos Arquivos</th>
          </tr>
        </thead>
        <tbody id="tabela-corpo">
          <tr><td colspan="4" style="padding: 20px; text-align: center;">Carregando dados...</td></tr>
        </tbody>
      </table>

      <script>
        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const corpo = document.getElementById('tabela-corpo');
            if (data.length === 0) {
              corpo.innerHTML = "<tr><td colspan='4' style='padding: 20px; text-align: center;'>Nenhuma simulação registrada. Rode o script Python.</td></tr>";
              return;
            }
            corpo.innerHTML = data.map(sim => \`
              <tr>
                <td style="padding: 10px;">\${new Date(sim.created_at).toLocaleString()}</td>
                <td style="text-align: center;">\${sim.physics_params.energy_gev}</td>
                <td style="text-align: center;">\${sim.physics_params.pileup_mu}</td>
                <td style="text-align: center; padding: 10px;">
                  <a href="https://huggingface.co/datasets/\${sim.hf_repo}/tree/main/\${sim.root_path}" 
                     target="_blank" style="background: #3498db; color: white; padding: 5px 10px; text-decoration: none; border-radius: 4px;">
                     Ver no Hugging Face 📂
                  </a>
                </td>
              </tr>
            \`).join('');
          });
      </script>
    </body>
  `);
});

// ROTA DE REGISTRO
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ROTA DE LISTAGEM
app.get('/api/repository/simulations', async (req, res) => {
  const data = await Simulation.find().sort({ created_at: -1 });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Servidor Ativo"));
