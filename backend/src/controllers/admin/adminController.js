const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const { UPLOAD_ROOT } = require("../../middleware/upload");
const destinations = require("../../services/destinations");
const reports = require("../../services/reports");

const ROLES = ["wisatawan", "pengelola", "admin"];
const SOURCES = ["wikidata", "osm", "manual"];

// ---------- Helper ----------

// ID dari URL/body: bilangan bulat positif, selain itu null
const toId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const paging = (query, def = 20) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || def, 1), 50);
  return { page, limit, offset: (page - 1) * limit };
};

const pageResult = (items, total, page, limit) => ({
  items,
  total: Number(total),
  page,
  totalPages: Math.max(Math.ceil(Number(total) / limit), 1),
});

// Hapus file di dalam folder uploads. Dipanggil hanya SETELAH transaksi berhasil.
const removeFiles = (relPaths) => {
  const root = path.resolve(UPLOAD_ROOT);
  relPaths.filter(Boolean).forEach((rel) => {
    if (/^https?:\/\//i.test(rel)) return; // URL luar, bukan file lokal
    const full = path.resolve(root, rel);
    if (full.startsWith(root + path.sep)) fs.unlink(full, () => {});
  });
};

// Jalankan fn(conn) dalam satu transaksi
async function inTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Error yang pesannya aman dikirim ke klien
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (res, err) =>
  res
    .status(err.status || 500)
    .json({ message: err.message || "Terjadi kesalahan" });

// ================================================================
// RINGKASAN
// ================================================================

// GET /api/admin/summary?days=7|30|90   (SRS 3.5)
// Angka total + perbandingan dengan periode sebelumnya + seri grafik + antrean tindakan.
exports.getSummary = async (req, res) => {
  try {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;

    const [roleRows] = await db.query("SELECT role, COUNT(*) AS total FROM users GROUP BY role");
    const users = { wisatawan: 0, pengelola: 0, admin: 0 };
    roleRows.forEach((r) => {
      users[r.role] = Number(r.total);
    });

    const [[c]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM destinations)                             AS destinations,
        (SELECT COUNT(*) FROM destinations WHERE owner_id IS NOT NULL)  AS owned,
        (SELECT COUNT(*) FROM reviews)                                  AS reviews,
        (SELECT COUNT(*) FROM ratings)                                  AS ratings,
        (SELECT COALESCE(ROUND(AVG(score), 2), 0) FROM ratings)         AS avg_rating,
        (SELECT COUNT(*) FROM photos)                                   AS photos`);

    // Jumlah baru pada periode ini vs periode sebelumnya (untuk tren %)
    const [[p]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM reviews WHERE created_at >= NOW() - INTERVAL ? DAY) AS reviews_now,
         (SELECT COUNT(*) FROM reviews WHERE created_at >= NOW() - INTERVAL ? DAY
                                         AND created_at <  NOW() - INTERVAL ? DAY) AS reviews_prev,
         (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL ? DAY)   AS users_now,
         (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL ? DAY
                                       AND created_at <  NOW() - INTERVAL ? DAY)   AS users_prev,
         (SELECT COUNT(*) FROM destinations WHERE created_at >= NOW() - INTERVAL ? DAY) AS dest_now,
         (SELECT COUNT(*) FROM ratings WHERE score <= 2
                                         AND updated_at >= NOW() - INTERVAL ? DAY) AS low_ratings`,
      [days, days * 2, days, days, days * 2, days, days, days],
    );
    const trend = (now, prev) => {
      now = Number(now);
      prev = Number(prev);
      if (prev === 0) return now > 0 ? null : 0; // null = "baru" (tidak ada pembanding)
      return Math.round(((now - prev) / prev) * 1000) / 10;
    };

    // Seri grafik: harian (7/30 hari) atau mingguan (90 hari); slot kosong tetap 0
    const step = days === 90 ? 7 : 1;
    const slots = Math.ceil(days / step);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (slots * step - 1));
    const labels = [];
    for (let i = 0; i < slots; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * step);
      labels.push(d.toISOString().slice(0, 10));
    }
    const series = async (table) => {
      const [rows] = await db.query(
        `SELECT FLOOR(DATEDIFF(DATE(created_at), ?) / ?) AS slot, COUNT(*) AS total
         FROM ?? WHERE created_at >= ? GROUP BY slot`,
        [labels[0], step, table, labels[0]],
      );
      const out = new Array(slots).fill(0);
      rows.forEach((r) => {
        const i = Number(r.slot);
        if (i >= 0 && i < slots) out[i] = Number(r.total);
      });
      return out;
    };

    // Pengelola yang belum punya destinasi (perlu ditautkan oleh admin)
    const [idlePengelola] = await db.query(
      `SELECT u.id, u.name, u.email, u.created_at FROM users u
       WHERE u.role = 'pengelola'
         AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.owner_id = u.id)
       ORDER BY u.created_at DESC`,
    );

    // Antrean moderasi: ulasan dengan laporan terbuka, bila tidak ada → ulasan rating rendah terbaru
    const openReports = await reports.openCount();
    let queue = [];
    if (openReports > 0) {
      [queue] = await db.query(
        `SELECT rv.id, rv.title, rv.content, rv.created_at, u.name AS user_name,
                d.id AS destination_id, d.name AS destination_name, rt.score,
                MAX(rr.created_at) AS last_report
         FROM review_reports rr
         JOIN reviews rv ON rv.id = rr.review_id
         JOIN users u ON u.id = rv.user_id
         JOIN destinations d ON d.id = rv.destination_id
         LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
         WHERE rr.status = 'open'
         GROUP BY rv.id, u.name, d.id, d.name, rt.score
         ORDER BY COUNT(*) DESC, last_report DESC
         LIMIT 4`,
      );
    }
    const reportInfo = await reports.openByReview(queue.map((q) => q.id));

    const [latestReviews] = await db.query(
      `SELECT rv.id, rv.title, rv.content, rv.created_at,
              u.name AS user_name, d.id AS destination_id, d.name AS destination_name, rt.score
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       JOIN destinations d ON d.id = rv.destination_id
       LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
       ORDER BY rv.created_at DESC, rv.id DESC
       LIMIT 5`,
    );

    const destinations = Number(c.destinations);
    const owned = Number(c.owned);
    res.json({
      days,
      users: { ...users, total: users.wisatawan + users.pengelola + users.admin },
      destinations: { total: destinations, owned, unowned: destinations - owned, newInPeriod: Number(p.dest_now) },
      reviews: Number(c.reviews),
      ratings: Number(c.ratings),
      avgRating: Number(c.avg_rating),
      photos: Number(c.photos),
      period: {
        reviews: Number(p.reviews_now),
        reviewsTrend: trend(p.reviews_now, p.reviews_prev),
        users: Number(p.users_now),
        usersTrend: trend(p.users_now, p.users_prev),
        lowRatings: Number(p.low_ratings),
      },
      growth: { step, labels, reviews: await series("reviews"), users: await series("users") },
      moderation: {
        enabled: await reports.isEnabled(),
        openReports,
        queue: queue.map((q) => ({
          ...q,
          score: q.score ? Number(q.score) : 0,
          report: reportInfo[q.id] || null,
        })),
      },
      idlePengelola: { total: idlePengelola.length, items: idlePengelola.slice(0, 5) },
      latestReviews: latestReviews.map((r) => ({ ...r, score: r.score ? Number(r.score) : 0 })),
    });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// USER
