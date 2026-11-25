const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = require("../config/uploads");
const PROFILE_DIR = path.join(UPLOAD_ROOT, "profiles");
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_DIR),
  filename: (req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${EXT[file.mimetype]}`,
    ),
});

// Satu gambar per kiriman, ukuran maksimal ditentukan per field
exports.parseImage = (field, maxMB) => {
  const upload = multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) =>
      EXT[file.mimetype]
        ? cb(null, true)
        : cb(new Error("Hanya file gambar (JPG, PNG, WEBP, GIF)")),
  }).single(field);

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      let message = err.message;
      if (err.code === "LIMIT_FILE_SIZE")
        message = `Ukuran gambar maksimal ${maxMB} MB`;
      res.status(400).json({ message });
    });
};

exports.UPLOAD_ROOT = UPLOAD_ROOT;
