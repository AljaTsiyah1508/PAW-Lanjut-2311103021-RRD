const db = require("../../config/db");

// GET /api/notifications  -> 20 terbaru + jumlah belum dibaca
exports.list = async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT id, type, message, link, is_read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 20`,
      [req.user.id],
    );
    const [[{ unread }]] = await db.query(
      "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0",
      [req.user.id],
    );
    res.json({
      items: items.map((n) => ({ ...n, is_read: !!n.is_read })),
      unread: Number(unread),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/notifications/read-all
exports.readAll = async (req, res) => {
  try {
    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [req.user.id],
    );
    res.json({ message: "Semua notifikasi ditandai dibaca" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/notifications/:id/read
exports.readOne = async (req, res) => {
  try {
    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [Number(req.params.id), req.user.id],
    );
    res.json({ message: "Ditandai dibaca" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