// ================================================================

// Kolom yang boleh dikirim ke frontend (tanpa password)
const USER_COLUMNS = `u.id, u.name, u.email, u.username, u.role, u.avatar, u.created_at`;

// GET /api/admin/users?q=&role=&page=&limit=
exports.listUsers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const role = String(req.query.role || "");
    const { page, limit, offset } = paging(req.query);

    const where = [];
    const params = [];
    if (q) {
      where.push("(u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (role) {
      if (!ROLES.includes(role))
        return res.status(400).json({ message: "Role tidak dikenal" });
      where.push("u.role = ?");
      params.push(role);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      params,
    );
    const [rows] = await db.query(
      `SELECT ${USER_COLUMNS},
              (SELECT COUNT(*) FROM reviews rv WHERE rv.user_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM photos ph WHERE ph.user_id = u.id) AS photo_count,
              (SELECT COUNT(*) FROM destinations d WHERE d.owner_id = u.id) AS owned_count
       FROM users u ${whereSql}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json(
      pageResult(
        rows.map((r) => ({
          ...r,
          review_count: Number(r.review_count),
          photo_count: Number(r.photo_count),
          owned_count: Number(r.owned_count),
        })),
        total,
        page,
        limit,
      ),
    );
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/admin/users/stats   (kartu statistik Kelola Pengguna)
exports.userStats = async (req, res) => {
  try {
    const [roleRows] = await db.query("SELECT role, COUNT(*) AS total FROM users GROUP BY role");
    const roles = { wisatawan: 0, pengelola: 0, admin: 0 };
    roleRows.forEach((r) => {
      roles[r.role] = Number(r.total);
    });
    const [[s]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY) AS new30,
        (SELECT COUNT(DISTINCT user_id) FROM reviews) AS contributors,
        (SELECT COUNT(*) FROM reviews) AS reviews,
        (SELECT COUNT(*) FROM users u WHERE u.role = 'pengelola'
           AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.owner_id = u.id)) AS idle_pengelola`);
    res.json({
      roles,
      total: roles.wisatawan + roles.pengelola + roles.admin,
      new30: Number(s.new30),
      contributors: Number(s.contributors),
      reviews: Number(s.reviews),
      idlePengelola: Number(s.idle_pengelola),
    });
  } catch (err) {
    fail(res, err);
  }
};

