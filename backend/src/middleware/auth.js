const jwt = require("jsonwebtoken");

// Wajib login
exports.verifyToken = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token tidak ditemukan" });
  }

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
    next();
  } catch (err) {
    res.status(401).json({ message: "Token tidak valid atau kedaluwarsa" });
  }
};

// Batasi berdasarkan role, contoh: authorizeRoles('admin', 'pengelola')
exports.authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Akses ditolak" });
    }
    next();
  };

// Token opsional (untuk endpoint publik yang bisa dikenali usernya)
exports.optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    } catch (err) {
      // abaikan, lanjut sebagai tamu
    }
  }
  next();
};
