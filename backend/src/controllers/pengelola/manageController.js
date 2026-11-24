// Portal pengelola destinasi (SRS 3.4, 3.8–3.10, 3.15–3.16, tabel 2.3).
// Semua data dibatasi ke destinasi dengan owner_id = user yang login.
const db = require("../../config/db");
const destinations = require("../../services/destinations");
const gallery = require("../../services/gallery");
const reports = require("../../services/reports");
const replies = require("../../services/replies");
const { notify } = require("../../services/notify");

const { toId } = destinations;

const paging = (query, def = 15) => {
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

const fail = (res, err) =>
  res.status(err.status || 500).json({ message: err.message || "Terjadi kesalahan" });

// ================================================================
// RINGKASAN (SRS 3.4: rata-rata rating, jumlah review, review terbaru)
// ================================================================

// GET /api/manage/summary
// Kartu: rata-rata rating (+ selisih dibanding 30 hari lalu), jumlah ulasan (+ baru 30 hari, % dibalas),
// jumlah destinasi; grafik tren rating 6 bulan; 5 ulasan terbaru beserta status tanggapan.
exports.getSummary = async (req, res) => {
  try {
    const me = req.user.id;
    const withReplies = await replies.isEnabled();

    const [[t]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM destinations WHERE owner_id = ?) AS destinations,
         (SELECT COUNT(*) FROM reviews rv JOIN destinations d ON d.id = rv.destination_id WHERE d.owner_id = ?) AS reviews,
         (SELECT COUNT(*) FROM reviews rv JOIN destinations d ON d.id = rv.destination_id
            WHERE d.owner_id = ? AND rv.created_at >= NOW() - INTERVAL 30 DAY) AS reviews30,
         ${withReplies
           ? `(SELECT COUNT(*) FROM review_replies rp JOIN reviews rv ON rv.id = rp.review_id
                JOIN destinations d ON d.id = rv.destination_id WHERE d.owner_id = ?)`
           : "0"} AS replied,
         (SELECT COUNT(*) FROM ratings r JOIN destinations d ON d.id = r.destination_id WHERE d.owner_id = ?) AS ratings,
         (SELECT ROUND(AVG(r.score), 2) FROM ratings r JOIN destinations d ON d.id = r.destination_id WHERE d.owner_id = ?) AS avg_rating,
         (SELECT ROUND(AVG(r.score), 2) FROM ratings r JOIN destinations d ON d.id = r.destination_id
            WHERE d.owner_id = ? AND r.created_at < NOW() - INTERVAL 30 DAY) AS avg_before`,
      withReplies ? [me, me, me, me, me, me, me] : [me, me, me, me, me, me],
    );

    const [names] = await db.query(
      "SELECT name FROM destinations WHERE owner_id = ? ORDER BY name LIMIT 3",
      [me],
    );

    // Rata-rata rating per bulan, 6 bulan terakhir (bulan tanpa rating = null)
    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(r.created_at, '%Y-%m') AS ym, ROUND(AVG(r.score), 2) AS avg, COUNT(*) AS n
       FROM ratings r JOIN destinations d ON d.id = r.destination_id
       WHERE d.owner_id = ? AND r.created_at >= DATE_FORMAT(NOW() - INTERVAL 5 MONTH, '%Y-%m-01')
       GROUP BY ym`,
      [me],
    );
    const byMonth = Object.fromEntries(monthly.map((m) => [m.ym, m]));
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const m = byMonth[ym];
      return { month: ym, avg: m ? Number(m.avg) : null, count: m ? Number(m.n) : 0 };
    });

    const [latestReviews] = await db.query(
      `SELECT rv.id, rv.title, rv.content, rv.created_at,
              u.name AS user_name, d.id AS destination_id, d.name AS destination_name, rt.score
              ${withReplies ? ", EXISTS(SELECT 1 FROM review_replies rp WHERE rp.review_id = rv.id) AS replied" : ""}
       FROM reviews rv
       JOIN destinations d ON d.id = rv.destination_id
       JOIN users u ON u.id = rv.user_id
       LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
       WHERE d.owner_id = ?
       ORDER BY rv.created_at DESC, rv.id DESC
       LIMIT 5`,
      [me],
    );

    const avg = t.avg_rating === null ? null : Number(t.avg_rating);
    const before = t.avg_before === null ? null : Number(t.avg_before);
    const reviews = Number(t.reviews);
    res.json({
      destinations: Number(t.destinations),
      destinationNames: names.map((n) => n.name),
      reviews,
      reviews30: Number(t.reviews30),
      replied: Number(t.replied),
      responseRate: withReplies && reviews ? Math.round((Number(t.replied) / reviews) * 100) : null,
      ratings: Number(t.ratings),
      avgRating: avg,
      // Selisih rata-rata kumulatif sekarang vs 30 hari lalu (null bila belum ada pembanding)
      avgDelta: avg !== null && before !== null ? Math.round((avg - before) * 100) / 100 : null,
      monthly: months,
      repliesEnabled: withReplies,
      latestReviews: latestReviews.map((r) => ({
        ...r,
        score: r.score ? Number(r.score) : 0,
        replied: Boolean(r.replied),
      })),
    });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// DESTINASI MILIKKU
