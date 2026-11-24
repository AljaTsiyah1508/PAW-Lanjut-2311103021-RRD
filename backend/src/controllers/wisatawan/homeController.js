const db = require("../../config/db");
const { notify } = require("../../services/notify");

const DESTINATION_SELECT = `
  SELECT d.id, d.name, d.location, d.category_id, c.name AS category,
         d.price, d.best_time, d.highlights, d.cover_image, d.description, d.popularity,
         COALESCE(ROUND(AVG(r.score), 1), 0) AS avg_rating,
         COUNT(r.id) AS rating_count
  FROM destinations d
  JOIN categories c ON c.id = d.category_id
  LEFT JOIN ratings r ON r.destination_id = d.id
  GROUP BY d.id, c.name`;

// GET /api/home  (token opsional)
exports.getHome = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 0;

    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM destinations) AS destinations,
        (SELECT COUNT(*) FROM reviews)      AS reviews,
        (SELECT COUNT(*) FROM users)        AS contributors`);

    const [categories] = await db.query(`
      SELECT c.id, c.name, COUNT(d.id) AS total
      FROM categories c
      LEFT JOIN destinations d ON d.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.name`);

    const [reviews] = await db.query(
      `SELECT rv.id, rv.title, rv.content, rv.visit_date, rv.created_at,
              u.name AS user_name,
              d.id AS destination_id, d.name AS destination_name,
              rt.score,
              (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = rv.id) AS helpful_count,
              EXISTS(SELECT 1 FROM review_helpful h
                     WHERE h.review_id = rv.id AND h.user_id = ?) AS liked
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       JOIN destinations d ON d.id = rv.destination_id
       LEFT JOIN ratings rt ON rt.user_id = rv.user_id AND rt.destination_id = rv.destination_id
       ORDER BY rv.created_at DESC, rv.id DESC
       LIMIT 3`,
      [userId],
    );

    let photos = [];
    if (reviews.length > 0) {
      [photos] = await db.query(
        "SELECT review_id, file_path FROM photos WHERE review_id IN (?)",
        [reviews.map((r) => r.id)],
      );
    }

    const latestReviews = reviews.map((r) => ({
      ...r,
      score: r.score ? Number(r.score) : 0,
      helpful_count: Number(r.helpful_count),
      liked: !!r.liked,
      photos: photos
        .filter((p) => p.review_id === r.id)
        .map((p) => p.file_path),
    }));

    res.json({ stats, categories, latestReviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/recommendations  (token opsional)
exports.getRecommendations = async (req, res) => {
  try {
    const [all] = await db.query(DESTINATION_SELECT);

    const preferred = new Set();
    const rated = new Set();

    if (req.user) {
      const [pref] = await db.query(
        `SELECT DISTINCT d.category_id
         FROM ratings r JOIN destinations d ON d.id = r.destination_id
         WHERE r.user_id = ? AND r.score >= 4`,
        [req.user.id],
      );
      pref.forEach((p) => preferred.add(p.category_id));

      const [done] = await db.query(
        "SELECT destination_id FROM ratings WHERE user_id = ?",
        [req.user.id],
      );
      done.forEach((d) => rated.add(d.destination_id));
    }

    const items = all
      .filter((d) => !rated.has(d.id) && d.cover_image)
      .map((d) => {
        const avg = Number(d.avg_rating);
        const bonus = preferred.has(d.category_id) ? 8 : 0;
        return {
          ...d,
          avg_rating: avg,
          rating_count: Number(d.rating_count),
          popularity: Number(d.popularity) || 0,
          match: Math.min(99, Math.round(60 + (avg / 5) * 30) + bonus),
        };
      })
      .sort(
        (a, b) =>
          b.match - a.match ||
          b.rating_count - a.rating_count ||
          b.popularity - a.popularity,
      )
      .slice(0, 3);

    if (items.length > 0) {
      const [quotes] = await db.query(
        `SELECT rv.destination_id, rv.content, u.name AS user_name
         FROM reviews rv JOIN users u ON u.id = rv.user_id
         WHERE rv.destination_id IN (?)
         ORDER BY rv.created_at DESC, rv.id DESC`,
        [items.map((i) => i.id)],
      );
      items.forEach((i) => {
        i.quote = quotes.find((q) => q.destination_id === i.id) || null;
      });
    }

    res.json({ personalized: preferred.size > 0, items });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/reviews/:id/helpful  (wajib login, toggle)
exports.toggleHelpful = async (req, res) => {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user.id;

    const [rv] = await db.query(
      `SELECT rv.user_id AS owner_id, rv.destination_id, d.name AS destination_name
       FROM reviews rv JOIN destinations d ON d.id = rv.destination_id
       WHERE rv.id = ?`,
      [reviewId],
    );
    if (rv.length === 0)
      return res.status(404).json({ message: "Ulasan tidak ditemukan" });

    const [exist] = await db.query(
      "SELECT id FROM review_helpful WHERE user_id = ? AND review_id = ?",
      [userId, reviewId],
    );

    if (exist.length > 0) {
      await db.query("DELETE FROM review_helpful WHERE id = ?", [exist[0].id]);
    } else {
      await db.query(
        "INSERT INTO review_helpful (user_id, review_id) VALUES (?, ?)",
        [userId, reviewId],
      );

      // Beri tahu pemilik ulasan (bukan untuk ulasan sendiri; ref_key mencegah duplikat)
      if (rv[0].owner_id !== userId) {
        const [[me]] = await db.query("SELECT name FROM users WHERE id = ?", [
          userId,
        ]);
        await notify(
          rv[0].owner_id,
          "helpful",
          `${me.name} menandai ulasanmu di ${rv[0].destination_name} sebagai membantu`,
          `/destinasi/${rv[0].destination_id}`,
          `helpful:${reviewId}:${userId}`,
        );
      }
    }

    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) AS total FROM review_helpful WHERE review_id = ?",
      [reviewId],
    );
    res.json({ liked: exist.length === 0, total: Number(total) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
