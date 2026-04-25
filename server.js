require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Importações internas
const Simulation = require('./models/Simulation');
const verifyAdmin = require('./middleware/auth');

const app = express();
app.use(express.json());

// ==========================================
// CONFIGURAÇÕES DE NUVEM E DISCO
// ==========================================
// Multer: Salva temporariamente no disco para não explodir a RAM
const upload = multer({ dest: 'temp/' });

// Autenticação Google Drive via Service Account
const gcpCredentials = process.env.GCP_JSON_CONTENT 
  ? JSON.parse(process.env.GCP_JSON_CONTENT) 
  : require('./gcp-service-account.json');

const auth = new google.auth.GoogleAuth({
  credentials: gcpCredentials,
  scopes: ['https://www.googleapis.com/auth/drive'] 
});
const drive = google.drive({ version: 'v3', auth });

// ==========================================
// CONEXÃO COM MONGODB
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => console.error('🔴 Erro no MongoDB:', err));


// ==========================================
// ROTAS DA API
// ==========================================

// 1. LOGIN (Gera o Token JWT)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin', user: username }, process.env.JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }
  res.status(401).json({ error: "Credenciais inválidas." });
});

// 2. UPLOAD (Arquivo -> Drive -> Mongo)
app.post('/api/repository/simulations', upload.single('simulation_file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    const metadata = JSON.parse(req.body.metadata || '{}');

    // A. Faz o upload para o Google Drive Compartilhado
    const driveResponse = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        parents: [process.env.DRIVE_FOLDER_ID]
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path)
      },
      fields: 'id',
      supportsAllDrives: true // <-- CORREÇÃO CRÍTICA AQUI
    });

    // B. Salva os metadados no MongoDB com o ID do Drive
    const newSimulation = new Simulation({
      file_info: {
        name: req.file.originalname,
        size_bytes: req.file.size,
        format: metadata.format || 'unknown',
        external_id: driveResponse.data.id
      },
      physics_params: metadata.physics_params,
      software_stack: metadata.software_stack,
      provenance: metadata.provenance
    });

    const saved = await newSimulation.save();

    // C. Limpa o arquivo temporário do servidor
    fs.unlinkSync(req.file.path);

    res.status(201).json({ message: "Upload concluído!", id: saved._id });
  } catch (err) {
    console.error("🔴 Erro real durante o upload:", err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (cleanupErr) { }
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. BUSCA COMUNITÁRIA (Com Filtros)
app.get('/api/repository/simulations', async (req, res) => {
  try {
    const { event_type, energy_gev, generator, status } = req.query;
    const dbQuery = {};

    if (event_type) dbQuery['physics_params.event_type'] = event_type;
    if (energy_gev) dbQuery['physics_params.energy_gev'] = Number(energy_gev);
    if (generator) dbQuery['software_stack.generator'] = generator;
    
    dbQuery['provenance.validation_status'] = status || 'verified';

    const results = await Simulation.find(dbQuery).sort({ 'provenance.created_at': -1 });
    res.json({ total: results.length, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DOWNLOAD DIRETO (Redirecionamento)
app.get('/api/repository/download/:id', async (req, res) => {
  try {
    const simulation = await Simulation.findById(req.params.id);
    if (!simulation) return res.status(404).json({ error: "Arquivo não encontrado." });

    const file = await drive.files.get({
      fileId: simulation.file_info.external_id,
      fields: 'webContentLink',
      supportsAllDrives: true // <-- ADICIONADO AQUI TAMBÉM
    });

    res.redirect(file.data.webContentLink);
  } catch (err) {
    res.status(500).json({ error: "Erro ao gerar link de download." });
  }
});

// 5. DELEÇÃO PROTEGIDA (Soft Delete)
app.delete('/api/repository/simulations/:id', verifyAdmin, async (req, res) => {
  try {
    const updated = await Simulation.findByIdAndUpdate(
      req.params.id,
      { 'provenance.is_deleted': true, 'provenance.deleted_at': new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Registro não encontrado." });
    
    console.log(`[AUDIT] Arquivo ${updated._id} deletado por ${req.user.user}`);
    res.json({ message: "Simulação movida para a lixeira (Soft Delete)." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// INICIA O SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Portal de Dados rodando na porta ${PORT}`);
});
