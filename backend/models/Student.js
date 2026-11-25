// backend/models/Student.js
const mongoose = require('mongoose');

const semSchema = new mongoose.Schema({
  semNumber: Number,
  passed: { type: Boolean, default: null },
  excluded: { type: Boolean, default: false }
}, { _id: false });

const yearSchema = new mongoose.Schema({
  yearNumber: Number,
  passed: { type: Boolean, default: null }
}, { _id: false });

const studentSchema = new mongoose.Schema({
  branch: { type: String, required: true },
  batchName: { type: Number, required: true },

  // Result Sheet Fields
  sno: Number,
  name: String,
  usn: { type: String, required: true },
  sem: [semSchema],
  year: [yearSchema],
  finalResult: { type: String, default: '' },
  placed: { type: Boolean, default: false },
  backlogCleared: { type: Boolean, default: null },
  offerLetterPath: { type: String, default: '' },
  remarks: { type: String, default: '' },

  // 🔥 Admission Fields
  kCetRank: { type: Number },
  comedkRank: { type: Number },
  admissionType: {
    type: String,
    enum: ['K-CET', 'COMED-K', 'Management', ''],
    default: ''
  },
  actualCategory: { type: String },
  admittedCategory: { type: String },

}, { timestamps: true });

studentSchema.index({ branch: 1, batchName: 1, usn: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema);
