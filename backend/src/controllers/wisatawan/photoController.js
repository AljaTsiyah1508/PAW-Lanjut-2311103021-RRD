const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const { UPLOAD_ROOT } = require("../../middleware/upload");

// POST /api/destinations/:id/photos   (multipart, field: photos)
exports.uploadPhotos = async (req, res) => {
  const files = req.files || [];
  try {
    const id = Number(req.params.id);
    if (files.length === 0) {
      return res.status(400).json({ message: "Tidak ada foto yang dikirim" });
    }

    // Foto menempel ke ulasan milik user di destinasi ini
    const [rv] = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND destination_id = ?",
      [req.user.id, id],
    );
    if (rv.length === 0) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return res
        .status(400)
        .json({ message: "Simpan ulasan dulu sebelum mengunggah foto" });
    }

    const values = files.map((f) => [
      id,
      req.user.id,
      rv[0].id,
      `reviews/${f.filename}`,
    ]);
    await db.query(
      "INSERT INTO photos (destination_id, user_id, review_id, file_path) VALUES ?",
      [values],
    );
    res.status(201).json({ added: files.length });
  } catch (err) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/photos/:id   (pemilik foto atau admin)
exports.deletePhoto = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await db.query("SELECT * FROM photos WHERE id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ message: "Foto tidak ditemukan" });

    const photo = rows[0];
    if (photo.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    await db.query("DELETE FROM photos WHERE id = ?", [id]);

    // Hapus file fisik (pastikan tetap di dalam folder uploads)
    const full = path.resolve(UPLOAD_ROOT, photo.file_path);
    if (full.startsWith(path.resolve(UPLOAD_ROOT))) fs.unlink(full, () => {});

    res.json({ message: "Foto dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
