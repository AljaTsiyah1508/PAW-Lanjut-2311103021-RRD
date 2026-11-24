require("dotenv").config();
const db = require("../config/db");
const wd = require("../services/wikidata");

// Pemakaian:
//   node src/scripts/syncWikidata.js 5 beach         -> TES: 5 pantai saja (hanya dicetak, belum disimpan)
//   node src/scripts/syncWikidata.js 300 island save -> simpan pulau saja, 300 teratas
//   node src/scripts/syncWikidata.js                 -> semua jenis, 100 teratas per jenis (disimpan)
//   node src/scripts/syncWikidata.js 300             -> 300 teratas per jenis (masjid/gereja/klenteng tetap dibatasi "max")
//
// Hanya MENAMBAH destinasi baru. Destinasi yang sudah ada (external_id sama, atau nama sama)
// dilewati tanpa diubah, supaya hasil edit admin/pengelola tidak tertimpa.
const LIMIT = Number(process.argv[2]) || 100;
const ONLY = process.argv[3] || null;
const DRY = Boolean(ONLY) && process.argv[4] !== "save"; // jenis disebut tanpa "save" = hanya tes

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

(async () => {
  const types = wd.TYPES.filter((t) => !ONLY || t.key === ONLY);
  if (types.length === 0) {
    console.error(
      "Jenis tidak dikenal. Pilihan:",
      wd.TYPES.map((t) => t.key).join(", "),
    );
    process.exit(1);
  }

  const [cats] = await db.query("SELECT id, name FROM categories");
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  if (Object.keys(catId).length === 0) {
    console.error("Tabel categories kosong. Isi dulu kategorinya.");
    process.exit(1);
  }

  const [existing] = await db.query("SELECT name, external_id FROM destinations");
  const knownIds = new Set(existing.map((e) => e.external_id).filter(Boolean));
  const knownNames = new Set(existing.map((e) => e.name.toLowerCase()));

  const total = { added: 0, skipped: 0, failed: 0 };

  for (const type of types) {
    try {
      const all = await wd.fetchType(type.qid, Math.min(LIMIT, type.max || LIMIT));
      // Lewati yang sudah ada di database (tidak diubah sama sekali)
      const items = all.filter((it) => {
        const key = it.name.toLowerCase();
        const known = knownIds.has(`wd:${it.qid}`) || knownNames.has(key);
        if (known) total.skipped++;
        else knownNames.add(key); // cegah nama kembar antar-jenis
        return !known;
      });
      const extracts = await wd.fetchExtracts(
        items.filter((i) => i.title).map((i) => i.title),
      );

      for (const it of items) {
        const where = it.location || "Indonesia";
        const description =
          extracts[it.title] ||
          (it.desc
            ? `${it.name}: ${cap(it.desc)}${it.location ? `, ${it.location}` : ""}.`
            : `${it.name} adalah ${type.label.toLowerCase()} di ${where}.`);

        if (DRY) {
          console.log(
            `- ${it.name} | ${where} | foto: ${it.image ? "ada" : "TIDAK"} | ${description.slice(0, 70)}...`,
          );
          continue;
        }

        try {
          const [r] = await db.query(
            `INSERT INTO destinations
               (category_id, name, location, description, latitude, longitude,
                cover_image, highlights, popularity, external_id, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wikidata')`,
            [
              catId[type.category],
              it.name.slice(0, 150),
              where.slice(0, 150),
              description,
              it.lat,
              it.lon,
              it.image,
              type.label,
              it.sl,
              `wd:${it.qid}`,
            ],
          );
          if (r.affectedRows === 1) total.added++;
        } catch (err) {
          total.failed++;
          console.error(`  gagal simpan "${it.name}": ${err.message}`);
        }
      }
      console.log(`✔ ${type.label}: ${all.length} ditemukan, ${items.length} baru |`, total);
    } catch (err) {
      total.failed++;
      console.error(`✘ ${type.label}: ${err.message}`);
    }
    await sleep(1500); // jeda supaya sopan ke server Wikidata
  }

  console.log("\nSELESAI", DRY ? "(mode tes, tidak ada yang disimpan)" : total);
  await db.end();
})();
