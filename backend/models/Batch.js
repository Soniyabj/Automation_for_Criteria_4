const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  branch: { type: String, required: true, trim: true },
  batchName: { type: Number, required: true } // 4-digit year e.g., 2022
}, { timestamps: true });

batchSchema.index({ branch: 1, batchName: 1 }, { unique: true });

module.exports = mongoose.model('Batch', batchSchema);
