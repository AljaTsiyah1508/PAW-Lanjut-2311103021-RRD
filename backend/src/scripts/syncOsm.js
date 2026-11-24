require("dotenv").config();
const db = require("../config/db");

const UA = "NusantaraReview/1.0 (proyek open source)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const PROVINCES = [
  { iso: "ID-AC", name: "Aceh" },
  { iso: "ID-SU", name: "Sumatera Utara" },
  { iso: "ID-SB", name: "Sumatera Barat" },
  { iso: "ID-RI", name: "Riau" },
  { iso: "ID-KR", name: "Kepulauan Riau" },
  { iso: "ID-JA", name: "Jambi" },
  { iso: "ID-SS", name: "Sumatera Selatan" },
  { iso: "ID-BB", name: "Bangka Belitung" },
  { iso: "ID-BE", name: "Bengkulu" },
  { iso: "ID-LA", name: "Lampung" },
  { iso: "ID-BT", name: "Banten" },
  { iso: "ID-JK", name: "DKI Jakarta" },
  { iso: "ID-JB", name: "Jawa Barat" },
  { iso: "ID-JT", name: "Jawa Tengah" },
  { iso: "ID-YO", name: "DI Yogyakarta" },
  { iso: "ID-JI", name: "Jawa Timur" },
  { iso: "ID-BA", name: "Bali" },
  { iso: "ID-NB", name: "Nusa Tenggara Barat" },
  { iso: "ID-NT", name: "Nusa Tenggara Timur" },
  { iso: "ID-KB", name: "Kalimantan Barat" },
  { iso: "ID-KT", name: "Kalimantan Tengah" },
  { iso: "ID-KS", name: "Kalimantan Selatan" },
  { iso: "ID-KI", name: "Kalimantan Timur" },
  { iso: "ID-KU", name: "Kalimantan Utara" },
  { iso: "ID-SA", name: "Sulawesi Utara" },
  { iso: "ID-GO", name: "Gorontalo" },
  { iso: "ID-ST", name: "Sulawesi Tengah" },
  { iso: "ID-SR", name: "Sulawesi Barat" },
  { iso: "ID-SN", name: "Sulawesi Selatan" },
  { iso: "ID-SG", name: "Sulawesi Tenggara" },
  { iso: "ID-MA", name: "Maluku" },
  { iso: "ID-MU", name: "Maluku Utara" },
  { iso: "ID-PA", name: "Papua" },
  { iso: "ID-PB", name: "Papua Barat" },
  { iso: "ID-PS", name: "Papua Selatan" },
  { iso: "ID-PE", name: "Papua Pegunungan" },
  { iso: "ID-PT", name: "Papua Tengah" },
  { iso: "ID-PD", name: "Papua Barat Daya" },
];

// Pemakaian:
//   node src/scripts/syncOsm.js 20 BA          -> TES Bali, 20 hasil, hanya dicetak
//   node src/scripts/syncOsm.js 150 BA save    -> simpan Bali saja
//   node src/scripts/syncOsm.js 150            -> semua provinsi, 150 per provinsi, disimpan
const PER = Number(process.argv[2]) || 150;
const ONLY = process.argv[3] ? process.argv[3].toUpperCase() : null;
const SAVE = !ONLY || process.argv[4] === "save";
const ONLY_ISO = ONLY ? (ONLY.startsWith("ID-") ? ONLY : `ID-${ONLY}`) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const buildQuery = (iso, fetchLimit) => `
[out:json][timeout:60];
area["ISO3166-2"="${iso}"]->.a;
(
  nwr["natural"~"^(beach|volcano|hot_spring|cave_entrance)$"]["name"](area.a);
  nwr["waterway"="waterfall"]["name"](area.a);
  nwr["tourism"~"^(attraction|viewpoint|museum|theme_park|zoo|camp_site)$"]["name"](area.a);
  nwr["leisure"="water_park"]["name"](area.a);
  nwr["historic"~"^(archaeological_site|castle|monument|temple)$"]["name"](area.a);
  nwr["boundary"="national_park"]["name"](area.a);
);
out center ${fetchLimit};`;