// PATCH /api/admin/users/:id/role   body: { role }
exports.updateUserRole = async (req, res) => {
  try {
    const id = toId(req.params.id);
    const role = String(req.body?.role || "");
    if (!id) return res.status(400).json({ message: "ID user tidak valid" });
    if (!ROLES.includes(role))
      return res.status(400).json({ message: "Role harus wisatawan, pengelola, atau admin" });
    if (id === req.user.id)
      return res.status(400).json({ message: "Kamu tidak bisa mengubah role akunmu sendiri" });

    const user = await inTransaction(async (conn) => {
      // Kunci baris admin supaya dua request bersamaan tidak menghabiskan semua admin
      const [admins] = await conn.query(
        "SELECT id FROM users WHERE role = 'admin' FOR UPDATE",
      );
      const [rows] = await conn.query("SELECT id, role FROM users WHERE id = ?", [id]);
      if (rows.length === 0) throw new HttpError(404, "User tidak ditemukan");

      const target = rows[0];
      if (target.role === "admin" && role !== "admin" && admins.length <= 1)
        throw new HttpError(400, "Tidak bisa menurunkan admin terakhir");

      await conn.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
      const [[u]] = await conn.query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
      return u;
    });

    res.json({ message: "Role diperbarui", user });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID user tidak valid" });
    if (id === req.user.id)
      return res.status(400).json({ message: "Kamu tidak bisa menghapus akunmu sendiri" });

    const files = await inTransaction(async (conn) => {
      const [admins] = await conn.query(
        "SELECT id FROM users WHERE role = 'admin' FOR UPDATE",
      );
      const [rows] = await conn.query(
        "SELECT id, role, avatar, cover FROM users WHERE id = ?",
        [id],
      );
      if (rows.length === 0) throw new HttpError(404, "User tidak ditemukan");
      const target = rows[0];
      if (target.role === "admin" && admins.length <= 1)
        throw new HttpError(400, "Tidak bisa menghapus admin terakhir");

      const [photos] = await conn.query(
        "SELECT file_path FROM photos WHERE user_id = ?",
        [id],
      );
      // Ulasan, rating, foto, favorit, notifikasi ikut terhapus (ON DELETE CASCADE);
      // destinasi miliknya menjadi tanpa pemilik (ON DELETE SET NULL).
      await conn.query("DELETE FROM users WHERE id = ?", [id]);

      return [...photos.map((p) => p.file_path), target.avatar, target.cover];
    });

    removeFiles(files);
    res.json({ message: "User dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validasi body form akun (tambah & edit). current = data user lama saat edit.
async function readAccountBody(b = {}, current = null) {
  const name = String(b.name ?? "").trim();
  if (name.length < 2 || name.length > 100)
    throw new HttpError(400, "Nama 2 sampai 100 karakter");

  const email = String(b.email ?? "").trim();
  if (!EMAIL_RE.test(email) || email.length > 100)
    throw new HttpError(400, "Format email tidak valid");
  const [dupEmail] = await db.query(
    "SELECT id FROM users WHERE email = ? AND id <> ?",
    [email, current?.id || 0],
  );
  if (dupEmail.length > 0) throw new HttpError(409, "Email sudah dipakai akun lain");

  const username =
    String(b.username ?? "").trim().toLowerCase().replace(/^@/, "") || null;
  if (username) {
    if (!/^[a-z0-9_]{3,30}$/.test(username))
      throw new HttpError(400, "Username 3 sampai 30 karakter: huruf kecil, angka, dan garis bawah");
    const [dupUser] = await db.query(
      "SELECT id FROM users WHERE username = ? AND id <> ?",
      [username, current?.id || 0],
    );
    if (dupUser.length > 0) throw new HttpError(409, "Username sudah dipakai");
  }

  const role = String(b.role ?? current?.role ?? "");
  if (!ROLES.includes(role))
    throw new HttpError(400, "Role harus wisatawan, pengelola, atau admin");

  // Kata sandi: wajib saat tambah; saat edit kosong = tidak diubah
  const password = String(b.password ?? "");
  if (!current && password.length < 8)
    throw new HttpError(400, "Kata sandi minimal 8 karakter");
  if (current && password && password.length < 8)
    throw new HttpError(400, "Kata sandi baru minimal 8 karakter");

  return { name, email, username, role, password };
}

// POST /api/admin/users   body: { name, email, username?, role, password }
exports.createUser = async (req, res) => {
  try {
    const data = await readAccountBody(req.body);
    const hashed = await bcrypt.hash(data.password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, username, role, password) VALUES (?, ?, ?, ?, ?)",
      [data.name, data.email, data.username, data.role, hashed],
    );
    const [[user]] = await db.query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [result.insertId]);
    res.status(201).json({ message: "Akun ditambahkan", user });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Email atau username sudah dipakai" });
    fail(res, err);
  }
};

// PUT /api/admin/users/:id   body: { name, email, username?, role, password? }
exports.updateUser = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID user tidak valid" });

    const [rows] = await db.query("SELECT id, role FROM users WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "User tidak ditemukan" });
    const current = rows[0];
    const data = await readAccountBody(req.body, current);

    const roleChanged = data.role !== current.role;
    if (roleChanged && id === req.user.id)
      return res.status(400).json({ message: "Kamu tidak bisa mengubah role akunmu sendiri" });

    const user = await inTransaction(async (conn) => {
      if (roleChanged && current.role === "admin") {
        const [admins] = await conn.query("SELECT id FROM users WHERE role = 'admin' FOR UPDATE");
        if (admins.length <= 1) throw new HttpError(400, "Tidak bisa menurunkan admin terakhir");
      }
      await conn.query(
        "UPDATE users SET name = ?, email = ?, username = ?, role = ? WHERE id = ?",
        [data.name, data.email, data.username, data.role, id],
      );
      if (data.password) {
        const hashed = await bcrypt.hash(data.password, 10);
        await conn.query("UPDATE users SET password = ? WHERE id = ?", [hashed, id]);
      }
      const [[u]] = await conn.query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
      return u;
    });

    res.json({
      message: data.password ? "Akun diperbarui dan kata sandi diatur ulang" : "Akun diperbarui",
      user,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Email atau username sudah dipakai" });
    fail(res, err);
  }
};

// GET /api/admin/destinations/stats   (kartu statistik Kelola Destinasi & Mitra)
exports.destinationStats = async (req, res) => {
  try {
    const [[s]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM destinations) AS total,
        (SELECT COUNT(*) FROM destinations WHERE owner_id IS NOT NULL) AS owned,
        (SELECT COUNT(*) FROM destinations WHERE source = 'manual') AS manual_count,
        (SELECT COUNT(*) FROM destinations WHERE created_at >= NOW() - INTERVAL 30 DAY) AS new30,
        (SELECT COUNT(DISTINCT owner_id) FROM destinations WHERE owner_id IS NOT NULL) AS mitra,
        (SELECT COUNT(*) FROM users u WHERE u.role = 'pengelola'
           AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.owner_id = u.id)) AS idle_pengelola,
        (SELECT COALESCE(ROUND(AVG(score), 2), 0) FROM ratings) AS avg_rating`);
    const [cats] = await db.query(`
      SELECT c.name, COUNT(d.id) AS total FROM categories c
      LEFT JOIN destinations d ON d.category_id = c.id
      GROUP BY c.id, c.name HAVING total > 0 ORDER BY total DESC LIMIT 3`);
    const total = Number(s.total);
    const owned = Number(s.owned);
    res.json({
      total,
      owned,
      unowned: total - owned,
      manual: Number(s.manual_count),
      new30: Number(s.new30),
      mitra: Number(s.mitra),
      idlePengelola: Number(s.idle_pengelola),
      avgRating: Number(s.avg_rating),
      topCategories: cats.map((c) => ({ name: c.name, total: Number(c.total) })),
    });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/admin/pengelola  (pilihan pemilik destinasi)
exports.listPengelola = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email,
              (SELECT COUNT(*) FROM destinations d WHERE d.owner_id = u.id) AS owned_count
       FROM users u WHERE u.role = 'pengelola' ORDER BY u.name`,
    );
    res.json({
      items: rows.map((r) => ({ ...r, owned_count: Number(r.owned_count) })),
    });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// DESTINASI
// ================================================================

// GET /api/admin/destinations?q=&category=&source=&owner=yes|no&page=&limit=
exports.listDestinations = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 150);
    const category = req.query.category ? toId(req.query.category) : 0;
    const source = String(req.query.source || "");
    const owner = String(req.query.owner || "");
    const { page, limit, offset } = paging(req.query);

    if (category === null)
      return res.status(400).json({ message: "Kategori tidak valid" });
    if (source && !SOURCES.includes(source))
      return res.status(400).json({ message: "Sumber tidak dikenal" });
    if (owner && !["yes", "no"].includes(owner))
      return res.status(400).json({ message: "Filter pemilik tidak valid" });

    const where = [];
    const params = [];
    if (q) {
      where.push("(d.name LIKE ? OR d.location LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push("d.category_id = ?");
      params.push(category);
    }
    if (source) {
      where.push("d.source = ?");
      params.push(source);
    }
    if (owner === "yes") where.push("d.owner_id IS NOT NULL");
    if (owner === "no") where.push("d.owner_id IS NULL");
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM destinations d ${whereSql}`,
      params,
    );
    const [rows] = await db.query(
      `SELECT d.id, d.name, d.location, ${(await destinations.hasAddress()) ? "d.address" : "NULL AS address"},
              d.category_id, c.name AS category,
              d.description, d.latitude, d.longitude, d.price, d.open_hours,
              d.best_time, d.highlights, d.cover_image, d.source, d.created_at,
              d.owner_id, o.name AS owner_name, o.email AS owner_email,
              (SELECT COALESCE(ROUND(AVG(r.score), 1), 0) FROM ratings r WHERE r.destination_id = d.id) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r WHERE r.destination_id = d.id) AS rating_count,
              (SELECT COUNT(*) FROM reviews rv WHERE rv.destination_id = d.id) AS review_count,
              (SELECT COUNT(*) FROM photos ph WHERE ph.destination_id = d.id) AS photo_count
       FROM destinations d
       JOIN categories c ON c.id = d.category_id
       LEFT JOIN users o ON o.id = d.owner_id
       ${whereSql}
       ORDER BY d.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      ...pageResult(
        rows.map((r) => ({
          ...r,
          latitude: r.latitude === null ? null : Number(r.latitude),
          longitude: r.longitude === null ? null : Number(r.longitude),
          avg_rating: Number(r.avg_rating),
          rating_count: Number(r.rating_count),
          review_count: Number(r.review_count),
          photo_count: Number(r.photo_count),
        })),
        total,
        page,
        limit,
      ),
      addressEnabled: await destinations.hasAddress(),
    });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/admin/destinations   (validasi & simpan di services/destinations.js)
