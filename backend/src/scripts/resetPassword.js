// Reset password satu user dari terminal (untuk admin/pengembang).
// Pakai:  node src/scripts/resetPassword.js email@contoh.com
// Password baru diketik di terminal (tidak tampil) dan tidak disimpan di file mana pun.
const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

// Baca input tanpa menampilkan karakter yang diketik
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else if (!/[\r\n]/.test(s)) rl.output.write("*");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

(async () => {
  const email = String(process.argv[2] || "").trim();
  if (!email) {
    console.log("Pakai: node src/scripts/resetPassword.js email@contoh.com");
    process.exit(1);
  }

  const [rows] = await db.query(
    "SELECT id, name, role FROM users WHERE email = ?",
    [email],
  );
  if (rows.length === 0) {
    console.log("User dengan email itu tidak ditemukan.");
    process.exit(1);
  }
  const user = rows[0];
  console.log(`User: ${user.name} (role: ${user.role})`);

  const pw = await askHidden("Password baru (min. 8 karakter): ");
  if (pw.length < 8) {
    console.log("Password minimal 8 karakter. Dibatalkan.");
    process.exit(1);
  }
  const again = await askHidden("Ulangi password baru: ");
  if (pw !== again) {
    console.log("Password tidak sama. Dibatalkan.");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(pw, 10);
  await db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
  console.log("Password berhasil diganti. Silakan login dengan password baru.");
  process.exit(0);
})().catch((err) => {
  console.error("Gagal:", err.message);
  process.exit(1);
});