// ================================================================

// Data dianggap "perlu dilengkapi" bila salah satu info penting wisatawan kosong.
// Aturan yang sama dipakai frontend (pages/pengelola/ManageDestinations) untuk menyebut bagian yang kurang.
const INCOMPLETE_SQL = `(d.description IS NULL OR CHAR_LENGTH(TRIM(d.description)) < 30
  OR d.open_hours IS NULL OR d.open_hours = '' OR d.price IS NULL
  OR d.cover_image IS NULL OR d.cover_image = '' OR d.latitude IS NULL OR d.longitude IS NULL)`;

// GET /api/manage/destinations?q=&category=&status=complete|incomplete&page=&limit=
// Juga mengembalikan ringkasan semua destinasi milik user (stats) dan jumlah per kategori (untuk tab).
exports.listDestinations = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 150);
    const category = req.query.category ? toId(req.query.category) : 0;
    const status = ["complete", "incomplete"].includes(req.query.status) ? req.query.status : "";
    if (category === null) return res.status(400).json({ message: "Kategori tidak valid" });
    const { page, limit, offset } = paging(req.query);

    const where = ["d.owner_id = ?"];
    const params = [req.user.id];
    if (q) {
      where.push("(d.name LIKE ? OR d.location LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push("d.category_id = ?");
      params.push(category);
    }
    if (status === "incomplete") where.push(INCOMPLETE_SQL);
    if (status === "complete") where.push(`NOT ${INCOMPLETE_SQL}`);
    const whereSql = "WHERE " + where.join(" AND ");

    // Ulasan yang belum ditanggapi (hanya bila fitur tanggapan sudah aktif)
    const withReplies = await replies.isEnabled();
    const pendingSql = withReplies
      ? `(SELECT COUNT(*) FROM reviews rv LEFT JOIN review_replies rp ON rp.review_id = rv.id
          WHERE rv.destination_id = d.id AND rp.id IS NULL)`
      : "0";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM destinations d ${whereSql}`,
      params,
    );
    const [rows] = await db.query(
      `SELECT d.id, d.name, d.location, ${(await destinations.hasAddress()) ? "d.address" : "NULL AS address"},
              d.category_id, c.name AS category,
              d.description, d.latitude, d.longitude, d.price, d.open_hours,
              d.best_time, d.highlights, d.cover_image, d.source, d.created_at, d.updated_at,
              (SELECT COALESCE(ROUND(AVG(r.score), 1), 0) FROM ratings r WHERE r.destination_id = d.id) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r WHERE r.destination_id = d.id) AS rating_count,
              (SELECT COUNT(*) FROM reviews rv WHERE rv.destination_id = d.id) AS review_count,
              (SELECT COUNT(*) FROM photos ph WHERE ph.destination_id = d.id AND ph.review_id IS NULL) AS photo_count,
              ${pendingSql} AS pending_replies
       FROM destinations d
       JOIN categories c ON c.id = d.category_id
       ${whereSql}
       ORDER BY d.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Ringkasan seluruh destinasi milik user (tidak ikut filter)
    const [[s]] = await db.query(
      `SELECT COUNT(*) AS total, SUM(${INCOMPLETE_SQL}) AS incomplete,
              (SELECT COUNT(*) FROM reviews rv JOIN destinations d2 ON d2.id = rv.destination_id WHERE d2.owner_id = ?) AS reviews,
              (SELECT COUNT(*) FROM photos ph JOIN destinations d2 ON d2.id = ph.destination_id
                WHERE d2.owner_id = ? AND ph.review_id IS NULL) AS photos,
              (SELECT ROUND(AVG(r.score), 2) FROM ratings r JOIN destinations d2 ON d2.id = r.destination_id WHERE d2.owner_id = ?) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r JOIN destinations d2 ON d2.id = r.destination_id WHERE d2.owner_id = ?) AS ratings
       FROM destinations d WHERE d.owner_id = ?`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id],
    );
    const [cats] = await db.query(
      `SELECT c.id, c.name, COUNT(*) AS total
       FROM destinations d JOIN categories c ON c.id = d.category_id
       WHERE d.owner_id = ? GROUP BY c.id, c.name ORDER BY c.name`,
      [req.user.id],
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
          pending_replies: Number(r.pending_replies),
        })),
        total,
        page,
        limit,
      ),
      stats: {
        total: Number(s.total),
        incomplete: Number(s.incomplete) || 0,
        reviews: Number(s.reviews),
        photos: Number(s.photos),
        avgRating: s.avg_rating === null ? null : Number(s.avg_rating),
        ratings: Number(s.ratings),
      },
      categories: cats.map((c) => ({ id: c.id, name: c.name, total: Number(c.total) })),
      repliesEnabled: withReplies,
      addressEnabled: await destinations.hasAddress(),
    });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/manage/destinations   (SRS 3.8: pengelola otomatis jadi pemilik)