exports.createDestination = async (req, res) => {
  try {
    const id = await destinations.createDestination(req.body);
    res.status(201).json({ message: "Destinasi ditambahkan", id });
  } catch (err) {
    fail(res, err);
  }
};

// PUT /api/admin/destinations/:id
exports.updateDestination = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    await destinations.updateDestination(id, req.body);
    res.json({ message: "Destinasi diperbarui" });
  } catch (err) {
    fail(res, err);
  }
};

// PATCH /api/admin/destinations/:id/owner   body: { owner_id }  (null = lepas pemilik)
exports.setDestinationOwner = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });

    const raw = req.body?.owner_id;
    const ownerId = raw === null || raw === "" || raw === undefined ? null : toId(raw);
    if (raw !== null && raw !== "" && raw !== undefined && !ownerId)
      return res.status(400).json({ message: "Pemilik tidak valid" });

    const [d] = await db.query("SELECT id FROM destinations WHERE id = ?", [id]);
    if (d.length === 0)
      return res.status(404).json({ message: "Destinasi tidak ditemukan" });

    if (ownerId) {
      const [u] = await db.query("SELECT role FROM users WHERE id = ?", [ownerId]);
      if (u.length === 0) return res.status(404).json({ message: "User tidak ditemukan" });
      if (u[0].role !== "pengelola")
        return res.status(400).json({ message: "Pemilik harus user ber-role pengelola" });
    }

    await db.query("UPDATE destinations SET owner_id = ? WHERE id = ?", [ownerId, id]);
    res.json({ message: ownerId ? "Pemilik ditetapkan" : "Pemilik dilepas" });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/admin/destinations/:id
