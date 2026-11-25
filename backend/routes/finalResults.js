const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const FinalResult = require('../models/FinalResult');
const Batch = require('../models/Batch');
const AuditLog = require('../models/AuditLog');

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator role required' });
  }
  next();
}

router.get('/', auth, async (req, res) => {
  const query = {};
  if (req.query.batchName) query.batchName = String(req.query.batchName);
  if (req.query.graduationYear) query.graduationYear = Number(req.query.graduationYear);
  if (req.query.branch) query.branch = req.query.branch;
  res.json(await FinalResult.find(query).sort({ graduationYear: -1 }).lean());
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.batchName || !body.graduationYear) {
      return res.status(400).json({ message: 'batchName and graduationYear are required' });
    }

    const batch = await Batch.findOne({
      batchName: Number(body.batchName),
      branch: body.branch || 'INFORMATION SCIENCE AND ENGINEERING',
    });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const record = await FinalResult.create({
      batchId: batch._id,
      batchName: String(batch.batchName),
      branch: batch.branch,
      graduationYear: Number(body.graduationYear),
      admitted: Number(body.admitted || 0),
      excluded: Number(body.excluded || 0),
      passed: Number(body.passed || 0),
      passedWithinStipulatedPeriod: body.passedWithinStipulatedPeriod === undefined
        ? undefined
        : Number(body.passedWithinStipulatedPeriod),
      failed: Number(body.failed || 0),
      total: Number(body.total || 0),
      notes: String(body.notes || ''),
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    await AuditLog.create({
      action: 'final-result.create',
      entityType: 'FinalResult',
      entityId: record._id,
      actorId: req.user.id,
      ip: req.ip,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create FinalResult', error: err.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const record = await FinalResult.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'FinalResult not found' });

    const allowed = [
      'admitted',
      'excluded',
      'passed',
      'passedWithinStipulatedPeriod',
      'failed',
      'total',
      'notes',
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        record[key] = key === 'notes' ? String(req.body[key] || '') : Number(req.body[key] || 0);
      }
    }
    record.updatedBy = req.user.id;
    await record.save();

    await AuditLog.create({
      action: 'final-result.update',
      entityType: 'FinalResult',
      entityId: record._id,
      actorId: req.user.id,
      ip: req.ip,
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update FinalResult', error: err.message });
  }
});

module.exports = router;
