const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- SEGURANÇA (CSP AJUSTADA) ---
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://kit.fontawesome.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://ka-f.fontawesome.com; " +
    "font-src 'self' https://ka-f.fontawesome.com; " +
    "img-src 'self' data: https://huggingface.co; " +
    "connect-src 'self' https://huggingface.co https://*.mongodb.net https://ka-f.fontawesome.com;"
  );
  next();
});

app.use(cors());
app.use(express.json());

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 Storage Engine conectado"))
  .catch(err => console.error("❌ Erro MongoDB:", err));

// --- MODELO ---
const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  hf_repo: String,
  root_path: String,
  physics_params: { energy_gev: Number, pileup_mu: Number },
  created_at: { type: Date, default: Date.now }
}));

// --- INTERFACE (EXPLORADOR DE ARQUIVOS) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Data Portal | NIPS-CERN UFJF</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
      <style>
        :root { --cern-blue: #003366; --ufjf-red: #d32f2f; }
        body { background: #f4f6f9; font-family: 'Inter', sans-serif; }
        .sidebar { background: white; border-right: 1px solid #dee2e6; min-height: 100vh; padding: 20px; }
        .explorer-card { background: white; border-radius: 12px; border: none; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .file-row { cursor: pointer; transition: 0.2s; border-bottom: 1px solid #f1f1f1; }
        .file-row:hover { background: #f8f9fa; }
        .breadcrumb-item a { text-decoration: none; color: var(--cern-blue); font-weight: 500; }
        .folder-icon { color: #ffca28; margin-right: 10px; }
        .file-icon { color: #90a4ae; margin-right: 10px; }
        .badge-physics { background: #e8f0fe; color: #1967d2; border: 1px solid #c1d5fa; }
      </style>
    </head>
    <body>
      <div class="container-fluid">
        <div class="row">
          <div class="col-md-3 sidebar">
            <h4 class="mb-4" style="color: var(--cern-blue)">Simulações</h4>
            <div id="run-list" class="list-group list-group-flush"></div>
          </div>

          <div class="col-md-9 p-5">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h2 id="current-title">Selecione uma simulação</h2>
              <div id="meta-tags"></div>
            </div>

            <nav aria-label="breadcrumb">
              <ol class="breadcrumb" id="explorer-breadcrumb"></ol>
            </nav>

            <div class="card explorer-card">
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th style="width: 60%">Nome</th>
                        <th>Tamanho</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody id="explorer-body">
                      <tr><td colspan="3" class="text-center py-5 text-muted">Aguardando seleção...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        let currentRepo = "";
        let currentSimulationRoot = "";

        async function fetchStructure(path) {
          const body = document.getElementById('explorer-body');
          body.innerHTML = '<tr><td colspan="3" class="text-center py-4">Sincronizando com o cofre...</td></tr>';
          
          try {
            const res = await fetch(\`https://huggingface.co/api/datasets/\${currentRepo}/tree/main/\${path}\`);
            const items = await res.json();
            
            body.innerHTML = items.map(item => {
              const isDir = item.type === 'directory';
              const icon = isDir ? '📁' : '📄';
              const action = isDir 
                ? \`<button class="btn btn-sm btn-outline-primary" onclick="fetchStructure('\${item.path}')">Abrir</button>\`
                : \`<a href="https://huggingface.co/datasets/\${currentRepo}/resolve/main/\${item.path}" class="btn btn-sm btn-success" download>Baixar</a>\`;
              
              return \`
                <tr class="file-row" \${isDir ? \`onclick="fetchStructure('\${item.path}')"\` : ''}>
                  <td><span class="me-2">\${icon}</span> \${item.path.split('/').pop()}</td>
                  <td class="text-muted small">\${item.size ? (item.size/1024).toFixed(1) + ' KB' : '--'}</td>
                  <td>\${action}</td>
                </tr>
              \`;
            }).join('');

            updateBreadcrumb(path);
          } catch (e) {
            body.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Erro na conexão com os dados.</td></tr>';
          }
        }

        function updateBreadcrumb(path) {
          const nav = document.getElementById('explorer-breadcrumb');
          const parts = path.replace(currentSimulationRoot, 'Raiz').split('/');
          let fullPath = currentSimulationRoot;
          
          nav.innerHTML = parts.map((p, i) => {
            if (i > 0) fullPath += '/' + p;
            return \`<li class="breadcrumb-item"><a href="#" onclick="fetchStructure('\${fullPath}')">\${p}</a></li>\`;
          }).join('');
        }

        function selectRun(repo, path, energy, mu) {
          currentRepo = repo;
          currentSimulationRoot = path;
          document.getElementById('current-title').innerText = "Run: " + path.split('/').pop();
          document.getElementById('meta-tags').innerHTML = \`
            <span class="badge badge-physics">\${energy} GeV</span>
            <span class="badge badge-physics">μ = \${mu}</span>
          \`;
          fetchStructure(path);
        }

        // Carregar lista inicial do MongoDB
        fetch('/api/repository/simulations')
          .then(r => r.json())
          .then(data => {
            const list = document.getElementById('run-list');
            list.innerHTML = data.map(sim => \`
              <button onclick="selectRun('\${sim.hf_repo}', '\${sim.root_path}', \${sim.physics_params.energy_gev}, \${sim.physics_params.pileup_mu})" 
                      class="list-group-item list-group-item-action border-0 mb-2 rounded shadow-sm">
                <strong>\${new Date(sim.created_at).toLocaleDateString()}</strong><br>
                <small class="text-muted">\${sim.root_path}</small>
              </button>
            \`).join('');
          });
      </script>
    </body>
    </html>
  `);
});

// --- API DE REGISTRO ---
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
