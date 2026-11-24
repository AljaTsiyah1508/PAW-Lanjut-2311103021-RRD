const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const { UPLOAD_ROOT } = require("../../middleware/uploadProfile");

const INTERESTS = [
  "Wisata Bahari & Snorkeling",
  "Gunung & Kawah Api",
  "Fotografi Lanskap",
  "Ekowisata Konservasi",
  "Kuliner Otentik Nusantara",
  "Desa Wisata & Budaya",
];

const parseInterests = (raw) => {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((i) => INTERESTS.includes(i)) : [];
  } catch {
    return [];
  }
};

// Hapus file lama hanya kalau berada di uploads/profiles
const removeFile = (rel) => {
  if (!rel || !rel.startsWith("profiles/")) return;
  const full = path.resolve(UPLOAD_ROOT, rel);
  if (full.startsWith(path.resolve(UPLOAD_ROOT))) fs.unlink(full, () => {});
};

async function loadProfile(id) {
  const [rows] = await db.query(
    `SELECT id, name, email, phone, role, username, bio, city, avatar, cover, interests, created_at
     FROM users WHERE id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  return { ...rows[0], interests: parseInterests(rows[0].interests) };
}

async function statsOf(id) {
  const [[s]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM reviews WHERE user_id = ?) AS reviews,
       (SELECT COUNT(*) FROM photos WHERE user_id = ?) AS photos,
       (SELECT COUNT(*) FROM review_helpful h JOIN reviews r ON r.id = h.review_id WHERE r.user_id = ?) AS helped,
       (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS wishlist`,
    [id, id, id, id],
  );
  return {
    reviews: Number(s.reviews),
    photos: Number(s.photos),
    helped: Number(s.helped),
    wishlist: Number(s.wishlist),
  };
}

async function reviewsOf(userId) {
  const [rows] = await db.query(
    `SELECT rv.id, rv.title, rv.content,
            DATE_FORMAT(rv.visit_date, '%Y-%m-%d') AS visit_date, rv.created_at,
            d.id AS destination_id, d.name AS destination_name, d.location, d.cover_image,
            rt.score,
            (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = rv.id) AS helpful_count
     FROM reviews rv
     JOIN destinations d ON d.id = rv.destination_id
     LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
     WHERE rv.user_id = ?
     ORDER BY rv.created_at DESC, rv.id DESC`,
    [userId],
  );

  let photos = [];
  if (rows.length > 0) {
    [photos] = await db.query(
      "SELECT review_id, file_path FROM photos WHERE review_id IN (?)",
      [rows.map((r) => r.id)],
    );
  }

  return rows.map((r) => ({
    ...r,
    score: r.score ? Number(r.score) : 0,
    helpful_count: Number(r.helpful_count),
    photos: photos.filter((p) => p.review_id === r.id).map((p) => p.file_path),
  }));
}

