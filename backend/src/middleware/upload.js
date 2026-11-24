const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads");
const REVIEW_DIR = path.join(UPLOAD_ROOT, "reviews");
const GALLERY_DIR = path.join(UPLOAD_ROOT, "gallery"); // galeri resmi destinasi (admin/pengelola)
fs.mkdirSync(REVIEW_DIR, { recursive: true });
fs.mkdirSync(GALLERY_DIR, { recursive: true });

const EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REVIEW_DIR),
  filename: (req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${EXT[file.mimetype]}`,
    ),
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype]
      ? cb(null, true)
      : cb(new Error("Hanya file gambar (JPG, PNG, WEBP, GIF)")),
});

// Membungkus multer supaya error tampil sebagai JSON yang rapi
exports.parsePhotos = (req, res, next) => {
  upload.array("photos", 30)(req, res, (err) => {
    if (!err) return next();
    let message = err.message;
    if (err.code === "LIMIT_FILE_SIZE")
      message = "Ukuran foto maksimal 8 MB per file";
    if (
      err.code === "LIMIT_FILE_COUNT" ||
      err.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      message = "Maksimal 30 foto per pengiriman";
    }
    res.status(400).json({ message });
  });
};

// Unggah foto galeri destinasi (field: photos, maks. 20 per kiriman, 8 MB per file)
const galleryUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GALLERY_DIR),
    filename: (req, file, cb) =>
      cb(
        null,
        `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${EXT[file.mimetype]}`,
      ),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype]
      ? cb(null, true)
      : cb(new Error("Hanya file gambar (JPG, PNG, WEBP, GIF)")),
});

exports.parseGalleryPhotos = (req, res, next) => {
  galleryUpload.array("photos", 20)(req, res, (err) => {
    if (!err) return next();
    let message = err.message;
    if (err.code === "LIMIT_FILE_SIZE")
      message = "Ukuran foto maksimal 8 MB per file";
    if (
      err.code === "LIMIT_FILE_COUNT" ||
      err.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      message = "Maksimal 20 foto per unggahan";
    }
    res.status(400).json({ message });
  });
};

exports.UPLOAD_ROOT = UPLOAD_ROOT;
