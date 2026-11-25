const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(require("./config/uploads")));

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT COUNT(*) AS total FROM destinations");
    res.json({ status: "ok", destinations: rows[0].total });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// shared: auth, profil, notifikasi · wisatawan: home, destinasi, rekomendasi, review hub, foto
app.use("/api/auth", require("./routes/shared/authRoutes"));
app.use("/api", require("./routes/wisatawan/homeRoutes"));
app.use("/api", require("./routes/wisatawan/destinationRoutes"));
app.use("/api", require("./routes/shared/profileRoutes"));
app.use("/api", require("./routes/shared/notificationRoutes"));
app.use("/api", require("./routes/shared/reportRoutes"));

// pengelola: portal pengelola
app.use("/api/manage", require("./routes/pengelola/manageRoutes"));

// admin
app.use("/api/admin", require("./routes/admin/adminRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));

module.exports = app; // dipakai Vercel
