// backend/routes/uploads.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const auth = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

router.get('/uploads', auth, async (req, res) => {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const list = await Promise.all(files.map(async name => {
      const stat = await fs.stat(path.join(UPLOAD_DIR, name));
      return {
        name,
        size: stat.size,
        mtime: stat.mtime,
        url: `/uploads/${encodeURIComponent(name)}`
      };
    }));
    list.sort((a,b) => b.mtime - a.mtime);
    res.json({ success: true, files: list });
  } catch (err) {
    console.error('Failed to list uploads:', err);
    res.status(500).json({ success: false, message: 'Unable to list uploads' });
  }
});

router.get('/uploads/:filename', auth, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ message: 'File not found' });
  }
});

module.exports = router;