exports.deleteDestination = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    await destinations.deleteDestination(id);
    res.json({ message: "Destinasi dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// FOTO DESTINASI (galeri resmi + foto ulasan) — SRS 3.15, 3.16
// ================================================================
const gallery = require("../../services/gallery");

// GET /api/admin/destinations/:id/photos
exports.listDestinationPhotos = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    res.json(await gallery.listPhotos(id));
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/admin/destinations/:id/photos   (multipart, field: photos)
exports.uploadDestinationPhotos = async (req, res) => {
  const files = req.files || [];
  try {
    const id = toId(req.params.id);
    if (!id) {
      gallery.unlinkFiles(files.map((f) => `gallery/${f.filename}`));
      return res.status(400).json({ message: "ID destinasi tidak valid" });
    }
    const { added, firstId } = await gallery.addGalleryPhotos(id, req.user.id, files);
    // ?cover=1: foto pertama langsung dijadikan cover (dari form destinasi)
    const cover = req.query.cover === "1" ? await gallery.setCover(id, firstId) : undefined;
    res.status(201).json({ message: `${added} foto ditambahkan ke galeri`, added, cover_image: cover });
  } catch (err) {
    fail(res, err);
  }
};

// PATCH /api/admin/destinations/:id/cover   body: { photo_id }
exports.setDestinationCover = async (req, res) => {
  try {
    const id = toId(req.params.id);
    const photoId = toId(req.body?.photo_id);
    if (!id || !photoId) return res.status(400).json({ message: "Data tidak valid" });
    const cover = await gallery.setCover(id, photoId);
    res.json({ message: "Cover destinasi diperbarui", cover_image: cover });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/admin/photos/:id   (foto galeri maupun foto ulasan)
exports.deletePhoto = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID foto tidak valid" });
    await gallery.deletePhoto(id);
    res.json({ message: "Foto dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// ULASAN
// ================================================================

// GET /api/admin/reviews/stats   (kartu statistik halaman Moderasi)
exports.reviewStats = async (req, res) => {
  try {
    const enabled = await reports.isEnabled();
    const [[s]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM reviews) AS total,
        (SELECT COUNT(*) FROM reviews WHERE created_at >= NOW() - INTERVAL 1 DAY) AS today,
        (SELECT COUNT(*) FROM ratings WHERE score <= 2) AS low,
        (SELECT COUNT(DISTINCT review_id) FROM photos WHERE review_id IS NOT NULL) AS with_photos`);
    let handled = 0;
    if (enabled) {
      const [[h]] = await db.query(
        "SELECT COUNT(*) AS n FROM review_reports WHERE status = 'dismissed' AND handled_at >= NOW() - INTERVAL 30 DAY",
      );
      handled = Number(h.n);
    }
    res.json({
      reportsEnabled: enabled,
      openReports: await reports.openCount(),
      handled30d: handled,
      total: Number(s.total),
      today: Number(s.today),
      lowRatings: Number(s.low),
      withPhotos: Number(s.with_photos),
    });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/admin/reports/count   (badge menu Moderasi)
exports.reportsCount = async (req, res) => {
  try {
    res.json({ open: await reports.openCount(), enabled: await reports.isEnabled() });
  } catch (err) {
    fail(res, err);
  }
};

// PATCH /api/admin/reviews/:id/dismiss   (laporan dinilai tidak melanggar → ulasan tetap tampil)
exports.dismissReports = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID ulasan tidak valid" });
    if (!(await reports.isEnabled()))
      return res.status(503).json({ message: "Fitur laporan belum diaktifkan" });
    const [r] = await db.query(
      `UPDATE review_reports SET status = 'dismissed', handled_by = ?, handled_at = NOW()
       WHERE review_id = ? AND status = 'open'`,
      [req.user.id, id],
    );
    if (r.affectedRows === 0)
      return res.status(404).json({ message: "Tidak ada laporan terbuka untuk ulasan ini" });
    res.json({ message: `${r.affectedRows} laporan diabaikan, ulasan tetap tampil` });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/admin/reviews?tab=all|reported|low|photos&destination=&rating=&q=&page=&limit=
exports.listReviews = async (req, res) => {
  try {
    const destination = req.query.destination ? toId(req.query.destination) : 0;
    const rating = req.query.rating ? Number(req.query.rating) : 0;
    const q = String(req.query.q || "").trim().slice(0, 100);
    const tab = String(req.query.tab || "all");
    const { page, limit, offset } = paging(req.query);

    if (destination === null)
      return res.status(400).json({ message: "Destinasi tidak valid" });
    if (rating && (!Number.isInteger(rating) || rating < 1 || rating > 5))
      return res.status(400).json({ message: "Rating harus 1 sampai 5" });
    if (!["all", "reported", "low", "photos"].includes(tab))
      return res.status(400).json({ message: "Tab tidak dikenal" });

    const reportsOn = await reports.isEnabled();
    if (tab === "reported" && !reportsOn) {
      return res.json(pageResult([], 0, page, limit));
    }

    const where = [];
    const params = [];
    if (tab === "reported")
      where.push("EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = rv.id AND rr.status = 'open')");
    if (tab === "low") where.push("rt.score <= 2");
    if (tab === "photos") where.push("EXISTS (SELECT 1 FROM photos ph WHERE ph.review_id = rv.id)");
    if (destination) {
      where.push("rv.destination_id = ?");
      params.push(destination);
    }
    if (rating) {
      where.push("rt.score = ?");
      params.push(rating);
    }
    if (q) {
      where.push("(rv.title LIKE ? OR rv.content LIKE ? OR u.name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const from = `
      FROM reviews rv
      JOIN users u ON u.id = rv.user_id
      JOIN destinations d ON d.id = rv.destination_id
      LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total ${from} ${whereSql}`,
      params,
    );
    const [rows] = await db.query(
      `SELECT rv.id, rv.title, rv.content, rv.created_at,
              DATE_FORMAT(rv.visit_date, '%Y-%m-%d') AS visit_date,
              u.id AS user_id, u.name AS user_name, u.username,
              d.id AS destination_id, d.name AS destination_name,
              rt.score,
              (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = rv.id) AS helpful_count
              ${reportsOn ? ", (SELECT COUNT(*) FROM review_reports rr WHERE rr.review_id = rv.id AND rr.status = 'open') AS open_reports" : ", 0 AS open_reports"}
       ${from} ${whereSql}
       ORDER BY ${tab === "reported" ? "open_reports DESC, " : ""}rv.created_at DESC, rv.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    let photos = [];
    if (rows.length > 0) {
      [photos] = await db.query(
        "SELECT id, review_id, file_path FROM photos WHERE review_id IN (?)",
        [rows.map((r) => r.id)],
      );
    }
    const reportInfo = await reports.openByReview(
      rows.filter((r) => Number(r.open_reports) > 0).map((r) => r.id),
    );

    res.json(
      pageResult(
        rows.map(({ open_reports: _open, ...r }) => ({
          ...r,
          score: r.score ? Number(r.score) : 0,
          helpful_count: Number(r.helpful_count),
          report: reportInfo[r.id] || null,
          photos: photos
            .filter((p) => p.review_id === r.id)
            .map((p) => ({ id: p.id, file_path: p.file_path })),
        })),
        total,
        page,
        limit,
      ),
    );
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/admin/reviews/:id?with_rating=1
exports.deleteReview = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID ulasan tidak valid" });
    const withRating = req.query.with_rating === "1" || req.query.with_rating === "true";

    const result = await inTransaction(async (conn) => {
      const [rows] = await conn.query(
        "SELECT id, user_id, destination_id FROM reviews WHERE id = ? FOR UPDATE",
        [id],
      );
      if (rows.length === 0) throw new HttpError(404, "Ulasan tidak ditemukan");
      const rv = rows[0];

      const [photos] = await conn.query(
        "SELECT file_path FROM photos WHERE review_id = ?",
        [id],
      );
      // FK photos.review_id = SET NULL, jadi baris foto dihapus eksplisit
      await conn.query("DELETE FROM photos WHERE review_id = ?", [id]);
      await conn.query("DELETE FROM reviews WHERE id = ?", [id]);

      let ratingDeleted = false;
      if (withRating) {
        const [r] = await conn.query(
          "DELETE FROM ratings WHERE user_id = ? AND destination_id = ?",
          [rv.user_id, rv.destination_id],
        );
        ratingDeleted = r.affectedRows > 0;
      }
      return { files: photos.map((p) => p.file_path), ratingDeleted };
    });

    removeFiles(result.files);
    res.json({
      message: result.ratingDeleted ? "Ulasan dan rating dihapus" : "Ulasan dihapus",
      photosDeleted: result.files.length,
      ratingDeleted: result.ratingDeleted,
    });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// KATEGORI
// ================================================================

const readCategoryName = (b) => {
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 50)
    throw new HttpError(400, "Nama kategori 2 sampai 50 karakter");
  return name;
};

// GET /api/admin/categories
exports.listCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.id, c.name, COUNT(d.id) AS total
      FROM categories c LEFT JOIN destinations d ON d.category_id = c.id
      GROUP BY c.id, c.name ORDER BY c.name`);
    res.json({ items: rows.map((r) => ({ ...r, total: Number(r.total) })) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/admin/categories   body: { name }
exports.createCategory = async (req, res) => {
  try {
    const name = readCategoryName(req.body);
    const [dup] = await db.query("SELECT id FROM categories WHERE name = ?", [name]);
    if (dup.length > 0)
      return res.status(409).json({ message: "Nama kategori sudah dipakai" });
    const [result] = await db.query("INSERT INTO categories (name) VALUES (?)", [name]);
    res.status(201).json({ message: "Kategori ditambahkan", id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Nama kategori sudah dipakai" });
    fail(res, err);
  }
};

// PUT /api/admin/categories/:id   body: { name }
exports.updateCategory = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID kategori tidak valid" });
    const name = readCategoryName(req.body);

    const [c] = await db.query("SELECT id FROM categories WHERE id = ?", [id]);
    if (c.length === 0)
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    const [dup] = await db.query(
      "SELECT id FROM categories WHERE name = ? AND id <> ?",
      [name, id],
    );
    if (dup.length > 0)
      return res.status(409).json({ message: "Nama kategori sudah dipakai" });

    await db.query("UPDATE categories SET name = ? WHERE id = ?", [name, id]);
    res.json({ message: "Kategori diperbarui" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Nama kategori sudah dipakai" });
    fail(res, err);
  }
};

// DELETE /api/admin/categories/:id   (ditolak jika masih dipakai)
exports.deleteCategory = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID kategori tidak valid" });

    const [c] = await db.query("SELECT id FROM categories WHERE id = ?", [id]);
    if (c.length === 0)
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) AS total FROM destinations WHERE category_id = ?",
      [id],
    );
    if (Number(total) > 0)
      return res.status(409).json({
        message: `Kategori masih dipakai ${total} destinasi, pindahkan dulu destinasinya`,
      });

    await db.query("DELETE FROM categories WHERE id = ?", [id]);
    res.json({ message: "Kategori dihapus" });
  } catch (err) {
    // Cadangan bila ada destinasi baru di antara cek dan hapus (FK menolak)
    if (err.code === "ER_ROW_IS_REFERENCED_2")
      return res.status(409).json({ message: "Kategori masih dipakai destinasi" });
    fail(res, err);
  }
};