exports.createDestination = async (req, res) => {
  try {
    const id = await destinations.createDestination(req.body, req.user.id);
    res.status(201).json({ message: "Destinasi ditambahkan", id });
  } catch (err) {
    fail(res, err);
  }
};

// PUT /api/manage/destinations/:id   (SRS 3.9: hanya destinasi miliknya)
exports.updateDestination = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    await destinations.updateDestination(id, req.body, req.user.id);
    res.json({ message: "Destinasi diperbarui" });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/manage/destinations/:id   (SRS 3.10: hanya destinasi miliknya)
exports.deleteDestination = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    await destinations.deleteDestination(id, req.user.id);
    res.json({ message: "Destinasi dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// FOTO GALERI DESTINASI MILIKKU (SRS 3.15, 3.16)
// ================================================================

// GET /api/manage/destinations/:id/photos
exports.listDestinationPhotos = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID destinasi tidak valid" });
    await destinations.findDestination(id, req.user.id);
    res.json(await gallery.listPhotos(id, { galleryOnly: true })); // foto ulasan dimoderasi admin
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/manage/destinations/:id/photos   (multipart, field: photos)
exports.uploadDestinationPhotos = async (req, res) => {
  const files = req.files || [];
  try {
    const id = toId(req.params.id);
    if (!id) throw Object.assign(new Error("ID destinasi tidak valid"), { status: 400 });
    await destinations.findDestination(id, req.user.id);
    const { added, firstId } = await gallery.addGalleryPhotos(id, req.user.id, files);
    // ?cover=1: foto pertama langsung dijadikan cover (dari form destinasi)
    const cover = req.query.cover === "1" ? await gallery.setCover(id, firstId) : undefined;
    res.status(201).json({ message: `${added} foto ditambahkan ke galeri`, added, cover_image: cover });
  } catch (err) {
    gallery.unlinkFiles(files.map((f) => `gallery/${f.filename}`)); // file sudah tersimpan multer
    fail(res, err);
  }
};

// PATCH /api/manage/destinations/:id/cover   body: { photo_id }
exports.setDestinationCover = async (req, res) => {
  try {
    const id = toId(req.params.id);
    const photoId = toId(req.body?.photo_id);
    if (!id || !photoId) return res.status(400).json({ message: "Data tidak valid" });
    await destinations.findDestination(id, req.user.id);
    const cover = await gallery.setCover(id, photoId);
    res.json({ message: "Cover destinasi diperbarui", cover_image: cover });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/manage/photos/:id   (hanya foto galeri di destinasi miliknya)
exports.deletePhoto = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID foto tidak valid" });
    await gallery.deletePhoto(id, { ownerId: req.user.id, galleryOnly: true });
    res.json({ message: "Foto dihapus" });
  } catch (err) {
    fail(res, err);
  }
};

// ================================================================
// ULASAN & RATING + TANGGAPAN RESMI (moderasi tetap oleh admin)
// ================================================================

const SORTS = {
  newest: "rv.created_at DESC, rv.id DESC",
  oldest: "rv.created_at ASC, rv.id ASC",
  highest: "rt.score IS NULL, rt.score DESC, rv.created_at DESC",
  lowest: "rt.score IS NULL, rt.score ASC, rv.created_at DESC",
};
const STATUSES = ["pending", "replied"];
const REPLY_MIN = 10;
const REPLY_MAX = 2000;

// Filter bersama daftar ulasan & statistik: destinasi milik user + destinasi/rating/cari opsional
function reviewFilter(req) {
  const destination = req.query.destination ? toId(req.query.destination) : 0;
  const rating = req.query.rating ? Number(req.query.rating) : 0;
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (destination === null) throw Object.assign(new Error("Destinasi tidak valid"), { status: 400 });
  if (rating && (!Number.isInteger(rating) || rating < 1 || rating > 5))
    throw Object.assign(new Error("Rating harus 1 sampai 5"), { status: 400 });

  const where = ["d.owner_id = ?"];
  const params = [req.user.id];
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
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  return { where, params, destination };
}

// FROM ulasan milik pengelola; tanggapan di-JOIN hanya bila tabelnya sudah ada
const reviewFrom = (withReplies) => `
  FROM reviews rv
  JOIN destinations d ON d.id = rv.destination_id
  JOIN users u ON u.id = rv.user_id
  LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
  ${withReplies ? "LEFT JOIN review_replies rp ON rp.review_id = rv.id" : ""}`;

// Ulasan milik destinasi pengelola ini (null bila bukan miliknya / tidak ada)
async function ownedReview(reviewId, ownerId) {
  const [rows] = await db.query(
    `SELECT rv.id, rv.user_id, rv.destination_id, d.name AS destination_name
     FROM reviews rv JOIN destinations d ON d.id = rv.destination_id
     WHERE rv.id = ? AND d.owner_id = ?`,
    [reviewId, ownerId],
  );
  return rows[0] || null;
}

// GET /api/manage/reviews?destination=&rating=&q=&status=pending|replied&sort=&page=&limit=
exports.listReviews = async (req, res) => {
  try {
    const { where, params } = reviewFilter(req);
    const status = STATUSES.includes(req.query.status) ? req.query.status : "";
    const order = SORTS[req.query.sort] || SORTS.newest;
    const { page, limit, offset } = paging(req.query, 10);
    const withReplies = await replies.isEnabled();

    if (status === "pending" && withReplies) where.push("rp.id IS NULL");
    if (status === "replied") where.push(withReplies ? "rp.id IS NOT NULL" : "1 = 0");

    const whereSql = "WHERE " + where.join(" AND ");
    const from = reviewFrom(withReplies);

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
    const [rows] = await db.query(
      `SELECT rv.id, rv.title, rv.content, rv.created_at,
              DATE_FORMAT(rv.visit_date, '%Y-%m-%d') AS visit_date,
              u.name AS user_name, u.username,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.user_id = rv.user_id) AS user_review_count,
              d.id AS destination_id, d.name AS destination_name, rt.score,
              (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = rv.id) AS helpful_count
       ${from} ${whereSql}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const ids = rows.map((r) => r.id);
    let photos = [];
    let reported = new Set();
    let replyMap = {};
    if (ids.length > 0) {
      [photos] = await db.query("SELECT id, review_id, file_path FROM photos WHERE review_id IN (?)", [ids]);
      // Ulasan yang sudah dilaporkan pengelola ini ke admin (bila fitur laporan aktif)
      if (await reports.isEnabled()) {
        const [rep] = await db.query(
          "SELECT review_id FROM review_reports WHERE reporter_id = ? AND status = 'open' AND review_id IN (?)",
          [req.user.id, ids],
        );
        reported = new Set(rep.map((x) => x.review_id));
      }
      replyMap = await replies.byReview(ids);
    }

    res.json({
      ...pageResult(
        rows.map((r) => ({
          ...r,
          score: r.score ? Number(r.score) : 0,
          user_review_count: Number(r.user_review_count),
          helpful_count: Number(r.helpful_count),
          reported: reported.has(r.id),
          reply: replyMap[r.id] || null,
          photos: photos
            .filter((p) => p.review_id === r.id)
            .map((p) => ({ id: p.id, file_path: p.file_path })),
        })),
        total,
        page,
        limit,
      ),
      repliesEnabled: withReplies,
    });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/manage/reviews/stats?destination=&rating=&q=
// Kartu statistik + jumlah per tab (Semua / Belum Dibalas / Sudah Dibalas), mengikuti filter yang sama
exports.reviewStats = async (req, res) => {
  try {
    const { where, params, destination } = reviewFilter(req);
    const withReplies = await replies.isEnabled();
    const [[s]] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(rv.created_at >= NOW() - INTERVAL 30 DAY) AS last30,
              ${withReplies ? "SUM(rp.id IS NOT NULL)" : "0"} AS replied,
              ${withReplies ? "SUM(rp.id IS NULL AND rv.created_at < NOW() - INTERVAL 1 DAY)" : "COUNT(*)"} AS overdue
       ${reviewFrom(withReplies)} WHERE ${where.join(" AND ")}`,
      params,
    );

    // Rata-rata rating destinasi milik pengelola (termasuk rating tanpa teks ulasan)
    const [[r]] = await db.query(
      `SELECT ROUND(AVG(rt.score), 1) AS avg, COUNT(*) AS n
       FROM ratings rt JOIN destinations d ON d.id = rt.destination_id
       WHERE d.owner_id = ? ${destination ? "AND d.id = ?" : ""}`,
      destination ? [req.user.id, destination] : [req.user.id],
    );

    const total = Number(s.total);
    const replied = Number(s.replied) || 0;
    res.json({
      total,
      last30: Number(s.last30) || 0,
      replied,
      pending: total - replied,
      overdue: Number(s.overdue) || 0,
      responseRate: total ? Math.round((replied / total) * 1000) / 10 : null,
      avgRating: Number(r.n) ? Number(r.avg) : null,
      ratingCount: Number(r.n),
      repliesEnabled: withReplies,
    });
  } catch (err) {
    fail(res, err);
  }
};

// PUT /api/manage/reviews/:id/reply  { content }
// Tulis atau ubah tanggapan resmi (satu per ulasan). Penulis ulasan diberi notifikasi saat pertama kali dibalas.
exports.saveReply = async (req, res) => {
  try {
    if (!(await replies.isEnabled()))
      return res.status(503).json({ message: "Fitur tanggapan belum aktif. Jalankan backend/sql/replies.sql." });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID ulasan tidak valid" });

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length < REPLY_MIN || content.length > REPLY_MAX)
      return res.status(400).json({ message: `Tanggapan ${REPLY_MIN} sampai ${REPLY_MAX} karakter` });

    const rv = await ownedReview(id, req.user.id);
    if (!rv) return res.status(404).json({ message: "Ulasan tidak ditemukan di destinasi Anda" });

    const [r] = await db.query(
      `INSERT INTO review_replies (review_id, user_id, content) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), user_id = VALUES(user_id)`,
      [id, req.user.id, content],
    );
    const created = r.affectedRows === 1;
    if (created && rv.user_id !== req.user.id) {
      await notify(
        rv.user_id,
        "review_reply",
        `Pengelola ${rv.destination_name} menanggapi ulasanmu`,
        `/destinasi/${rv.destination_id}`,
        `reply:${id}`,
      );
    }

    const map = await replies.byReview([id]);
    res.json({ message: created ? "Tanggapan terkirim" : "Tanggapan diperbarui", reply: map[id] || null });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/manage/reviews/:id/reply
exports.deleteReply = async (req, res) => {
  try {
    if (!(await replies.isEnabled()))
      return res.status(503).json({ message: "Fitur tanggapan belum aktif" });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID ulasan tidak valid" });
    const rv = await ownedReview(id, req.user.id);
    if (!rv) return res.status(404).json({ message: "Ulasan tidak ditemukan di destinasi Anda" });

    const [r] = await db.query("DELETE FROM review_replies WHERE review_id = ?", [id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: "Ulasan ini belum punya tanggapan" });
    res.json({ message: "Tanggapan dihapus" });
  } catch (err) {
    fail(res, err);
  }
};
