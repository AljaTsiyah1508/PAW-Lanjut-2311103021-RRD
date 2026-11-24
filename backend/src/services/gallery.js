// Logika foto destinasi yang dipakai bersama oleh admin (dan nanti pengelola).
// Foto galeri = baris photos dengan review_id NULL; foto ulasan = review_id terisi.
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const { UPLOAD_ROOT } = require("../middleware/upload");

class GalleryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Hapus file lokal di dalam folder uploads (dipanggil setelah transaksi berhasil)
const unlinkFiles = (relPaths) => {
  const root = path.resolve(UPLOAD_ROOT);
  relPaths.filter(Boolean).forEach((rel) => {
    if (/^https?:\/\//i.test(rel)) return;
    const full = path.resolve(root, rel);
    if (full.startsWith(root + path.sep)) fs.unlink(full, () => {});
  });
};

// Semua foto satu destinasi: galeri lebih dulu, lalu foto ulasan
// galleryOnly: hanya foto galeri resmi (dipakai portal pengelola)
exports.listPhotos = async (destinationId, { galleryOnly = false } = {}) => {
  const [[dest]] = await db.query(
    "SELECT id, name, cover_image FROM destinations WHERE id = ?",
    [destinationId],
  );
  if (!dest) throw new GalleryError(404, "Destinasi tidak ditemukan");

  const [rows] = await db.query(
    `SELECT p.id, p.file_path, p.caption, p.review_id, p.created_at,
            u.id AS user_id, u.name AS user_name, u.role AS user_role
     FROM photos p JOIN users u ON u.id = p.user_id
     WHERE p.destination_id = ?${galleryOnly ? " AND p.review_id IS NULL" : ""}
     ORDER BY (p.review_id IS NULL) DESC, p.id DESC`,
    [destinationId],
  );
  const items = rows.map((r) => ({
    ...r,
    kind: r.review_id ? "review" : "gallery",
    is_cover: dest.cover_image === r.file_path,
  }));
  return { destination: dest, items };
};

// Simpan file yang sudah diunggah multer sebagai foto galeri
exports.addGalleryPhotos = async (destinationId, userId, files) => {
  if (!files || files.length === 0)
    throw new GalleryError(400, "Tidak ada foto yang dikirim");
  const [[dest]] = await db.query("SELECT id FROM destinations WHERE id = ?", [destinationId]);
  if (!dest) {
    unlinkFiles(files.map((f) => `gallery/${f.filename}`));
    throw new GalleryError(404, "Destinasi tidak ditemukan");
  }
  const values = files.map((f) => [destinationId, userId, null, `gallery/${f.filename}`]);
  let result;
  try {
    [result] = await db.query(
      "INSERT INTO photos (destination_id, user_id, review_id, file_path) VALUES ?",
      [values],
    );
  } catch (err) {
    unlinkFiles(values.map((v) => v[3])); // jangan tinggalkan file yatim
    throw err;
  }
  // insertId = id baris pertama dari insert banyak baris
  return { added: files.length, firstId: result.insertId };
};

// Hapus satu foto. Kalau foto itu cover destinasi, cover dikosongkan.
// Opsi untuk pengelola: ownerId = hanya destinasi miliknya; galleryOnly = foto ulasan tidak boleh dihapus.
// Tanpa opsi (admin) = semua foto.
exports.deletePhoto = async (photoId, { ownerId = null, galleryOnly = false } = {}) => {
  const conn = await db.getConnection();
  let filePath;
  try {
    await conn.beginTransaction();
    const [[photo]] = await conn.query(
      `SELECT p.*, d.owner_id FROM photos p JOIN destinations d ON d.id = p.destination_id
       WHERE p.id = ? FOR UPDATE`,
      [photoId],
    );
    if (!photo) throw new GalleryError(404, "Foto tidak ditemukan");
    if (ownerId && photo.owner_id !== ownerId)
      throw new GalleryError(403, "Foto ini bukan dari destinasi milikmu");
    if (galleryOnly && photo.review_id)
      throw new GalleryError(403, "Foto dari ulasan pengunjung hanya bisa dimoderasi admin");

    await conn.query("DELETE FROM photos WHERE id = ?", [photoId]);
    await conn.query(
      "UPDATE destinations SET cover_image = NULL WHERE id = ? AND cover_image = ?",
      [photo.destination_id, photo.file_path],
    );
    await conn.commit();
    filePath = photo.file_path;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  unlinkFiles([filePath]);
};

// Jadikan foto galeri sebagai cover destinasi
exports.setCover = async (destinationId, photoId) => {
  const [[photo]] = await db.query(
    "SELECT file_path, review_id FROM photos WHERE id = ? AND destination_id = ?",
    [photoId, destinationId],
  );
  if (!photo) throw new GalleryError(404, "Foto tidak ditemukan di destinasi ini");
  if (photo.review_id)
    throw new GalleryError(400, "Hanya foto galeri resmi yang bisa dijadikan cover");
  await db.query("UPDATE destinations SET cover_image = ? WHERE id = ?", [
    photo.file_path,
    destinationId,
  ]);
  return photo.file_path;
};

exports.GalleryError = GalleryError;
exports.unlinkFiles = unlinkFiles;
