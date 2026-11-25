const os = require("os");
const path = require("path");

// Folder foto unggahan. Di Vercel disk proyek hanya bisa dibaca, jadi dipakai folder
// sementara: foto di sana TIDAK permanen. Di laptop tetap backend/uploads.
module.exports = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads")
  : path.join(__dirname, "../../uploads");
