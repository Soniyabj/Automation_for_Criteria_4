// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

module.exports = function (req, res, next) {
  try {
    const h = req.headers.authorization || req.headers.Authorization;
    if (!h) return res.status(401).json({ message: 'No token' });

    const token = (h.startsWith('Bearer ') ? h.slice(7) : h).trim();
    if (!token) return res.status(401).json({ message: 'No token' });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      next();
    } catch (err) {
      // jwt verify failed (expired, invalid signature, etc.)
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
