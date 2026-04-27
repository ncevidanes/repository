require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const axios = require('axios'); // <-- A novidade que liga seu app ao CERN
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Importações internas
const Simulation = require('./models/Simulation');
const verifyAdmin = require('./middleware/auth');

const app = express();

// Permite servir a interface web (o arquivo index.html dentro da pasta 'public')
app.use(express.static('public'));
app.use(express.json());

// ==========================================
// CONFIGURAÇÕES
// ==========================================
// Salva temporariamente no disco para não estourar a memória RAM do Render
const upload = multer({ dest: 'temp/' });

// ==========================================
// CONEXÃO COM MONGODB
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => console.error('🔴 Erro no MongoDB:', err));


// ==========================================
// ROTAS DA API
// ==========================================

// 1. LOGIN
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin', user: username }, process.env.JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }
  res.status(401).json({ error: "Credenciais inválidas." });
});

// 2. UPLOAD (O "Motor" de Integração: Render -> Zenodo -> Mongo)
app.post('/api/repository/simulations', upload.single('simulation_file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    const metadata = JSON.parse(req.body.metadata || '{}');

    // Passo A: Cria um "espaço" vazio no Zenodo
    const createRes = await axios.post('https://zenodo.org/api/deposit/depositions', {}, {
      params: { access_token: process.env.ZENODO_TOKEN }
    });
    const bucketUrl = createRes.data.links.bucket;
    const depositId = createRes.data.id;

    // Passo B: Sobe o arquivo físico do servidor do Render para o Zenodo
    const fileStream = fs.createReadStream(req.file.path);
    await axios.put(`${bucketUrl}/${req.file.originalname}`, fileStream, {
      params: { access_token: process.env.ZENODO_TOKEN },
      headers: { 
        'Content-Type': 'application/octet-stream',
        'Content-Length': req.file.size.toString()
      }
    });

    // Passo C: Salva o registro no seu MongoDB com o ID oficial do CERN
    const newSimulation = new Simulation({
      file_info: {
        name: req.file.originalname,
        size_bytes: req.file.size,
        format: metadata.format || 'unknown',
        external_id: depositId.toString() // Guardamos o ID do Zenodo para downloads futuros
      },
      physics_params: metadata.physics_params,
      software_stack: metadata.software_stack,
      provenance: metadata.provenance
    });
    const saved = await newSimulation.save();

    // Passo D: Limpa o arquivo temporário do Render
    fs.unlinkSync(req.file.path);

    res.status(201).json({ 
      message: "Upload para o Zenodo e registro no Mongo concluídos com sucesso!", 
      id: saved._id 
    });

  } catch (err) {
    console.error("🔴 Erro na comunicação com o Zenodo:", err.response ? err.response.data : err.message);
    // Garante que o arquivo temporário seja apagado mesmo se der erro
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    res.status(500).json({ error: "Falha ao processar o arquivo para o repositório." });
  }
});

// 3. BUSCA COMUNITÁRIA (Usada pela sua Interface Web)
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

// 4. DOWNLOAD DIRETO (Redireciona para o Zenodo)
app.get('/api/repository/download/:id', async (req, res) => {
  try {
    const simulation = await Simulation.findById(req.params.id);
    if (!simulation) return res.status(404).json({ error: "Arquivo não encontrado." });

    // Monta o link permanente do Zenodo usando o ID e o nome do arquivo
    const zenodoLink = `https://zenodo.org/record/${simulation.file_info.external_id}/files/${simulation.file_info.name}`;
    res.redirect(zenodoLink);
    
  } catch (err) {
    res.status(500).json({ error: "Erro ao gerar link de download." });
  }
});

// INICIA O SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Portal de Dados rodando na porta ${PORT}`));
