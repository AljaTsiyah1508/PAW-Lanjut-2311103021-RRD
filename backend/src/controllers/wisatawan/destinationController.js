const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const { notifyWishlist } = require("../../services/notify");
const { UPLOAD_ROOT } = require("../../middleware/upload");
const reports = require("../../services/reports");
const replies = require("../../services/replies");

const SORTS = {
  popular:
    "rating_count DESC, avg_rating DESC, (d.cover_image IS NOT NULL) DESC, d.popularity DESC, d.id ASC",
  rating: "avg_rating DESC, rating_count DESC, d.popularity DESC",
  newest: "d.id DESC",
  name: "d.name ASC",
};

// GET /api/categories
exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.id, c.name, COUNT(d.id) AS total
      FROM categories c LEFT JOIN destinations d ON d.category_id = c.id
      GROUP BY c.id, c.name ORDER BY c.name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/destinations?q=&category=&min_rating=&sort=&page=&limit=
exports.listDestinations = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const category = Number(req.query.category) || 0;
    const minRating = Number(req.query.min_rating) || 0;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 48);
    const orderBy = SORTS[req.query.sort] || SORTS.popular;

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
    if (minRating) params.push(minRating);

    const base = `
      SELECT d.id, d.name, d.location, d.cover_image, d.price, d.category_id,
             d.description, d.highlights,
             c.name AS category,
             COALESCE(ROUND(AVG(r.score), 1), 0) AS avg_rating,
             COUNT(r.id) AS rating_count
      FROM destinations d
      JOIN categories c ON c.id = d.category_id
      LEFT JOIN ratings r ON r.destination_id = d.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY d.id, c.name
      ${minRating ? "HAVING avg_rating >= ?" : ""}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM (${base}) t`,
      params,
    );
    const [rows] = await db.query(
      `${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );

    res.json({
      items: rows.map((r) => ({
        ...r,
        avg_rating: Number(r.avg_rating),
        rating_count: Number(r.rating_count),
      })),
      total: Number(total),
      page,
      totalPages: Math.max(Math.ceil(Number(total) / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/destinations/:id  (token opsional)
exports.getDestination = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user ? req.user.id : 0;

    const [rows] = await db.query(
      `SELECT d.*, c.name AS category,
              COALESCE(ROUND(AVG(r.score), 1), 0) AS avg_rating,
              COUNT(r.id) AS rating_count,
              (SELECT COUNT(*) FROM reviews rv WHERE rv.destination_id = d.id) AS review_count
       FROM destinations d
       JOIN categories c ON c.id = d.category_id
       LEFT JOIN ratings r ON r.destination_id = d.id
       WHERE d.id = ?
       GROUP BY d.id, c.name`,
      [id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Destinasi tidak ditemukan" });

    const destination = {
      ...rows[0],
      avg_rating: Number(rows[0].avg_rating),
      rating_count: Number(rows[0].rating_count),
      review_count: Number(rows[0].review_count),
    };

    // Sebaran bintang
    const [dist] = await db.query(
      "SELECT score, COUNT(*) AS total FROM ratings WHERE destination_id = ? GROUP BY score",
      [id],
    );
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    dist.forEach((r) => {
      distribution[r.score] = Number(r.total);
    });

    // Ulasan
    const [reviews] = await db.query(
      `SELECT rv.id, rv.user_id, rv.title, rv.content,
              DATE_FORMAT(rv.visit_date, '%Y-%m-%d') AS visit_date,
              rv.created_at, u.name AS user_name, rt.score,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.user_id = rv.user_id) AS user_review_count,
              (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = rv.id) AS helpful_count,
              EXISTS(SELECT 1 FROM review_helpful h
                     WHERE h.review_id = rv.id AND h.user_id = ?) AS liked
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
       WHERE rv.destination_id = ?
       ORDER BY rv.created_at DESC, rv.id DESC
       LIMIT 50`,
      [userId, id],
    );

    // Semua foto destinasi (dari ulasan pengunjung)
    const [photos] = await db.query(
      // Galeri resmi (review_id NULL) tampil lebih dulu, lalu foto ulasan terbaru
      "SELECT id, review_id, file_path FROM photos WHERE destination_id = ? ORDER BY (review_id IS NULL) DESC, id DESC LIMIT 1000",
      [id],
    );

    // Ulasan yang sudah dilaporkan user ini (fitur laporan, toleran bila tabel belum ada)
    let reportedIds = new Set();
    if (userId && reviews.length > 0 && (await reports.isEnabled())) {
      const [rep] = await db.query(
        "SELECT review_id FROM review_reports WHERE reporter_id = ? AND status = 'open' AND review_id IN (?)",
        [userId, reviews.map((r) => r.id)],
      );
      reportedIds = new Set(rep.map((x) => x.review_id));
    }

    // Tanggapan resmi pengelola per ulasan (toleran bila tabel belum ada)
    const replyMap = await replies.byReview(reviews.map((r) => r.id));

    const reviewList = reviews.map(({ user_id: authorId, ...r }) => ({
      ...r,
      score: r.score ? Number(r.score) : 0,
      user_review_count: Number(r.user_review_count),
      helpful_count: Number(r.helpful_count),
      liked: !!r.liked,
      mine: userId > 0 && authorId === userId,
      reported: reportedIds.has(r.id),
      reply: replyMap[r.id] || null,
      photos: photos
        .filter((p) => p.review_id === r.id)
        .map((p) => p.file_path),
    }));

    let myRating = 0;
    let myReview = null;
    let isFavorite = false;
    if (req.user) {
      const [[r1]] = await db.query(
        "SELECT score FROM ratings WHERE user_id = ? AND destination_id = ?",
        [req.user.id, id],
      );
      myRating = r1 ? r1.score : 0;

      const [[r2]] = await db.query(
        `SELECT id, title, content, DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date
         FROM reviews WHERE user_id = ? AND destination_id = ?`,
        [req.user.id, id],
      );
      if (r2) {
        myReview = {
          title: r2.title,
          content: r2.content,
          visit_date: r2.visit_date,
          photos: photos
            .filter((p) => p.review_id === r2.id)
            .map((p) => ({ id: p.id, file_path: p.file_path })),
        };
      }

      const [fav] = await db.query(
        "SELECT id FROM favorites WHERE user_id = ? AND destination_id = ?",
        [req.user.id, id],
      );
      isFavorite = fav.length > 0;
    }

    res.json({
      destination,
      distribution,
      reviews: reviewList,
      photos: photos.map((p) => p.file_path),
      // Galeri resmi pengelola/admin saja (foto ulasan tampil di masing-masing ulasan)
      gallery: photos.filter((p) => p.review_id === null).map((p) => p.file_path),
      myRating,
      myReview,
      isFavorite,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/destinations/:id/rating   body: { score }
exports.setRating = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const score = Number(req.body.score);

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ message: "Skor harus angka 1 sampai 5" });
    }
    const [d] = await db.query("SELECT id FROM destinations WHERE id = ?", [
      id,
    ]);
    if (d.length === 0)
      return res.status(404).json({ message: "Destinasi tidak ditemukan" });

    await db.query(
      `INSERT INTO ratings (user_id, destination_id, score) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
      [req.user.id, id, score],
    );

    const [[s]] = await db.query(
      `SELECT COALESCE(ROUND(AVG(score), 1), 0) AS avg_rating, COUNT(*) AS rating_count
       FROM ratings WHERE destination_id = ?`,
      [id],
    );
    res.json({
      score,
      avg_rating: Number(s.avg_rating),
      rating_count: Number(s.rating_count),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/destinations/:id/review   body: { title, content, visit_date }
exports.setReview = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const title = (req.body.title || "").trim().slice(0, 150) || null;
    const content = (req.body.content || "").trim();
    const visitDate = req.body.visit_date || null;

    if (content.length < 10) {
      return res.status(400).json({ message: "Ulasan minimal 10 karakter" });
    }
    const [d] = await db.query(
      "SELECT id, name FROM destinations WHERE id = ?",
      [id],
    );
    if (d.length === 0)
      return res.status(404).json({ message: "Destinasi tidak ditemukan" });

    // Ulasan baru atau perubahan? Notifikasi hanya untuk ulasan baru.
    const [existing] = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND destination_id = ?",
      [req.user.id, id],
    );
    const isNew = existing.length === 0;

    const [result] = await db.query(
      `INSERT INTO reviews (user_id, destination_id, title, content, visit_date)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), content = VALUES(content), visit_date = VALUES(visit_date)`,
      [req.user.id, id, title, content, visitDate],
    );

    if (isNew) {
      const [[me]] = await db.query("SELECT name FROM users WHERE id = ?", [
        req.user.id,
      ]);
      await notifyWishlist(
        id,
        req.user.id,
        `${me.name} menulis ulasan baru di ${d[0].name}, destinasi di wishlistmu`,
        `/destinasi/${id}`,
        `wish-review:${result.insertId}`,
      );
    }

    res.json({ message: "Ulasan tersimpan" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/destinations/:id/review?with_rating=1   (hapus ulasan milik sendiri)
// Foto ulasan ikut terhapus (baris DB + file). Rating tetap, kecuali with_rating=1.
exports.deleteMyReview = async (req, res) => {
  const id = Number(req.params.id);
  const withRating = req.query.with_rating === "1";
  const conn = await db.getConnection();
  let files = [];
  try {
    await conn.beginTransaction();
    const [rv] = await conn.query(
      "SELECT id FROM reviews WHERE user_id = ? AND destination_id = ? FOR UPDATE",
      [req.user.id, id],
    );
    if (rv.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Kamu belum punya ulasan di destinasi ini" });
    }
    const [photos] = await conn.query(
      "SELECT file_path FROM photos WHERE review_id = ?",
      [rv[0].id],
    );
    files = photos.map((p) => p.file_path);
    // FK photos.review_id = SET NULL, jadi baris foto dihapus eksplisit
    await conn.query("DELETE FROM photos WHERE review_id = ?", [rv[0].id]);
    await conn.query("DELETE FROM reviews WHERE id = ?", [rv[0].id]);
    if (withRating) {
      await conn.query(
        "DELETE FROM ratings WHERE user_id = ? AND destination_id = ?",
        [req.user.id, id],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }

  // File dihapus hanya setelah transaksi berhasil
  const root = path.resolve(UPLOAD_ROOT);
  files.forEach((rel) => {
    const full = path.resolve(root, rel);
    if (full.startsWith(root + path.sep)) fs.unlink(full, () => {});
  });
  res.json({
    message: withRating ? "Ulasan dan rating dihapus" : "Ulasan dihapus",
    photosDeleted: files.length,
  });
};

// POST /api/destinations/:id/favorite  (toggle simpan)
exports.toggleFavorite = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [d] = await db.query("SELECT id FROM destinations WHERE id = ?", [
      id,
    ]);
    if (d.length === 0)
      return res.status(404).json({ message: "Destinasi tidak ditemukan" });

    const [exist] = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND destination_id = ?",
      [req.user.id, id],
    );
    if (exist.length > 0) {
      await db.query("DELETE FROM favorites WHERE id = ?", [exist[0].id]);
    } else {
      await db.query(
        "INSERT INTO favorites (user_id, destination_id) VALUES (?, ?)",
        [req.user.id, id],
      );
    }
    res.json({ favorite: exist.length === 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
