const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const { notify } = require("../../services/notify");

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Nama, email, dan password wajib diisi" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password minimal 8 karakter" });
    }

    // Admin tidak boleh daftar lewat register publik
    const allowedRoles = ["wisatawan", "pengelola"];
    const userRole = allowedRoles.includes(role) ? role : "wisatawan";

    const [exist] = await db.query("SELECT id FROM users WHERE email = ?", [
      email,
    ]);
    if (exist.length > 0) {
      return res.status(409).json({ message: "Email sudah terdaftar" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
      [name, email, phone || null, hashed, userRole],
    );

    await notify(
      result.insertId,
      "welcome",
      "Selamat datang di NusantaraReview! Lengkapi profilmu supaya sesama penjelajah mengenalmu.",
      "/profil",
      "welcome",
    );

    const user = { id: result.insertId, name, email, role: userRole };
    res
      .status(201)
      .json({ message: "Registrasi berhasil", token: signToken(user), user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    // Field "email" menerima email ATAU username (SRS 3.2)
    const identifier = String(req.body.email || "").trim();
    const { password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Email/username dan password wajib diisi" });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1",
      [identifier, identifier.toLowerCase().replace(/^@/, "")],
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: "Email/username atau password salah" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Email/username atau password salah" });
    }

    res.json({
      message: "Login berhasil",
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me (butuh token)
exports.me = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, phone, role, username, avatar, created_at FROM users WHERE id = ?",
      [req.user.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
