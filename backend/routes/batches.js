// backend/routes/batches.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const auth = require('../middleware/auth');
const Batch = require('../models/Batch');
const Student = require('../models/Student');
const { parseExcelToStudents } = require('../utils/excel');
const { computeStudentResults } = require('../utils/compute');
const { handleMongoError } = require('../utils/errorHandler');

const FIXED_BRANCH = 'INFORMATION SCIENCE AND ENGINEERING';

// ---------------- Upload config ----------------
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

const offerLetterUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// ---------------- Helpers ----------------
function normalizeBatchName(batchName) {
  if (batchName === undefined || batchName === null) return undefined;
  const n = Number(batchName);
  return Number.isFinite(n) ? n : batchName;
}

function startedAtSemGE3(semArr) {
  if (!Array.isArray(semArr) || semArr.length === 0) return false;
  let minSem = Infinity;
  for (const s of semArr) {
    if (!s || typeof s.semNumber !== 'number') continue;
    minSem = Math.min(minSem, s.semNumber);
  }
  return minSem >= 3 && minSem !== Infinity;
}

function needsBacklogClearedForSemArray(semArr) {
  if (!Array.isArray(semArr)) return false;
  let hasFail = false;
  let hasFalse = false;

  for (const s of semArr) {
    if (!s) continue;
    if (s.excluded === true) {
      hasFalse = true;
    }
    if (s.passed === false && s.excluded !== true) {
      hasFail = true;
    }
  }

  return hasFail && !hasFalse;
}

const isExcludedStudentRecord = (s) => {
  if (!s) return false;
  if (String(s.finalResult || '').toLowerCase() === 'excluded') return true;
  if (Array.isArray(s.sem) && s.sem.some(x => x && x.excluded === true)) return true;
  return false;
};

function mergeSemArrays(existingSemArr = [], excelSemArr = []) {
  const merged = [];
  const existingByNum = new Map();
  const excelByNum = new Map();

  for (const s of existingSemArr || []) {
    if (!s || typeof s.semNumber !== 'number') continue;
    existingByNum.set(s.semNumber, s);
  }
  for (const s of excelSemArr || []) {
    if (!s || typeof s.semNumber !== 'number') continue;
    excelByNum.set(s.semNumber, s);
  }

  for (let i = 1; i <= 8; i++) {
    if (excelByNum.has(i)) {
      const e = excelByNum.get(i);
      merged.push({
        semNumber: i,
        passed: typeof e.passed === 'boolean' ? e.passed : undefined,
        excluded: !!e.excluded,
      });
    } else if (existingByNum.has(i)) {
      const ex = existingByNum.get(i);
      merged.push({
        semNumber: i,
        passed: typeof ex.passed === 'boolean' ? ex.passed : undefined,
        excluded: !!ex.excluded,
      });
    }
  }

  return merged;
}

// ---------------- Routes ----------------

