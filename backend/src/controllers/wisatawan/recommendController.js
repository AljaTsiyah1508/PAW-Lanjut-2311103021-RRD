const db = require("../../config/db");

// "Hidden gems" = destinasi berfoto yang kurang populer (jumlah tautan Wikidata kecil).
// Naikkan angkanya kalau bagian itu terlalu sedikit isinya.
const HIDDEN_MAX_POPULARITY = 15;

const BASE = `
  SELECT d.id, d.name, d.location, d.category_id, c.name AS category,
         d.price, d.highlights, d.cover_image, d.description, d.popularity,
         COALESCE(ROUND(AVG(r.score), 2), 0) AS avg_rating,
         COUNT(r.id) AS rating_count
  FROM destinations d
  JOIN categories c ON c.id = d.category_id
  LEFT JOIN ratings r ON r.destination_id = d.id
  WHERE d.cover_image IS NOT NULL
  GROUP BY d.id, c.name`;

const num = (v) => Number(v) || 0;

// GET /api/recommendations/page  (token opsional)
exports.getRecommendationPage = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 0;

    const [rows] = await db.query(BASE);
    const [cats] = await db.query(
      "SELECT id, name FROM categories ORDER BY name",
    );

    const items = rows.map((d) => ({
      ...d,
      avg_rating: num(d.avg_rating),
      rating_count: num(d.rating_count),
      popularity: num(d.popularity),
    }));

    // ---------- Sinyal dari user ----------
    const likedCats = new Map(); // category_id -> jumlah rating >= 4
    const rated = new Set();
    const favs = new Set();
    let ratedCount = 0;

    if (userId) {
      const [mine] = await db.query(
        `SELECT r.destination_id, r.score, d.category_id
         FROM ratings r JOIN destinations d ON d.id = r.destination_id
         WHERE r.user_id = ?`,
        [userId],
      );
      ratedCount = mine.length;
      mine.forEach((m) => {
        rated.add(m.destination_id);
        if (m.score >= 4)
          likedCats.set(m.category_id, (likedCats.get(m.category_id) || 0) + 1);
      });

      const [f] = await db.query(
        "SELECT destination_id FROM favorites WHERE user_id = ?",
        [userId],
      );
      f.forEach((x) => favs.add(x.destination_id));
    }

    // ---------- Aktivitas komunitas ----------
    const [favTotals] = await db.query(
      "SELECT destination_id, COUNT(*) AS total FROM favorites GROUP BY destination_id",
    );
    const [favRecent] = await db.query(
      `SELECT destination_id, COUNT(*) AS n FROM favorites
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY destination_id`,
    );
    const [revRecent] = await db.query(
      `SELECT destination_id, COUNT(*) AS n FROM reviews
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY destination_id`,
    );
    const favTotal = new Map(
      favTotals.map((x) => [x.destination_id, num(x.total)]),
    );
    const favNew = new Map(favRecent.map((x) => [x.destination_id, num(x.n)]));
    const revNew = new Map(revRecent.map((x) => [x.destination_id, num(x.n)]));

    // ---------- Hitung skor per destinasi ----------
    items.forEach((d) => {
      const ratingPart = d.rating_count > 0 ? (d.avg_rating / 5) * 20 : 0;
      const popPart = Math.min(12, Math.round(Math.log2(1 + d.popularity) * 2));
      const prefPart = likedCats.has(d.category_id) ? 8 : 0;
      d.match = Math.min(99, Math.round(55 + ratingPart + popPart + prefPart));

      d.want_count = favTotal.get(d.id) || 0;
      d.recent_reviews = revNew.get(d.id) || 0;
      d.recent_activity = d.recent_reviews + (favNew.get(d.id) || 0);
      d.trend_score =
        d.recent_reviews * 3 +
        (favNew.get(d.id) || 0) * 2 +
        d.popularity * 0.05;
      d.is_favorite = favs.has(d.id);
      d.quote = null;
    });

    // ---------- Bagian 1: sesuai preferensi ----------
    const forYou = items
      .filter((d) => !rated.has(d.id))
      .sort(
        (a, b) =>
          b.match - a.match ||
          b.rating_count - a.rating_count ||
          b.popularity - a.popularity,
      )
      .slice(0, 3);

    const interestIds = [...likedCats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const interests = interestIds
      .slice(0, 3)
      .map((id) => catName[id])
      .filter(Boolean);

    const similarId = interestIds[0] || forYou[0]?.category_id || null;
    const similarCount = similarId
      ? items.filter((d) => d.category_id === similarId).length
      : 0;

    // ---------- Bagian 2: rating tertinggi (semua + per kategori) ----------
    const byRating = [...items].sort(
      (a, b) =>
        b.avg_rating - a.avg_rating ||
        b.rating_count - a.rating_count ||
        b.popularity - a.popularity,
    );
    const topByCategory = {};
    cats.forEach((c) => {
      const list = byRating.filter((d) => d.category_id === c.id).slice(0, 4);
      if (list.length) topByCategory[c.id] = list;
    });

    // ---------- Bagian 3: sedang ramai ----------
    const trending = [...items]
      .sort(
        (a, b) => b.trend_score - a.trend_score || b.popularity - a.popularity,
      )
      .slice(0, 3);

    // ---------- Bagian 4: hidden gems ----------
    let pool = items.filter(
      (d) =>
        d.popularity >= 1 &&
        d.popularity <= HIDDEN_MAX_POPULARITY &&
        (d.description || "").length > 40,
    );
    if (pool.length < 3)
      pool = items.filter((d) => (d.description || "").length > 40);
    const hidden = pool
      .sort(
        (a, b) =>
          b.avg_rating - a.avg_rating ||
          (pool === items ? 0 : b.popularity - a.popularity) ||
          a.popularity - b.popularity,
      )
      .slice(0, 3);

    // ---------- Kutipan ulasan terbaru untuk kartu yang tampil ----------
    const shown = new Set();
    [
      forYou,
      byRating.slice(0, 4),
      trending,
      hidden,
      ...Object.values(topByCategory),
    ].forEach((l) => l.forEach((d) => shown.add(d.id)));
    if (shown.size > 0) {
      const [quotes] = await db.query(
        `SELECT rv.destination_id, rv.content, u.name AS user_name
         FROM reviews rv JOIN users u ON u.id = rv.user_id
         WHERE rv.destination_id IN (?)
         ORDER BY rv.created_at DESC, rv.id DESC`,
        [[...shown]],
      );
      const byId = new Map(items.map((d) => [d.id, d]));
      quotes.forEach((q) => {
        const d = byId.get(q.destination_id);
        if (d && !d.quote)
          d.quote = { content: q.content, user_name: q.user_name };
      });
    }

    res.json({
      profile: {
        personalized: interests.length > 0,
        interests,
        rated_count: ratedCount,
      },
      forYou: {
        items: forYou,
        similar_category_id: similarId,
        similar_count: similarCount,
      },
      topRated: { all: byRating.slice(0, 4), by_category: topByCategory },
      trending,
      hidden,
      categories: cats.filter((c) => topByCategory[c.id]),
    });
  } catch (err) {
    console.error("RECOMMEND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