async function overpass(query) {
  const waits = [0, 15000, 45000, 90000]; // jeda sebelum tiap percobaan
  let lastErr;
  for (const wait of waits) {
    if (wait) {
      console.log(
        `  server sibuk, tunggu ${wait / 1000} detik lalu coba lagi...`,
      );
      await sleep(wait);
    }
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
          },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.trim().startsWith("{"))
          throw new Error("respons bukan JSON (server penuh)");
        const json = JSON.parse(text);
        if (json.remark)
          console.error(`  catatan server: ${json.remark.slice(0, 120)}`);
        if (json.remark && /error|timed out|out of memory/i.test(json.remark)) {
          throw new Error(
            "server gagal memproses: " + json.remark.slice(0, 60),
          );
        }
        return json.elements || [];
      } catch (e) {
        const reason = e.cause?.code || e.cause?.message || e.message;
        console.error(`  ${new URL(ep).host} gagal: ${reason}`);
        lastErr = new Error(reason);
      }
    }
  }
  throw lastErr;
}

// [kategori di database, label jenis]
function classify(t, name) {
  if (t.natural === "beach") return ["Pantai", "Pantai"];
  if (t.natural === "volcano") return ["Gunung", "Gunung berapi"];
  if (t.natural === "hot_spring") return ["Wisata Alam", "Pemandian air panas"];
  if (t.natural === "cave_entrance") return ["Wisata Alam", "Gua"];
  if (t.waterway === "waterfall") return ["Wisata Alam", "Air terjun"];
  if (t.boundary === "national_park") return ["Wisata Alam", "Taman nasional"];
  if (t.tourism === "viewpoint") return ["Wisata Alam", "Spot pemandangan"];
  if (t.tourism === "camp_site") return ["Wisata Alam", "Area camping"];
  if (t.tourism === "museum") return ["Wisata Budaya", "Museum"];
  if (t.tourism === "theme_park") return ["Taman Hiburan", "Taman hiburan"];
  if (t.tourism === "zoo") return ["Taman Hiburan", "Kebun binatang"];
  if (t.leisure === "water_park") return ["Taman Hiburan", "Waterpark"];
  if (t.historic) return ["Wisata Budaya", "Situs bersejarah"];
  if (t.amenity === "place_of_worship")
    return ["Wisata Religi", "Tempat ibadah"];
  if (t.tourism === "attraction") {
    if (/pantai|pulau|teluk/i.test(name)) return ["Pantai", "Objek wisata"];
    if (/gunung|bukit|kawah/i.test(name)) return ["Gunung", "Objek wisata"];
    if (/candi|keraton|istana|benteng|museum|monumen|tugu/i.test(name))
      return ["Wisata Budaya", "Objek wisata"];
    return ["Wisata Alam", "Objek wisata"];
  }
  return [null, null];
}

const score = (t) =>
  (t.wikidata ? 50 : 0) +
  (t.wikipedia ? 30 : 0) +
  (t.wikimedia_commons ? 15 : 0) +
  (t.website ? 5 : 0) +
  (t.opening_hours ? 3 : 0) +
  (t.description || t["description:id"] ? 3 : 0);

