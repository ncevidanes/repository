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
  .then(() => console.log("🚀 Storage Engine ATLAS/UFJF Ativo"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// --- MODELO ---
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: { energy_gev: Number, pileup_mu: Number },
  description: String,
  created_at: { type: Date, default: Date.now }
}));

// --- INTERFACE DE NAVEGAÇÃO ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <title>ATLAS/UFJF | Data Explorer</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; color: #333; }
        .sidebar { background: white; border-right: 1px solid #e0e0e0; height: 100vh; position: sticky; top: 0; overflow-y: auto; padding: 25px; }
        .nav-link-custom { border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; padding: 12px; }
        .nav-link-custom:hover { background: #f0f4f8; border: 1px solid #d1d9e6; }
        .nav-link-custom.active { background: #e8f0fe; border: 1px solid #1a73e8; color: #1a73e8; font-weight: 600; }
        .explorer-header { background: white; border-bottom: 1px solid #e0e0e0; padding: 20px 40px; }
        .file-card { background: white; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .table thead { background: #fafafa; font-size: 0.75rem; text-transform: uppercase; color: #666; }
        .file-row { transition: background 0.1s; }
        .file-row:hover { background-color: #fcfcfc; cursor: pointer; }
        .breadcrumb-item a { text-decoration: none; color: #003366; font-weight: 600; }
        .badge-physics { font-size: 0.8rem; padding: 5px 12px; border-radius: 15px; }
      </style>
    </head>
    <body>
      <div class="container-fluid p-0">
        <div class="row g-0">
          <div class="col-md-3 sidebar">
            <div class="mb-4 text-center">
              <h5 class="fw-bold" style="color: #003366">NIPS-CERN UFJF</h5>
              <small class="text-muted text-uppercase" style="font-size: 0.65rem; letter-spacing: 1px;">Repository Engine v2.0</small>
            </div>
            <div id="run-list"></div>
          </div>

          <div class="col-md-9">
            <div id="welcome-screen" class="p-5 text-center mt-5">
               <h2 class="text-muted">Selecione uma simulação Lorenzetti</h2>
               <p>Explore as camadas do calorímetro simuladas com Geant4.</p>
            </div>

            <div id="explorer-ui" style="display:none">
              <div class="explorer-header">
                <div class="d-flex justify-content-between align-items-center">
                  <h4 id="display-title" class="mb-0 fw-bold">---</h4>
                  <div id="meta-badges"></div>
                </div>
                <nav aria-label="breadcrumb" class="mt-3">
                  <ol class="breadcrumb mb-0" id="breadcrumb-nav"></ol>
                </nav>
              </div>

              <div class="p-4">
                <div class="file-card">
                  <table class="table mb-0 align-middle">
                    <thead>
                      <tr>
                        <th class="ps-4">Nome do Item</th>
                        <th>Tamanho</th>
                        <th class="text-end pe-4">Ação</th>
                      </tr>
                    </thead>
                    <tbody id="explorer-body"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        let selectedRepo = "";
        
        async function navigate(path) {
          const body = document.getElementById('explorer-body');
          body.innerHTML = '<tr><td colspan="3" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div> Sincronizando...</td></tr>';
          
          try {
            const res = await fetch(\`https://huggingface.co/api/datasets/\${selectedRepo}/tree/main/\${path}\`);
            const data = await res.json();
            
            body.innerHTML = data.map(item => {
              const isDir = item.type === 'directory';
              const icon = isDir ? '📁' : '📄';
              return \`
                <tr class="file-row" onclick="\${isDir ? \`Maps('\${item.path}')\` : ''}">
                  <td class="ps-4">
                    <span class="me-2">\${icon}</span> <strong>\${item.path.split('/').pop()}</strong>
                  </td>
                  <td class="text-muted">\${item.size ? (item.size/1024).toFixed(1) + ' KB' : '--'}</td>
                  <td class="text-end pe-4">
                    \${isDir ? '<span class="badge bg-light text-dark">Pasta</span>' : 
                    \`<a href="https://huggingface.co/datasets/\${selectedRepo}/resolve/main/\${item.path}" class="btn btn-sm btn-outline-success" download>Download</a>\`}
                  </td>
                </tr>\`;
            }).join('');
            updateBreadcrumb(path);
          } catch(e) { 
            body.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Erro ao acessar Hugging Face. Verifique se o repo é público.</td></tr>'; 
          }
        }

        function updateBreadcrumb(path) {
          const nav = document.getElementById('breadcrumb-nav');
          const parts = path.split('/');
          let currentPath = "";
          nav.innerHTML = parts.map((p, i) => {
            currentPath += (i === 0 ? p : "/" + p);
            return \`<li class="breadcrumb-item"><a href="#" onclick="navigate('\${currentPath}')">\${p}</a></li>\`;
          }).join('');
        }

        function initView(repo, path, energy, mu, element) {
          document.querySelectorAll('.nav-link-custom').forEach(el => el.classList.remove('active'));
          element.classList.add('active');
          
          document.getElementById('welcome-screen').style.display = 'none';
          document.getElementById('explorer-ui').style.display = 'block';
          
          selectedRepo = repo;
          document.getElementById('display-title').innerText = "Run: " + path.split('/').pop();
          document.getElementById('meta-badges').innerHTML = \`
            <span class="badge bg-primary badge-physics">\${energy} GeV</span>
            <span class="badge bg-secondary badge-physics">μ = \${mu}</span>
          \`;
          navigate(path);
        }

        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const list = document.getElementById('run-list');
            list.innerHTML = data.map(sim => \`
              <div class="nav-link-custom" onclick="initView('\${sim.hf_repo}', '\${sim.root_path}', \${sim.physics_params.energy_gev}, \${sim.physics_params.pileup_mu}, this)">
                <div class="small fw-bold">\${new Date(sim.created_at).toLocaleDateString()}</div>
                <div class="text-muted" style="font-size: 0.8rem;">\${sim.root_path.split('/').pop()}</div>
              </div>\`).join('');
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
