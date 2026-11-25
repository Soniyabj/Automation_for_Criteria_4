const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');

const Student = require('../models/Student');
const Batch = require('../models/Batch');
const auth = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

// Helper: normalize header names (lowercase, remove spaces, hyphen, underscore)
function norm(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s\-_]/g, '');
}

// Map normalized header to field name
function mapHeaderToField(h) {
  const n = norm(h);

  if (['sno', 's.no', 'serialno', 'slno'].includes(n)) return 'sno';
  if (['name'].includes(n)) return 'name';
  if (['usn', 'usnno'].includes(n)) return 'usn';

  if (['kcetrank', 'kcentrank', 'kcekrank'].includes(n)) return 'kCetRank';
  if (['comedkrank', 'comedk'].includes(n)) return 'comedkRank';
  if (['typeofadmission', 'admissiontype'].includes(n)) return 'admissionType';
  if (['actualcategory'].includes(n)) return 'actualCategory';
  if (['admittedcategory'].includes(n)) return 'admittedCategory';

  return null;
}

// ==================== LIST BATCHES FOR ADMISSION ====================
// Returns all batches (you can filter by branch on frontend if needed)
router.get('/batches', auth, async (req, res) => {
  try {
    const batches = await Batch.find().sort({ branch: 1, batchName: 1 });
    res.json(batches);
  } catch (err) {
    console.error('Admission batches error:', err);
    res.status(500).json({ message: 'Failed to fetch batches' });
  }
});

// ==================== GET ADMISSION DATA FOR BATCH ====================
router.get('/:batchName', auth, async (req, res) => {
  try {
    const { batchName } = req.params;

    const batch = await Batch.findOne({ batchName: Number(batchName) });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const students = await Student.find({
      batchName: batch.batchName,
      branch: batch.branch
    }).sort({ sno: 1 });

    // Return only needed fields to frontend
    const rows = students.map((s) => ({
      _id: s._id,
      sno: s.sno,
      name: s.name,
      usn: s.usn,
      kCetRank: s.kCetRank ?? '',
      comedkRank: s.comedkRank ?? '',
      admissionType: s.admissionType || '',
      actualCategory: s.actualCategory || '',
      admittedCategory: s.admittedCategory || '',
      branch: s.branch,
      batchName: s.batchName
    }));

    res.json({ batch, rows });
  } catch (err) {
    console.error('Get admission error:', err);
    res.status(500).json({ message: 'Failed to fetch admission data' });
  }
});

// ==================== SAVE ADMISSION TABLE ====================
router.post('/:batchName', auth, async (req, res) => {
  try {
    const { batchName } = req.params;
    const { rows } = req.body;

    const batch = await Batch.findOne({ batchName: Number(batchName) });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    if (!Array.isArray(rows)) {
      return res.status(400).json({ message: 'rows must be an array' });
    }

    for (const row of rows) {
      const sno = row.sno;
      const name = (row.name || '').trim();
      const usn = (row.usn || '').trim();

      // compulsory fields
      if (!sno && sno !== 0) continue;
      if (!name || !usn) continue;

      const filter = {
        branch: batch.branch,
        batchName: batch.batchName,
        usn
      };

      const update = {
        sno,
        name,
        kCetRank: row.kCetRank || undefined,
        comedkRank: row.comedkRank || undefined,
        admissionType: row.admissionType || '',
        actualCategory: row.actualCategory || '',
        admittedCategory: row.admittedCategory || ''
      };

      await Student.findOneAndUpdate(
        filter,
        { $set: update, $setOnInsert: { branch: batch.branch, batchName: batch.batchName } },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save admission error:', err);
    res.status(500).json({ message: 'Failed to save admission data' });
  }
});

// ==================== IMPORT EXCEL FOR ADMISSION ====================
router.post(
  '/:batchName/import',
  auth,
  upload.single('file'),
  async (req, res) => {
    try {
      const { batchName } = req.params;
      const batch = await Batch.findOne({ batchName: Number(batchName) });
      if (!batch) {
        return res.status(404).json({ message: 'Batch not found' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];

      if (!sheet) {
        return res.status(400).json({ message: 'Empty Excel sheet' });
      }

      const headerRow = sheet.getRow(1);
      const colMap = {};
      headerRow.eachCell((cell, colNumber) => {
        const field = mapHeaderToField(cell.value);
        if (field) colMap[colNumber] = field;
      });

      // S.No, Name, USN must be present
      const requiredFields = ['sno', 'name', 'usn'];
      const presentFields = Object.values(colMap);
      const missingRequired = requiredFields.filter(
        (rf) => !presentFields.includes(rf)
      );
      if (missingRequired.length > 0) {
        return res.status(400).json({
          message:
            'Missing required columns. Required: S.No, Name, USN (any case/spacing).'
        });
      }

      const rowsToSave = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const rowObj = {};
        row.eachCell((cell, colNumber) => {
          const field = colMap[colNumber];
          if (!field) return;
          rowObj[field] = cell.value;
        });

        if (!rowObj.sno && rowObj.sno !== 0) return;
        if (!rowObj.name || !rowObj.usn) return;

        rowsToSave.push(rowObj);
      });

      // save/merge rows
      for (const row of rowsToSave) {
        const filter = {
          branch: batch.branch,
          batchName: batch.batchName,
          usn: String(row.usn).trim()
        };

        const update = {
          sno: Number(row.sno),
          name: String(row.name).trim(),
          kCetRank: row.kCetRank || row.kcetRank || undefined,
          comedkRank: row.comedkRank || row.comedkrank || undefined,
          admissionType: row.admissionType || '',
          actualCategory: row.actualCategory || '',
          admittedCategory: row.admittedCategory || ''
        };

        await Student.findOneAndUpdate(
          filter,
          { $set: update, $setOnInsert: { branch: batch.branch, batchName: batch.batchName } },
          { upsert: true }
        );
      }

      res.json({ success: true, count: rowsToSave.length });
    } catch (err) {
      console.error('Import admission Excel error:', err);
      res.status(500).json({ message: 'Failed to import Excel' });
    }
  }
);

module.exports = router;
