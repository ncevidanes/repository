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
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https://huggingface.co; " +
    "connect-src 'self' https://huggingface.co https://*.mongodb.net;"
  );
  next();
});

app.use(cors());
app.use(express.json());

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 Explorador de Dados ATLAS Conectado"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// --- MODELO ---
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: { energy_gev: Number, pileup_mu: Number },
  description: String,
  created_at: { type: Date, default: Date.now }
}));

// --- INTERFACE (O EXPLORADOR REAL) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <title>ATLAS/UFJF | Data Repository</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; height: 100vh; overflow: hidden; }
        .sidebar { background: white; border-right: 1px solid #e0e0e0; height: 100vh; overflow-y: auto; padding: 25px; }
        .nav-item-run { border-radius: 8px; margin-bottom: 8px; cursor: pointer; padding: 12px; border: 1px solid transparent; transition: 0.2s; }
        .nav-item-run:hover { background: #f0f4f8; }
        .nav-item-run.active { background: #e8f0fe; border-color: #1a73e8; color: #1a73e8; font-weight: 600; }
        .main-view { height: 100vh; overflow-y: auto; background: #fff; }
        .explorer-header { padding: 20px 40px; border-bottom: 1px solid #eee; background: #fff; position: sticky; top: 0; z-index: 10; }
        .file-table { margin: 20px 40px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
        .file-row:hover { background: #fafafa; cursor: pointer; }
        .breadcrumb-item a { text-decoration: none; color: #003366; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container-fluid p-0">
        <div class="row g-0">
          <div class="col-md-3 sidebar">
            <div class="mb-4">
              <h5 class="fw-bold" style="color: #003366">NIPS-CERN UFJF</h5>
              <small class="text-muted text-uppercase">Lorenzetti Data Repository</small>
            </div>
            <div id="run-list"></div>
          </div>

          <div class="col-md-9 main-view">
            <div id="empty-state" class="text-center mt-5 pt-5">
              <h3 class="text-muted">Selecione uma simulação para explorar</h3>
            </div>

            <div id="explorer-ui" style="display:none">
              <div class="explorer-header">
                <div class="d-flex justify-content-between align-items-center">
                  <h4 id="run-name" class="mb-0 fw-bold">---</h4>
                  <div id="badges"></div>
                </div>
                <nav class="mt-3"><ol class="breadcrumb mb-0" id="path-nav"></ol></nav>
              </div>

              <div class="file-table">
                <table class="table mb-0 align-middle">
                  <thead class="table-light">
                    <tr>
                      <th class="ps-4">Nome</th>
                      <th>Tamanho</th>
                      <th class="text-end pe-4">Acção</th>
                    </tr>
                  </thead>
                  <tbody id="files-body"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        let currentRepo = "";

        // FUNÇÃO DE NAVEGAÇÃO (Tornada global explicitamente)
        window.navigate = async function(path) {
          const body = document.getElementById('files-body');
          body.innerHTML = '<tr><td colspan="3" class="text-center py-5">Sincronizando com o cofre...</td></tr>';
          
          try {
            const url = "https://huggingface.co/api/datasets/" + currentRepo + "/tree/main/" + path;
            const res = await fetch(url);
            const items = await res.json();
            
            body.innerHTML = items.map(item => {
              const isDir = item.type === 'directory';
              const name = item.path.split('/').pop();
              const icon = isDir ? '📁' : '📄';
              
              return '<tr class="file-row" onclick="' + (isDir ? "navigate('" + item.path + "')" : "") + '">' +
                '<td class="ps-4"><span>' + icon + '</span> <strong class="ms-2">' + name + '</strong></td>' +
                '<td class="text-muted">' + (item.size ? (item.size/1024).toFixed(1) + ' KB' : '--') + '</td>' +
                '<td class="text-end pe-4">' +
                  (isDir ? '<span class="badge bg-light text-dark">Pasta</span>' : 
                  '<a href="https://huggingface.co/datasets/' + currentRepo + '/resolve/main/' + item.path + '" class="btn btn-sm btn-outline-success" download onclick="event.stopPropagation()">Download</a>') +
                '</td></tr>';
            }).join('');

            updateBreadcrumb(path);
          } catch(e) {
            body.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Erro ao aceder aos dados. Verifique se o repo é Público.</td></tr>';
          }
        };

        function updateBreadcrumb(path) {
          const nav = document.getElementById('path-nav');
          const parts = path.split('/');
          let current = "";
          nav.innerHTML = parts.map((p, i) => {
            current += (i === 0 ? p : "/" + p);
            return '<li class="breadcrumb-item"><a href="#" onclick="event.preventDefault(); navigate(\\'' + current + '\\')">' + p + '</a></li>';
          }).join('');
        }

        window.initView = function(repo, path, energy, mu, el) {
          document.querySelectorAll('.nav-item-run').forEach(item => item.classList.remove('active'));
          el.classList.add('active');
          document.getElementById('empty-state').style.display = 'none';
          document.getElementById('explorer-ui').style.display = 'block';
          currentRepo = repo;
          document.getElementById('run-name').innerText = "Run: " + path.split('/').pop();
          document.getElementById('badges').innerHTML = '<span class="badge bg-primary me-2">' + energy + ' GeV</span><span class="badge bg-secondary">μ = ' + mu + '</span>';
          navigate(path);
        };

        // Carregar do MongoDB
        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const list = document.getElementById('run-list');
            list.innerHTML = data.map(sim => 
              '<div class="nav-item-run" onclick="initView(\\'' + sim.hf_repo + '\\', \\'' + sim.root_path + '\\', ' + sim.physics_params.energy_gev + ', ' + sim.physics_params.pileup_mu + ', this)">' +
                '<div class="small fw-bold">' + new Date(sim.created_at).toLocaleDateString() + '</div>' +
                '<div class="small text-muted">' + sim.root_path.split('/').pop() + '</div>' +
              '</div>'
            ).join('');
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
app.listen(PORT, () => console.log(`✅ Servidor UFJF Ativo na porta ${PORT}`));
