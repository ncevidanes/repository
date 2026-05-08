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
  .then(() => console.log("🚀 Banco de dados NIPS-CERN conectado"))
  .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- MODELO DE DADOS ---
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: {
    energy_gev: Number,
    pileup_mu: Number
  },
  description: String,
  created_at: { type: Date, default: Date.now }
}));

// --- INTERFACE WEB (Página Inicial) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <title>Portal de Dados UFJF</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: #f0f2f5; color: #333; }
        .container { max-width: 1000px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; color: #555; }
        .btn { background: #007bff; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 14px; }
        .btn:hover { background: #0056b3; }
        code { background: #eee; padding: 2px 4px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Portal de Dados NIPS-CERN UFJF</h1>
        <p>Repositório de simulações Lorenzetti (Geant4)</p>
        
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Pasta (HF)</th>
              <th>Energia</th>
              <th>Pile-up (μ)</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody id="tabela-corpo">
            <tr><td colspan="5" style="text-align:center">Carregando dados...</td></tr>
          </tbody>
        </table>
      </div>

      <script>
        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const corpo = document.getElementById('tabela-corpo');
            if (data.length === 0) {
              corpo.innerHTML = "<tr><td colspan='5' style='text-align:center'>Nenhum dado registrado.</td></tr>";
              return;
            }
            corpo.innerHTML = data.map(sim => \`
              <tr>
                <td>\${new Date(sim.created_at).toLocaleDateString()}</td>
                <td><code>\${sim.root_path}</code></td>
                <td>\${sim.physics_params?.energy_gev || '---'} GeV</td>
                <td>\${sim.physics_params?.pileup_mu || '---'}</td>
                <td>
                  <a href="https://huggingface.co/datasets/\${sim.hf_repo}/tree/main/\${sim.root_path}" 
                     target="_blank" class="btn">Abrir Pasta 📂</a>
                </td>
              </tr>
            \`).join('');
          });
      </script>
    </body>
    </html>
  `);
});

// --- ROTAS DA API ---

// Registro (Chamado pelo Python)
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "Indexado com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listagem (Usada pelo script do navegador)
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const data = await Simulation.find().sort({ created_at: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar dados." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`✅ Servidor rodando na porta ${PORT}`));
