const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- SEGURANÇA (CSP) ---
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https://huggingface.co; " +
    "connect-src 'self' https://huggingface.co https://*.mongodb.net;"
  );
  next();
});

app.use(cors());
app.use(express.json());

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 MongoDB Conectado"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// --- MODELO ---
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: { energy_gev: Number, pileup_mu: Number },
  description: String,
  created_at: { type: Date, default: Date.now }
}));

// --- INTERFACE (O ESPELHO) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <title>Portal NIPS-CERN UFJF</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { background: #f8f9fa; padding: 50px; }
        .card { border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .layer-item { font-size: 0.9em; padding: 5px 10px; background: #e9ecef; border-radius: 4px; margin: 2px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card p-4">
          <h1 class="text-primary">Portal de Dados NIPS-CERN UFJF</h1>
          <p class="text-muted">Espelhamento em tempo real das simulações Lorenzetti</p>
          <hr>
          <div id="lista-simulacoes">Carregando simulações...</div>
        </div>
      </div>

      <script>
        async function carregarCamadas(repo, path, divId) {
          const div = document.getElementById(divId);
          div.innerHTML = "<i>Buscando camadas no HF...</i>";
          try {
            const res = await fetch('https://huggingface.co/api/datasets/' + repo + '/tree/main/' + path);
            const files = await res.json();
            const folders = files.filter(f => f.type === 'directory');
            
            if(folders.length === 0) {
              div.innerHTML = "<span class='text-danger'>Nenhuma subpasta encontrada.</span>";
            } else {
              div.innerHTML = folders.map(f => '<span class="layer-item">📁 ' + f.path.split("/").pop() + '</span>').join(' ');
            }
          } catch (e) {
            div.innerHTML = "Erro ao espelhar estrutura.";
          }
        }

        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const container = document.getElementById('lista-simulacoes');
            if (data.length === 0) {
              container.innerHTML = "<div class='alert alert-warning'>Nenhum registro encontrado.</div>";
              return;
            }
            container.innerHTML = data.map((sim, index) => {
              const divId = "layers-" + index;
              return \`
                <div class="mb-4 border-bottom pb-3">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <h5 class="mb-0">Simulação \${new Date(sim.created_at).toLocaleDateString()} - \${sim.physics_params?.energy_gev || '---'} GeV</h5>
                      <small class="text-muted">Caminho: <code>\${sim.root_path}</code> | μ: \${sim.physics_params?.pileup_mu || '---'}</small>
                    </div>
                    <div class="d-flex gap-2">
                      <button class="btn btn-outline-primary btn-sm" onclick="carregarCamadas('\${sim.hf_repo}', '\${sim.root_path}', '\${divId}')">
                        Espelhar Estrutura 🔄
                      </button>
                      <a href="https://huggingface.co/datasets/\${sim.hf_repo}/tree/main/\${sim.root_path}" target="_blank" class="btn btn-primary btn-sm">
                        Abrir no HF 📂
                      </a>
                    </div>
                  </div>
                  <div id="\${divId}" class="mt-3"></div>
                </div>
              \`;
            }).join('');
          });
      </script>
    </body>
    </html>
  `);
});

// --- API ---
app.post('/api/repository/register-hf', async (req, res) => {
  try {
    const entry = new Simulation(req.body);
    await entry.save();
    res.status(201).json({ message: "OK" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/repository/simulations', async (req, res) => {
  const data = await Simulation.find().sort({ created_at: -1 });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor Ativo na porta ${PORT}`));
