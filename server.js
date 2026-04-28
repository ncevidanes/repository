const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIGURAÇÕES E MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Conexão MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 Conectado ao MongoDB Atlas"))
  .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- MODELO DE DADOS (SIMULATION) ---
const SimulationSchema = new mongoose.Schema({
  filename: String,
  zenodo_id: String,
  download_url: String,
  physics_params: {
    event_type: String,
    energy_gev: Number,
    pileup_mu: Number
  },
  software_stack: {
    generator: String,
    framework: String
  },
  provenance: {
    author: String,
    created_at: { type: Date, default: Date.now },
    validation_status: { type: String, default: 'pending' },
    is_deleted: { type: Boolean, default: false },
    deleted_at: Date
  }
});

const Simulation = mongoose.model('Simulation', SimulationSchema);

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Acesso negado. Token ausente." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido ou expirado." });
    req.user = user;
    next();
  });
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ user: username, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }
  res.status(401).json({ error: "Credenciais inválidas." });
});

// --- ROTAS DO REPOSITÓRIO ---

// 1. LISTAR SIMULAÇÕES (Com filtros)
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const { status, event } = req.query;
    let query = { 'provenance.is_deleted': false };

    if (status) query['provenance.validation_status'] = status;
    else if (!req.headers['authorization']) {
        // Se não for admin, vê apenas os verificados por padrão
        query['provenance.validation_status'] = 'verified';
    }

    if (event) query['physics_params.event_type'] = event;

    const results = await Simulation.find(query).sort({ 'provenance.created_at': -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar dados." });
  }
});

// 2. UPLOAD (Integração Zenodo + MongoDB)
app.post('/api/repository/simulations', upload.single('simulation_file'), async (req, res) => {
  try {
    const metadata = JSON.parse(req.body.metadata);
    
    // Passo A: Criar rascunho no Zenodo vinculado à Comunidade
    const zenodoRes = await axios.post('https://zenodo.org/api/deposit/depositions', {
      metadata: {
        title: `NIPS-CERN UFJF: ${req.file.originalname}`,
        upload_type: 'dataset',
        description: 'Simulações de física de altas energias - Grupo NIPS-CERN UFJF.',
        creators: [{ name: 'Assis, Nelson', affiliation: 'UFJF' }],
        communities: [{ identifier: 'hep_group-ufjf' }] // 
      }
    }, {
      params: { access_token: process.env.ZENODO_TOKEN }
    });

    const bucketUrl = zenodoRes.data.links.bucket;
    const depositionId = zenodoRes.data.id;

    // Passo B: Upload do arquivo físico para o bucket do Zenodo
    await axios.put(`${bucketUrl}/${req.file.originalname}`, req.file.buffer, {
      params: { access_token: process.env.ZENODO_TOKEN }
    });

    // Passo C: Salvar metadados no MongoDB
    const newSimulation = new Simulation({
      filename: req.file.originalname,
      zenodo_id: depositionId,
      download_url: zenodoRes.data.links.latest_draft || zenodoRes.data.links.html,
      physics_params: metadata.physics_params,
      software_stack: metadata.software_stack,
      provenance: {
          author: metadata.provenance?.author || 'Nelson Assis',
          validation_status: metadata.provenance?.validation_status || 'pending'
      }
    });

    await newSimulation.save();
    res.status(201).json({ message: "Upload concluído com sucesso!", id: newSimulation._id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha no processo de upload." });
  }
});

// 3. DOWNLOAD VIA PROXY (Para arquivos privados/drafts)
app.get('/api/repository/download/:id', async (req, res) => {
  try {
    const sim = await Simulation.findById(req.params.id);
    if (!sim) return res.status(404).send("Simulação não encontrada.");

    // Busca os detalhes do arquivo no Zenodo para pegar a URL direta
    const zenodoFiles = await axios.get(`https://zenodo.org/api/deposit/depositions/${sim.zenodo_id}/files`, {
      params: { access_token: process.env.ZENODO_TOKEN }
    });

    const fileUrl = zenodoFiles.data[0].links.download;

    // Faz o streaming do arquivo do Zenodo para o usuário
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      params: { access_token: process.env.ZENODO_TOKEN }
    });

    res.setHeader('Content-Disposition', `attachment; filename=${sim.filename}`);
    response.data.pipe(res);

  } catch (err) {
    res.status(500).send("Erro ao processar download.");
  }
});

// 4. EXCLUIR (Soft Delete protegido)
app.delete('/api/repository/simulations/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Simulation.findByIdAndUpdate(
      req.params.id,
      { 
        'provenance.is_deleted': true, 
        'provenance.deleted_at': new Date() 
      },
      { new: true }
    );
    
    if (!deleted) return res.status(404).json({ error: "Arquivo não encontrado." });
    res.json({ message: "Simulação movida para a lixeira." });
    
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir." });
  }
});

app.listen(PORT, () => {
  console.log(PORT, `\n✅ Servidor rodando na porta ${PORT}`);
});
