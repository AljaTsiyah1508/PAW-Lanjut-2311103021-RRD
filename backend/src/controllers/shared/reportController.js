// Laporan ulasan oleh pengguna (wisatawan & pengelola) — masuk antrean moderasi admin.
const db = require("../../config/db");
const reports = require("../../services/reports");

// GET /api/reports/status   → apakah fitur aktif + daftar alasan
exports.status = async (req, res) => {
  res.json({
    enabled: await reports.isEnabled(),
    reasons: Object.entries(reports.REASONS).map(([key, label]) => ({ key, label })),
  });
};

// POST /api/reviews/:id/report   body: { reason, note? }
exports.reportReview = async (req, res) => {
  try {
    if (!(await reports.isEnabled()))
      return res.status(503).json({ message: "Fitur laporan belum diaktifkan" });
    if (req.user.role === "admin")
      return res.status(400).json({ message: "Admin memoderasi langsung dari panel admin" });

    const id = Number(req.params.id);
    const reason = String(req.body?.reason || "");
    const note = String(req.body?.note || "").trim().slice(0, 255) || null;
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ message: "ID ulasan tidak valid" });
    if (!reports.REASONS[reason])
      return res.status(400).json({ message: "Pilih alasan laporan" });
    if (reason === "lainnya" && !note)
      return res.status(400).json({ message: "Jelaskan alasan laporan" });

    const [[rv]] = await db.query("SELECT id, user_id FROM reviews WHERE id = ?", [id]);
    if (!rv) return res.status(404).json({ message: "Ulasan tidak ditemukan" });
    if (rv.user_id === req.user.id)
      return res.status(400).json({ message: "Kamu tidak bisa melaporkan ulasanmu sendiri" });

    // Laporan ulang setelah sebelumnya diabaikan admin = dibuka kembali
    const [result] = await db.query(
      `INSERT INTO review_reports (review_id, reporter_id, reason, note) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = IF(status = 'dismissed', VALUES(reason), reason),
         note = IF(status = 'dismissed', VALUES(note), note),
         status = 'open', handled_by = NULL, handled_at = NULL`,
      [id, req.user.id, reason, note],
    );
    // affectedRows: 1 = baru, 2 = diperbarui, 0 = sudah ada & masih terbuka
    if (result.affectedRows === 0)
      return res.status(409).json({ message: "Kamu sudah melaporkan ulasan ini" });
    res.status(201).json({ message: "Laporan terkirim. Terima kasih, admin akan meninjaunya." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