// Create batch
router.post('/', auth, async (req, res) => {
  try {
    const { batchName } = req.body;
    if (batchName === undefined || batchName === null) {
      return res.status(400).json({ message: 'batchName required' });
    }
    const bN = normalizeBatchName(batchName);
    if (!/^[0-9]{4}$/.test(String(bN))) {
      return res.status(400).json({ message: 'batchName must be a 4-digit year' });
    }

    const branch = FIXED_BRANCH;

    const existing = await Batch.findOne({ branch, batchName: bN });
    if (existing) return res.status(400).json({ message: 'Duplicate entry: batch already exists' });

    const b = new Batch({ branch, batchName: bN });
    await b.save();
    res.json(b);
  } catch (err) {
    console.error('Create batch error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// List batches
router.get('/', auth, async (req, res) => {
  try {
    const branchQuery = FIXED_BRANCH;
    const batches = await Batch.find({ branch: branchQuery }).sort({ batchName: -1 });
    res.json(batches);
  } catch (err) {
    console.error('List batches error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// Get batch + students
router.get('/:branch/:batchName', auth, async (req, res) => {
  try {
    const branch = FIXED_BRANCH;
    const batchName = normalizeBatchName(req.params.batchName);
    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const students = await Student.find({ branch, batchName }).sort({ sno: 1 });
    res.json({ batch, students });
  } catch (err) {
    console.error('Get batch error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// -------- Import Excel (CreateBatch + UpdateBatch) --------
// Option B: if USN exists -> UPDATE student; else -> CREATE new student
// Accepts formats:
//   [s.no, name, usn]
//   [s.no, name, usn, sem1..sem8]
//   [s.no, name, usn, sem1..sem8, backlogCleared?, remarks]
//   [s.no, name, usn, sem1..sem8, remarks]
router.post('/:branch/:batchName/import', auth, upload.single('file'), async (req, res) => {
  try {
    const branch = FIXED_BRANCH;
    const batchName = normalizeBatchName(req.params.batchName);

    console.log('Import called:', { params: req.params, file: req.file && { originalname: req.file.originalname, path: req.file.path, size: req.file.size } });

    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) {
      console.warn('Import: batch not found', { branch, batchName });
      return res.status(404).json({ message: 'Batch not found' });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ message: 'file required (field name "file")' });

    // check file exists
    if (!fs.existsSync(file.path)) {
      console.error('Uploaded file not found on disk:', file.path);
      return res.status(500).json({ message: 'Uploaded file missing on server' });
    }

    let rows;
    try {
      rows = await parseExcelToStudents(file.path);
    } catch (e) {
      console.error('parseExcelToStudents failed:', e && e.stack ? e.stack : e);
      return res.status(500).json({ message: 'Failed to parse Excel file', error: String(e) });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('Import: parsed zero rows; returning imported:0 (keeps empty as-is)');
      return res.json({ imported: 0, created: 0, updated: 0, skipped: 0 });
    }

    // existing students
    const existingList = await Student.find({ branch, batchName });
    const existingByUSN = new Map(existingList.map(s => [String(s.usn || '').toUpperCase(), s]));

    const created = [];
    const updated = [];
    let skipped = 0;
    let processedRows = 0;

    for (const r of rows) {
      processedRows++;
      try {
        const usn = (r.usn || '').toString().trim().toUpperCase();
        if (!usn) {
          skipped++;
          continue;
        }

        const excelSemArr = Array.isArray(r.sem)
          ? r.sem.map(x => ({
              semNumber: x.semNumber,
              passed: (x.passed === true || x.passed === false) ? x.passed : undefined,
              excluded: !!x.excluded,
            }))
          : [];

        const backlogCleared =
          typeof r.backlogCleared === 'boolean' ? r.backlogCleared : undefined;

        const existing = existingByUSN.get(usn);

        if (existing) {
          // -------- UPDATE EXISTING STUDENT --------
          if (r.sno !== undefined && r.sno !== null && r.sno !== '') {
            const snoNum = Number(r.sno);
            if (Number.isFinite(snoNum)) existing.sno = snoNum;
          }

          if (r.name && r.name.toString().trim() !== '') {
            existing.name = r.name.toString().trim();
          }

          if (r.remarks && r.remarks.toString().trim() !== '') {
            existing.remarks = r.remarks.toString().trim();
          }

          if (typeof backlogCleared === 'boolean') {
            existing.backlogCleared = backlogCleared;
          }

          if (r.placed === true) {
            existing.placed = true;
          }
          if (r.offerLetterPath && r.offerLetterPath.toString().trim() !== '') {
            existing.offerLetterPath = r.offerLetterPath.toString().trim();
          }

          // merge sem arrays (excel overrides only the sems provided)
          existing.sem = mergeSemArrays(existing.sem, excelSemArr);

          // compute + save
          computeStudentResults(existing);
          await existing.save();
          updated.push(existing);
        } else {
          // -------- CREATE NEW STUDENT --------
          const newSemArr = excelSemArr;

          const s = new Student({
            branch,
            batchName,
            sno: r.sno,
            name: r.name || '',
            usn,
            remarks: r.remarks || '',
            placed: !!r.placed,
            offerLetterPath: r.offerLetterPath || '',
            sem: newSemArr,
            backlogCleared,
          });

          // For imports we are intentionally permissive (do not block on missing remarks/backlog/offer)
          computeStudentResults(s);
          await s.save();
          created.push(s);
          existingByUSN.set(usn, s);
        }
      } catch (rowErr) {
        // Do not fail whole import for a single bad row — count as skipped and log
        skipped++;
        console.error('Error processing imported row:', rowErr && rowErr.stack ? rowErr.stack : rowErr, { row: r });
        continue;
      }
    }

    console.log('Import summary:', {
      processedRows,
      created: created.length,
      updated: updated.length,
      skipped,
    });

    return res.json({
      importedRows: processedRows,
      created: created.length,
      updated: updated.length,
      skipped,
      createdIds: created.map(x => x._id),
      updatedIds: updated.map(x => x._id),
    });
  } catch (err) {
    console.error('Excel import error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

/**
 * Bulk add/update students for a batch (upsert behavior)
 * Used by CreateBatch "Save" and UpdateBatch "Save All"
 */
router.post('/:branch/:batchName/students/bulk', auth, async (req, res) => {
  try {
    const branch = FIXED_BRANCH;
    const batchName = normalizeBatchName(req.params.batchName);
    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const students = req.body.students || [];
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'students array required' });
    }

    const existingList = await Student.find({ branch, batchName });
    const existingByUSN = new Map(existingList.map(s => [String(s.usn || '').toLowerCase(), s]));

    const created = [];
    const updated = [];

    for (let idx = 0; idx < students.length; idx++) {
      const st = students[idx];
      const usnRaw = (st.usn || '').toString().trim();
      if (!usnRaw) {
        return res
          .status(400)
          .json({ message: `each student must have a usn (row ${idx + 1})` });
      }
      const usn = usnRaw.toUpperCase();

      const semArr = Array.isArray(st.sem)
        ? st.sem.map(s => ({
            semNumber: s.semNumber,
            passed: typeof s.passed === 'boolean' ? s.passed : undefined,
            excluded: !!s.excluded,
          }))
        : [];

      const backlogCleared =
        typeof st.backlogCleared === 'boolean' ? st.backlogCleared : undefined;

      // placement validation
      if (st.placed && !(st.offerLetterPath || '').toString().trim()) {
        return res
          .status(400)
          .json({ message: `offerLetterPath required when placed=true for ${usn}` });
      }

      // backlogCleared only when needed (Fail and no False)
      if (needsBacklogClearedForSemArray(semArr) && backlogCleared === undefined) {
        return res.status(400).json({
          message: `backlogCleared (Yes/No) required for student ${usn} having failed semester`,
        });
      }

      const existing = existingByUSN.get(usn.toLowerCase());

      if (existing) {
        // update existing
        existing.sno = st.sno;
        existing.name = st.name;
        existing.usn = usn;
        existing.remarks = st.remarks || '';
        existing.placed = !!st.placed;
        existing.offerLetterPath = st.offerLetterPath || '';
        existing.sem = semArr;
        existing.backlogCleared = backlogCleared;
        computeStudentResults(existing);
        await existing.save();
        updated.push(existing);
      } else {
        // validate NEW COC/COB/Lateral students
        if (startedAtSemGE3(semArr) && !(st.remarks || '').toString().trim()) {
          return res.status(400).json({
            message: `remarks required for new COC/COB/Lateral student ${usn}`,
          });
        }

        const s = new Student({
          branch,
          batchName,
          sno: st.sno,
          name: st.name,
          usn,
          remarks: st.remarks || '',
          placed: !!st.placed,
          offerLetterPath: st.offerLetterPath || '',
          sem: semArr,
          backlogCleared,
        });
        computeStudentResults(s);
        await s.save();
        created.push(s);
      }
    }

    res.json({
      message: 'Students processed',
      created: created.length,
      updated: updated.length,
      createdIds: created.map(x => x._id),
      updatedIds: updated.map(x => x._id),
    });
  } catch (err) {
    console.error('Bulk students error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// -------- Update single student by id --------
router.put('/:branch/:batchName/students/:sid', auth, async (req, res) => {
  try {
    const { sid } = req.params;
    const payload = req.body || {};
    const s = await Student.findById(sid);
    if (!s) return res.status(404).json({ message: 'Student not found' });

    const allowed = [
      'sno',
      'name',
      'usn',
      'sem',
      'remarks',
      'placed',
      'offerLetterPath',
      'backlogCleared',
    ];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        if (k === 'usn') s[k] = (payload[k] || '').toString().trim().toUpperCase();
        else s[k] = payload[k];
      }
    }

    if (startedAtSemGE3(s.sem) && !(s.remarks || '').toString().trim()) {
      return res
        .status(400)
        .json({ message: 'remarks required for COC/COB/Lateral student' });
    }

    if (s.placed && !(s.offerLetterPath || '').toString().trim()) {
      return res
        .status(400)
        .json({ message: 'offerLetterPath required when placed=true' });
    }

    if (
      needsBacklogClearedForSemArray(s.sem) &&
      (s.backlogCleared === undefined || s.backlogCleared === null)
    ) {
      return res.status(400).json({
        message:
          'backlogCleared (Yes/No) required for student with failed semester',
      });
    }

    computeStudentResults(s);
    await s.save();
    res.json(s);
  } catch (err) {
    console.error('Update student error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// -------- Upload offer letter --------
router.post(
  '/:branch/:batchName/students/:sid/offer',
  auth,
  offerLetterUpload.single('file'),
  async (req, res) => {
    try {
      const { sid } = req.params;
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'File required' });

      const student = await Student.findById(sid);
      if (!student) return res.status(404).json({ message: 'Student not found' });

      if (!student.placed) {
        return res
          .status(400)
          .json({ message: 'Cannot upload offer letter for student not marked as placed' });
      }

      student.offerLetterPath = '/uploads/' + file.filename;
      await student.save();

      res.json({ message: 'Offer letter uploaded', fileUrl: student.offerLetterPath });
    } catch (err) {
      console.error('Offer upload error:', err && err.stack ? err.stack : err);
      return handleMongoError(err, res);
    }
  }
);

// -------- Aggregates --------
router.get('/:branch/:batchName/aggregates', auth, async (req, res) => {
  try {
    const branch = FIXED_BRANCH;
    const batchName = normalizeBatchName(req.params.batchName);
    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const students = await Student.find({ branch, batchName });

    const semAgg = {};
    for (let i = 1; i <= 8; i++) {
      semAgg['sem' + i] = {
        pass: 0,
        fail: 0,
        pending: 0,
        excluded: 0,
        considered: 0,
        passPercent: 0,
        total_students: 0,
      };
    }

    const yearAgg = {};
    for (let y = 1; y <= 4; y++) {
      yearAgg['year' + y] = {
        pass: 0,
        fail: 0,
        pending: 0,
        excluded: 0,
        considered: 0,
        passPercent: 0,
        total_students: 0,
      };
    }

    const finalAgg = {
      pass: 0,
      fail: 0,
      pending: 0,
      excluded: 0,
      considered: 0,
      passPercent: 0,
      placed: 0,
    };
    let totalPlaced = 0;

    for (const s of students) {
      const excludedStudent = isExcludedStudentRecord(s);

      if (s.placed) totalPlaced++;

      // per-sem
      for (let i = 1; i <= 8; i++) {
        const bucket = semAgg['sem' + i];
        const semObj = Array.isArray(s.sem)
          ? s.sem.find(x => x && x.semNumber === i)
          : null;
        if (semObj) {
          if (semObj.excluded === true) {
            bucket.excluded++;
          } else if (semObj.passed === true) {
            bucket.pass++;
            bucket.considered++;
          } else if (semObj.passed === false) {
            bucket.fail++;
            bucket.considered++;
          } else {
            bucket.pending++;
          }
        } else {
          bucket.pending++;
        }
        bucket.total_students = bucket.considered;
      }

      // per-year
      for (let y = 1; y <= 4; y++) {
        const yb = yearAgg['year' + y];
        const yearObj = Array.isArray(s.year)
          ? s.year.find(x => x && x.yearNumber === y)
          : null;
        if (yearObj) {
          if (yearObj.excluded === true) {
            yb.excluded++;
          } else if (yearObj.passed === true) {
            yb.pass++;
            yb.considered++;
          } else if (yearObj.passed === false) {
            yb.fail++;
            yb.considered++;
          } else {
            yb.pending++;
          }
        } else {
          yb.pending++;
        }
        yb.total_students = yb.considered;
      }

      // final
      if (excludedStudent) {
        finalAgg.excluded++;
      } else {
        const fr = String(s.finalResult || '').toLowerCase();
        if (fr === 'pass') {
          finalAgg.pass++;
          finalAgg.considered++;
        } else if (fr === 'fail') {
          finalAgg.fail++;
          finalAgg.considered++;
        } else {
          finalAgg.pending++;
        }
      }
    }

    // percentages
    for (let i = 1; i <= 8; i++) {
      const b = semAgg['sem' + i];
      b.passPercent = b.considered > 0 ? +((b.pass / b.considered) * 100).toFixed(2) : 0;
    }
    for (let y = 1; y <= 4; y++) {
      const b = yearAgg['year' + y];
      b.passPercent = b.considered > 0 ? +((b.pass / b.considered) * 100).toFixed(2) : 0;
    }
    finalAgg.passPercent =
      finalAgg.considered > 0
        ? +((finalAgg.pass / finalAgg.considered) * 100).toFixed(2)
        : 0;
    finalAgg.placed = totalPlaced;

    const totalStudents = students.length;
    const totalConsidered = finalAgg.considered;

    res.json({ semAgg, yearAgg, finalAgg, totalStudents, totalConsidered, totalPlaced });
  } catch (err) {
    console.error('Aggregates error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

// -------- Delete student --------
router.delete('/:branch/:batchName/students/:sid', auth, async (req, res) => {
  try {
    const { sid } = req.params;
    await Student.findByIdAndDelete(sid);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete student error:', err && err.stack ? err.stack : err);
    return handleMongoError(err, res);
  }
});

module.exports = router;
