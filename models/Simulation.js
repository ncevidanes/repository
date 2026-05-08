const mongoose = require('mongoose');

const simulationSchema = new mongoose.Schema({
  file_info: {
    name: { type: String, required: true },
    size_bytes: Number,
    format: String,
    storage_provider: { type: String, default: 'google_drive' },
    external_id: { type: String, required: true }
  },
  physics_params: {
    event_type: String, // ex: Minimum Bias
    energy_gev: Number, // ex: 13600
    sqrt_s: String,
    geometry: String
  },
  software_stack: {
    generator: String,  // ex: Pythia8
    simulator: String,  // ex: Geant4
    framework: String
  },
  provenance: {
    author: String,
    institution: String,
    created_at: { type: Date, default: Date.now },
    validation_status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    is_deleted: { type: Boolean, default: false },
    deleted_at: Date
  },
  tags: [String]
});

// Query Hook: Garante o Soft Delete nativamente.
// Nenhuma busca (find, findOne) trará arquivos deletados por acidente.
simulationSchema.pre(/^find/, function(next) {
  this.find({ 'provenance.is_deleted': { $ne: true } });
  next();
});

module.exports = mongoose.model('Simulation', simulationSchema);