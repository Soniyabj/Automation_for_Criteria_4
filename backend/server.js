// backend/server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const uploadsRouter = require('./routes/uploads');

const authRoutes = require("./routes/auth");
const batchRoutes = require("./routes/batches");
const exportRoutes = require("./routes/export");
const metricsRoutes = require("./routes/metrics"); // new metrics route
const admissionRoutes = require('./routes/admission');


const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files and assets (logos)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/assets", express.static(path.join(__dirname, "assets"))); // <-- serve logos here

// Default route
app.get("/", (req, res) => {
  res.send("✅ Automation for Criteria 4 Backend Running");
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/metrics", metricsRoutes); // mount metrics
app.use('/api/admission', admissionRoutes);
app.use('/api', uploadsRouter);



// ...










// Config
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// MongoDB connect
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });
