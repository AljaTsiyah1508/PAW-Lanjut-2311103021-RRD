const db = require("../config/db");

// Dipasang setelah verifyToken untuk /api/manage. Role dibaca ulang dari database
// (jangan percaya role di JWT): tolak bila akun sudah dihapus atau bukan pengelola lagi.
exports.requirePengelola = async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT id, role FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Akun tidak ditemukan" });
    }
    if (rows[0].role !== "pengelola") {
      return res.status(403).json({ message: "Akses ditolak" });
    }
    req.user.role = rows[0].role;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
