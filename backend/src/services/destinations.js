// Logika data destinasi yang dipakai bersama oleh admin dan pengelola.
// ownerId: null = tanpa batasan (admin); angka = hanya destinasi milik user itu (pengelola).
const db = require("../config/db");
const { unlinkFiles } = require("./gallery");

class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Kolom alamat lengkap (backend/sql/address.sql). Toleran: bila kolom belum dibuat,
// alamat diabaikan dan query lain tidak gagal. Dicek ulang tiap 60 detik sampai ada.
let addressOn = false;
let addressCheckedAt = 0;
async function hasAddress() {
  if (addressOn) return true;
  if (Date.now() - addressCheckedAt < 60 * 1000) return false;
  addressCheckedAt = Date.now();
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'address'`,
    );
    addressOn = rows.length > 0;
  } catch {
    addressOn = false;
  }
  return addressOn;
}

// Teks opsional: dipangkas, kosong jadi null, ditolak jika terlalu panjang
const optText = (v, max, label) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > max) throw new ServiceError(400, `${label} maksimal ${max} karakter`);
  return s;
};

// Angka opsional dalam rentang tertentu
const optNumber = (v, min, max, label) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new ServiceError(400, `${label} harus angka ${min} sampai ${max}`);
  return n;
};

// Validasi body form destinasi; dipakai tambah dan ubah
async function readDestinationBody(b = {}, current = null) {
  const name = String(b.name ?? "").trim();
  if (name.length < 2 || name.length > 150)
    throw new ServiceError(400, "Nama destinasi 2 sampai 150 karakter");

  const location = String(b.location ?? "").trim();
  if (location.length < 2 || location.length > 150)
    throw new ServiceError(400, "Lokasi 2 sampai 150 karakter");

  const categoryId = toId(b.category_id);
  if (!categoryId) throw new ServiceError(400, "Pilih kategori");
  const [cat] = await db.query("SELECT id FROM categories WHERE id = ?", [categoryId]);
  if (cat.length === 0) throw new ServiceError(400, "Kategori tidak ditemukan");

  const address = optText(b.address, 255, "Alamat");
  const description = optText(b.description, 5000, "Deskripsi");
  const openHours = optText(b.open_hours, 100, "Jam buka");
  const bestTime = optText(b.best_time, 50, "Waktu terbaik");
  const highlights = optText(b.highlights, 255, "Highlights");

  const price = optNumber(b.price, 0, 100000000, "Harga tiket");
  if (price !== null && !Number.isInteger(price))
    throw new ServiceError(400, "Harga tiket harus bilangan bulat");

  const latitude = optNumber(b.latitude, -90, 90, "Latitude");
  const longitude = optNumber(b.longitude, -180, 180, "Longitude");
  if ((latitude === null) !== (longitude === null))
    throw new ServiceError(400, "Isi latitude dan longitude sekaligus, atau kosongkan keduanya");

  // Cover: URL http(s); nilai lama (mis. foto galeri lokal) boleh dipertahankan apa adanya
  const cover = optText(b.cover_image, 500, "URL cover");
  if (cover && cover !== current?.cover_image && !/^https?:\/\/\S+$/i.test(cover))
    throw new ServiceError(400, "URL cover harus diawali http:// atau https://");

  return {
    name,
    location,
    address,
    category_id: categoryId,
    description,
    open_hours: openHours,
    best_time: bestTime,
    highlights,
    price,
    latitude,
    longitude,
    cover_image: cover,
  };
}

const DEST_FIELDS = [
  "name",
  "location",
  "category_id",
  "description",
  "open_hours",
  "best_time",
  "highlights",
  "price",
  "latitude",
  "longitude",
  "cover_image",
];

// Kolom yang disimpan; "address" hanya bila kolomnya sudah ada
const destFields = async () => ((await hasAddress()) ? [...DEST_FIELDS, "address"] : DEST_FIELDS);

// Ambil destinasi; bila ownerId diberikan, pastikan milik user itu
async function findDestination(id, ownerId = null, conn = db, lock = false) {
  const [rows] = await conn.query(
    `SELECT id, owner_id, cover_image FROM destinations WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (rows.length === 0) throw new ServiceError(404, "Destinasi tidak ditemukan");
  if (ownerId && rows[0].owner_id !== ownerId)
    throw new ServiceError(403, "Destinasi ini bukan milikmu");
  return rows[0];
}

// Tambah destinasi baru (source = 'manual'); ownerId otomatis jadi pemilik
exports.createDestination = async (body, ownerId = null) => {
  const data = await readDestinationBody(body);
  const fields = await destFields();
  const [result] = await db.query(
    `INSERT INTO destinations (${fields.join(", ")}, owner_id, source)
     VALUES (${fields.map(() => "?").join(", ")}, ?, 'manual')`,
    [...fields.map((f) => data[f]), ownerId],
  );
  return result.insertId;
};

exports.updateDestination = async (id, body, ownerId = null) => {
  const current = await findDestination(id, ownerId);
  const data = await readDestinationBody(body, current);
  const fields = await destFields();
  await db.query(
    `UPDATE destinations SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`,
    [...fields.map((f) => data[f]), id],
  );
};

// Hapus destinasi; ulasan, rating, foto, favorit ikut terhapus (CASCADE).
// File foto dihapus dari disk hanya setelah transaksi berhasil.
exports.deleteDestination = async (id, ownerId = null) => {
  const conn = await db.getConnection();
  let files = [];
  try {
    await conn.beginTransaction();
    await findDestination(id, ownerId, conn, true);
    const [photos] = await conn.query(
      "SELECT file_path FROM photos WHERE destination_id = ?",
      [id],
    );
    files = photos.map((p) => p.file_path);
    await conn.query("DELETE FROM destinations WHERE id = ?", [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  unlinkFiles(files);
};

exports.findDestination = findDestination;
exports.ServiceError = ServiceError;
exports.toId = toId;
exports.hasAddress = hasAddress;
