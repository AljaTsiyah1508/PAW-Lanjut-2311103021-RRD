// Pencarian lokasi untuk form destinasi (dipakai admin dan pengelola).
const geocode = require("../../services/geocode");

// GET /api/admin/geocode?q=  dan  GET /api/manage/geocode?q=
exports.searchPlace = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 3 || q.length > 150)
      return res.status(400).json({ message: "Kata kunci lokasi 3 sampai 150 karakter" });
    const items = await geocode.search(q);
    res.json({ items });
  } catch (err) {
    const status = err.status || (err.name === "TimeoutError" ? 504 : 502);
    res.status(status).json({
      message: err.status ? err.message : "Layanan peta tidak bisa dihubungi, coba lagi sebentar",
    });
  }
};