const commonsUrl = (v) =>
  v && v.startsWith("File:")
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(v.slice(5))}?width=800`
    : null;

(async () => {
  const provinces = PROVINCES.filter((p) => !ONLY_ISO || p.iso === ONLY_ISO);
  if (provinces.length === 0) {
    console.error("Kode provinsi tidak dikenal. Contoh: BA, JB, JT, JI, SN");
    process.exit(1);
  }

  const [cats] = await db.query("SELECT id, name FROM categories");
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  if (Object.keys(catId).length === 0) {
    console.error("Tabel categories kosong.");
    process.exit(1);
  }

  // Data dari sumber lain, dipakai untuk mencegah dobel
  const [existing] = await db.query(
    "SELECT name, external_id FROM destinations WHERE source <> 'osm'",
  );
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));
  const existingQids = new Set(
    existing
      .filter((e) => e.external_id?.startsWith("wd:"))
      .map((e) => e.external_id.slice(3)),
  );

  const total = { added: 0, updated: 0, skipped: 0, failed: 0 };

  for (const prov of provinces) {
    let elements;
    try {
      const fetchLimit = Math.min(Math.max(PER * 3, 300), 800);
      elements = await overpass(buildQuery(prov.iso, fetchLimit));
    } catch (err) {
      total.failed++;
      console.error(`✘ ${prov.name}: ${err.message}`);
      await sleep(8000);
      continue;
    }

    const cands = [];
    for (const el of elements) {
      const t = el.tags || {};
      const name = (t["name:id"] || t.name || "").trim();
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (name.length < 3 || lat == null || lon == null) continue;

      const [category, label] = classify(t, name);
      if (!category) continue;

      const city = t["addr:city"] || t["addr:county"] || t["addr:district"];
      cands.push({
        extId: `osm:${el.type}/${el.id}`,
        qid: t.wikidata || null,
        name,
        label,
        category,
        lat,
        lon,
        location: city ? `${city}, ${prov.name}` : prov.name,
        description:
          t["description:id"] ||
          t.description ||
          `${name} adalah ${label.toLowerCase()} di ${prov.name}.`,
        image: commonsUrl(t.wikimedia_commons),
        openHours: t.opening_hours ? t.opening_hours.slice(0, 100) : null,
        price: t.fee === "no" ? 0 : null,
        score: score(t),
      });
    }

    // Urut paling "dikenal", buang nama kembar dan yang sudah ada di sumber lain
    cands.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const list = [];
    for (const c of cands) {
      const key = c.name.toLowerCase();
      if (
        seen.has(key) ||
        existingNames.has(key) ||
        (c.qid && existingQids.has(c.qid))
      ) {
        total.skipped++;
        continue;
      }
      seen.add(key);
      list.push(c);
      if (list.length >= PER) break;
    }

    for (const c of list) {
      if (!SAVE) {
        console.log(
          `- ${c.name} | ${c.label} | ${prov.name} | skor ${c.score} | foto: ${c.image ? "ada" : "-"}`,
        );
        continue;
      }
      try {
        const [r] = await db.query(
          `INSERT INTO destinations
             (category_id, name, location, description, latitude, longitude,
              cover_image, highlights, open_hours, price, popularity, external_id, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'osm')
           ON DUPLICATE KEY UPDATE
             category_id = VALUES(category_id), name = VALUES(name), location = VALUES(location),
             description = VALUES(description), latitude = VALUES(latitude),
             longitude = VALUES(longitude), cover_image = VALUES(cover_image),
             highlights = VALUES(highlights), open_hours = VALUES(open_hours),
             price = VALUES(price), popularity = VALUES(popularity)`,
          [
            catId[c.category],
            c.name.slice(0, 150),
            c.location.slice(0, 150),
            c.description,
            c.lat,
            c.lon,
            c.image,
            c.label,
            c.openHours,
            c.price,
            c.score,
            c.extId,
          ],
        );
        if (r.affectedRows === 1) total.added++;
        else total.updated++;
      } catch (err) {
        total.failed++;
        console.error(`  gagal simpan "${c.name}": ${err.message}`);
      }
    }

    console.log(
      `✔ ${prov.name}: ${elements.length} titik ditemukan, ${list.length} dipakai |`,
      total,
    );
    await sleep(6000); // jeda sopan untuk server Overpass publik
  }

  console.log(
    "\nSELESAI",
    SAVE ? total : "(mode tes, tidak ada yang disimpan)",
  );
  await db.end();
})();
