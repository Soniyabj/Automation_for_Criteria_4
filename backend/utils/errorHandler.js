// utils/errorHandler.js
function handleMongoError(err, res) {
  if (err && err.code === 11000) {
    const dupField = Object.keys(err.keyPattern || {})[0];
    return res.status(400).json({
      message: `Duplicate entry: ${dupField} must be unique`,
      field: dupField,
    });
  }

  return res.status(500).json({ message: "Server error", error: String(err) });
}

module.exports = { handleMongoError };
