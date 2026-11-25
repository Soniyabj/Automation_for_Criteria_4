const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Student = require('../models/Student');

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only PDF, JPEG, and PNG files are allowed'), allowed.includes(file.mimetype));
  },
});

router.get('/', auth, async (req, res) => {
  const query = {};
  if (req.query.batchName) query.batchName = Number(req.query.batchName);
  if (req.query.placed === 'yes') query.placed = true;
  if (req.query.placed === 'no') query.placed = false;
  if (req.query.usn) query.usn = new RegExp(String(req.query.usn).trim().toUpperCase(), 'i');
  res.json(await Student.find(query).sort({ batchName: -1, sno: 1 }).lean());
});

router.put('/:studentId', auth, async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const nextPlaced = Object.prototype.hasOwnProperty.call(req.body, 'placed')
    ? Boolean(req.body.placed)
    : student.placed;
  if (nextPlaced && !student.offerLetterPath) {
    return res.status(400).json({ message: 'Offer letter is required when placed is Yes' });
  }
  student.placed = nextPlaced;
  await student.save();
  res.json(student);
});

router.post('/:studentId/offer', auth, upload.single('file'), async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student not found' });
  if (!req.file) return res.status(400).json({ message: 'File required' });

  student.offerLetterPath = `/api/uploads/${encodeURIComponent(path.basename(req.file.path))}`;
  student.placed = true;
  await student.save();
  res.json({ message: 'Offer letter uploaded', fileUrl: student.offerLetterPath });
});

router.get('/summary', auth, async (req, res) => {
  const match = {};
  if (req.query.batchName) match.batchName = Number(req.query.batchName);
  const [total, placed] = await Promise.all([
    Student.countDocuments(match),
    Student.countDocuments({ ...match, placed: true }),
  ]);
  res.json({ total, placed, notPlaced: total - placed });
});

router.get('/:studentId/download', auth, async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student || !student.offerLetterPath) return res.status(404).json({ message: 'Offer letter not found' });
  const filename = path.basename(student.offerLetterPath);
  const filePath = path.resolve(uploadDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Offer letter file not found' });
  res.download(filePath);
});

module.exports = router;
