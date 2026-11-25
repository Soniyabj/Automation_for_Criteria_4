// backend/models/FinalResult.js
const mongoose = require('mongoose');

const FinalResultSchema = new mongoose.Schema({
  batchName: { type: String, required: true, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  branch: { type: String, required: true, default: 'INFORMATION SCIENCE AND ENGINEERING' },
  graduationYear: { type: Number, required: true, index: true },

  // admitted fields (various possible names supported)
  admitted: { type: Number, default: 0 },
  admittedCount: { type: Number, default: 0 },
  admissionCount: { type: Number, default: 0 },

  // excluded fields
  excluded: { type: Number, default: 0 },
  excludedCount: { type: Number, default: 0 },

  // passed / failed / totals
  passed: { type: Number, default: 0 },
  passedCount: { type: Number, default: 0 },
  totalPassed: { type: Number, default: 0 },

  failed: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },

  total: { type: Number, default: 0 },
  totalStudents: { type: Number, default: 0 },
  passedWithinStipulatedPeriod: { type: Number, min: 0 },

  // optional meta
  notes: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// convenience pre-save normalization
FinalResultSchema.pre('save', function (next) {
  if ((!this.total || this.total === 0) && (this.passed || this.failed)) {
    this.total = (Number(this.passed) || 0) + (Number(this.failed) || 0);
    this.totalStudents = this.total;
  }
  if ((!this.admitted || this.admitted === 0) && this.admittedCount) {
    this.admitted = this.admittedCount;
  }
  if ((!this.excluded || this.excluded === 0) && this.excludedCount) {
    this.excluded = this.excludedCount;
  }
  if ((!this.passed || this.passed === 0) && (this.passedCount || this.totalPassed)) {
    this.passed = this.passed || this.passedCount || this.totalPassed;
  }
  next();
});

module.exports = mongoose.model('FinalResult', FinalResultSchema);