// GET /api/profile
exports.getProfile = async (req, res) => {
  try {
    const profile = await loadProfile(req.user.id);
    if (!profile)
      return res.status(404).json({ message: "User tidak ditemukan" });
    const stats = await statsOf(req.user.id);
    res.json({ profile, stats, interestOptions: INTERESTS });
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/profile
exports.updateProfile = async (req, res) => {
  try {
    const b = req.body;
    const id = req.user.id;

    const name = String(b.name || "").trim();
    if (name.length < 2 || name.length > 100) {
      return res
        .status(400)
        .json({ message: "Nama lengkap 2 sampai 100 karakter" });
    }

    const username =
      String(b.username || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "") || null;
    if (username) {
      if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return res
          .status(400)
          .json({
            message:
              "Username 3 sampai 30 karakter: huruf kecil, angka, dan garis bawah",
          });
      }
      const [dup] = await db.query(
        "SELECT id FROM users WHERE username = ? AND id <> ?",
        [username, id],
      );
      if (dup.length > 0)
        return res.status(409).json({ message: "Username sudah dipakai" });
    }

    const bio =
      String(b.bio || "")
        .trim()
        .slice(0, 300) || null;
    const city =
      String(b.city || "")
        .trim()
        .slice(0, 100) || null;

    const phone = String(b.phone || "").trim() || null;
    if (phone && !/^\+?[0-9\s-]{8,20}$/.test(phone)) {
      return res.status(400).json({ message: "Nomor telepon tidak valid" });
    }

    const interests = Array.isArray(b.interests)
      ? b.interests.filter((i) => INTERESTS.includes(i))
      : [];

    await db.query(
      `UPDATE users SET name = ?, username = ?, bio = ?, city = ?, phone = ?, interests = ? WHERE id = ?`,
      [name, username, bio, city, phone, JSON.stringify(interests), id],
    );

    res.json({ message: "Profil diperbarui", profile: await loadProfile(id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/profile/avatar  dan  /api/profile/cover   (kind = 'avatar' | 'cover')
exports.uploadImage = (kind) => async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "Tidak ada gambar yang dikirim" });

    const [[old]] = await db.query(
      `SELECT ${kind} AS file FROM users WHERE id = ?`,
      [req.user.id],
    );
    const rel = `profiles/${req.file.filename}`;
    await db.query(`UPDATE users SET ${kind} = ? WHERE id = ?`, [
      rel,
      req.user.id,
    ]);
    removeFile(old?.file);

    res.json({ [kind]: rel });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/profile/avatar
exports.deleteAvatar = async (req, res) => {
  try {
    const [[old]] = await db.query("SELECT avatar FROM users WHERE id = ?", [
      req.user.id,
    ]);
    await db.query("UPDATE users SET avatar = NULL WHERE id = ?", [
      req.user.id,
    ]);
    removeFile(old?.avatar);
    res.json({ message: "Foto profil dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/profile/password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ message: "Kata sandi lama dan baru wajib diisi" });
    }
    if (String(new_password).length < 8) {
      return res
        .status(400)
        .json({ message: "Kata sandi baru minimal 8 karakter" });
    }

    const [[u]] = await db.query("SELECT password FROM users WHERE id = ?", [
      req.user.id,
    ]);
    const ok = await bcrypt.compare(current_password, u.password);
    if (!ok) return res.status(400).json({ message: "Kata sandi lama salah" });

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashed,
      req.user.id,
    ]);
    res.json({ message: "Kata sandi diperbarui" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/profile/email   body: { email, current_password }
// Email dipakai untuk login, jadi wajib konfirmasi kata sandi saat ini (SRS 3.22)
exports.changeEmail = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    const current = String(req.body.current_password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ message: "Format email tidak valid" });
    }
    if (!current) {
      return res.status(400).json({ message: "Masukkan kata sandi saat ini" });
    }

    const [[u]] = await db.query("SELECT email, password FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (!u) return res.status(404).json({ message: "User tidak ditemukan" });
    if (!(await bcrypt.compare(current, u.password))) {
      return res.status(400).json({ message: "Kata sandi saat ini salah" });
    }
    if (u.email.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ message: "Email baru sama dengan email sekarang" });
    }
    const [dup] = await db.query(
      "SELECT id FROM users WHERE email = ? AND id <> ?",
      [email, req.user.id],
    );
    if (dup.length > 0) {
      return res.status(409).json({ message: "Email sudah dipakai akun lain" });
    }

    await db.query("UPDATE users SET email = ? WHERE id = ?", [email, req.user.id]);
    res.json({ message: "Email diperbarui", email });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Email sudah dipakai akun lain" });
    res.status(500).json({ message: err.message });
  }
};

// GET /api/profile/reviews
exports.myReviews = async (req, res) => {
  try {
    res.json({ items: await reviewsOf(req.user.id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/profile/wishlist
exports.myWishlist = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.name, d.location, d.cover_image, c.name AS category
       FROM favorites f
       JOIN destinations d ON d.id = f.destination_id
       JOIN categories c ON c.id = d.category_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id],
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/users/:username   (publik, tanpa email dan telepon)
exports.publicProfile = async (req, res) => {
  try {
    const username = String(req.params.username || "").toLowerCase();
    const [rows] = await db.query(
      `SELECT id, name, username, bio, city, avatar, cover, interests, created_at
       FROM users WHERE username = ?`,
      [username],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Profil tidak ditemukan" });

    const u = rows[0];
    const { id, ...profile } = u;
    res.json({
      profile: { ...profile, interests: parseInterests(u.interests) },
      stats: await statsOf(id),
      reviews: await reviewsOf(id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
