const db = require("../../config/db");

const LIMIT = 4;

// GET /api/review-suggestions   (wajib login)
// Destinasi yang disarankan untuk diulas: wishlist dulu, lalu dilengkapi yang populer
exports.getSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;

    const [wish] = await db.query(
      `SELECT d.id, d.name, d.location, d.cover_image, c.name AS category,
              (SELECT score FROM ratings r WHERE r.user_id = ? AND r.destination_id = d.id) AS my_rating
       FROM favorites f
       JOIN destinations d ON d.id = f.destination_id
       JOIN categories c ON c.id = d.category_id
       WHERE f.user_id = ?
         AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.user_id = ? AND rv.destination_id = d.id)
       ORDER BY f.created_at DESC
       LIMIT ?`,
      [userId, userId, userId, LIMIT],
    );

    const items = wish.map((w) => ({
      ...w,
      my_rating: Number(w.my_rating) || 0,
      source: "wishlist",
    }));

    if (items.length < LIMIT) {
      const exclude = items.map((i) => i.id);
      const params = [userId, userId];
      if (exclude.length) params.push(exclude);
      params.push(LIMIT - items.length);

      const [pop] = await db.query(
        `SELECT d.id, d.name, d.location, d.cover_image, c.name AS category,
                (SELECT score FROM ratings r WHERE r.user_id = ? AND r.destination_id = d.id) AS my_rating
         FROM destinations d
         JOIN categories c ON c.id = d.category_id
         WHERE d.cover_image IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.user_id = ? AND rv.destination_id = d.id)
           ${exclude.length ? "AND d.id NOT IN (?)" : ""}
         ORDER BY d.popularity DESC, d.id ASC
         LIMIT ?`,
        params,
      );
      pop.forEach((p) =>
        items.push({
          ...p,
          my_rating: Number(p.my_rating) || 0,
          source: "popular",
        }),
      );
    }

    res.json({ items });
  } catch (err) {
    console.error("SUGGESTION ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
