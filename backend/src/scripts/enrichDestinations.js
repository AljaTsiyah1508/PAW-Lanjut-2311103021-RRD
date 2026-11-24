require("dotenv").config();
const db = require("../config/db");
const geo = require("../services/geocode");

// Melengkapi alamat, harga tiket, dan jam operasional destinasi dari sumber terbuka:
//   1) Wikidata: harga tiket (P2555) & jam buka (P3025) untuk destinasi sumber wikidata
//   2) OpenStreetMap (Nominatim): alamat lengkap + jam buka/biaya masuk bila tercatat di OSM
//
// Aturan:
//   - Hanya mengisi kolom yang MASIH KOSONG; data yang sudah ada tidak ditimpa.
//   - Destinasi yang punya pengelola (owner_id) dilewati: datanya dikelola pengelola.
//   - Data yang tidak ditemukan dibiarkan kosong (tidak dikarang).
//
// Pemakaian:
//   node src/scripts/enrichDestinations.js 20 tes   -> TES 20 destinasi, hanya dicetak
//   node src/scripts/enrichDestinations.js          -> semua (OSM ±1 detik per destinasi)
//   node src/scripts/enrichDestinations.js 0 wikidata -> hanya tahap Wikidata
// Aman dijalankan ulang: yang sudah terisi otomatis dilewati.
const MAX = Number(process.argv[2]) || 0;
const MODE = process.argv[3] || "";
const DRY = MODE === "tes";
const ONLY_WD = MODE === "wikidata";

const SPARQL = "https://query.wikidata.org/sparql";
const UA = geo.UA;
const RUPIAH = "http://www.wikidata.org/entity/Q41588";
const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const SHORT = { Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam", Jumat: "Jum", Sabtu: "Sab", Minggu: "Min" };

const empty = (v) => v === null || v === undefined || String(v).trim() === "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(SPARQL, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "query=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`Wikidata error ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(attempt * 10000);
    }
  }
}

// Ringkas hari berurutan: [Selasa..Minggu] -> "Sel–Min"
function dayRange(days) {
  const idx = [...new Set(days.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (idx.length === 7) return "Setiap hari";
  const parts = [];
  for (let i = 0; i < idx.length; i++) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    const a = SHORT[DAYS[idx[i]]];
    const b = SHORT[DAYS[idx[j]]];
    parts.push(i === j ? a : j === i + 1 ? `${a}, ${b}` : `${a}–${b}`);
    i = j;
  }
  return parts.join(", ");
}

// Jam buka OSM ("Tu-Su 08:00-16:00; Mo off") -> "Sel–Min 08.00–16.00"
const OSM_DAY = { Mo: "Sen", Tu: "Sel", We: "Rab", Th: "Kam", Fr: "Jum", Sa: "Sab", Su: "Min", PH: "hari libur" };
function osmHours(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (s === "24/7") return "Buka 24 jam";
  s = s
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => OSM_DAY[m])
    .replace(/(\d{1,2}):(\d{2})/g, "$1.$2")
    .replace(/(\d)\s*-\s*(\d)/g, "$1–$2")
    .replace(/([A-Za-z])-([A-Za-z])/g, "$1–$2")
    .replace(/\boff\b/g, "tutup")
    .replace(/\s*;\s*/g, "; ");
  return s.length <= 100 ? s : null;
}

// Biaya masuk OSM: fee=no -> 0; charge="Rp 10.000" / "10000 IDR" -> 10000
function osmPrice(t) {
  if (!t) return null;
  if (t.fee === "no") return 0;
  const m = String(t.charge || "").replace(/[.,](?=\d{3}\b)/g, "").match(/(\d{3,7})/);
  return m ? Number(m[1]) : null;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sameName = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x && y && (x.includes(y) || y.includes(x));
};

// ----------------------------------------------------------------
// Tahap 1: Wikidata (harga & jam buka), 100 destinasi per query
// ----------------------------------------------------------------
async function fromWikidata(rows, plan) {
  const wd = rows.filter((r) => r.external_id?.startsWith("wd:") && (empty(r.price) || empty(r.open_hours)));
  console.log(`Wikidata: memeriksa ${wd.length} destinasi...`);
  for (let i = 0; i < wd.length; i += 100) {
    const batch = wd.slice(i, i + 100);
    const byQ = Object.fromEntries(batch.map((r) => [r.external_id.slice(3), r]));
    const values = Object.keys(byQ).map((q) => `wd:${q}`).join(" ");

    const fees = await sparql(`
      SELECT ?i ?amt ?unit ?forLabel WHERE {
        VALUES ?i { ${values} }
        ?i p:P2555 ?st. ?st psv:P2555 [ wikibase:quantityAmount ?amt; wikibase:quantityUnit ?unit ].
        OPTIONAL { ?st pq:P518 ?for. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
      }`);
    const feeBy = {};
    fees.forEach((b) => {
      if (b.unit.value !== RUPIAH) return;
      const q = b.i.value.split("/").pop();
      (feeBy[q] ||= []).push({ amt: Math.round(Number(b.amt.value)), for: (b.forLabel?.value || "").toLowerCase() });
    });

    const hours = await sparql(`
      SELECT ?i ?dayLabel ?openLabel ?closeLabel WHERE {
        VALUES ?i { ${values} }
        ?i p:P3025 ?st. ?st ps:P3025 ?day.
        OPTIONAL { ?st pq:P8626 ?open. } OPTIONAL { ?st pq:P8627 ?close. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
      }`);
    const hourBy = {};
    hours.forEach((b) => {
      const q = b.i.value.split("/").pop();
      const o = b.openLabel?.value;
      const c = b.closeLabel?.value;
      if (!o || !c || /^Q\d+$/.test(o) || /^Q\d+$/.test(c)) return;
      const slot = `${o.replace(":", ".")}–${c.replace(":", ".")}`;
      ((hourBy[q] ||= {})[slot] ||= []).push(b.dayLabel?.value);
    });

    for (const [q, r] of Object.entries(byQ)) {
      const p = (plan[r.id] ||= {});
      if (empty(r.price) && feeBy[q]) {
        // Utamakan tarif dewasa/umum; bila tidak ada keterangan, ambil yang terendah
        const list = feeBy[q];
        const adult = list.find((f) => /dewasa|adult|umum|domestik|lokal/.test(f.for));
        p.price = (adult || list.reduce((a, b) => (b.amt < a.amt ? b : a))).amt;
        p.src = [...(p.src || []), "wikidata"];
      }
      if (empty(r.open_hours) && hourBy[q]) {
        const txt = Object.entries(hourBy[q])
          .map(([slot, days]) => `${dayRange(days)} ${slot}`)
          .join("; ");
        if (txt.length <= 100) {
          p.open_hours = txt;
          p.src = [...new Set([...(p.src || []), "wikidata"])];
        }
      }
    }
    process.stdout.write(`  ${Math.min(i + 100, wd.length)}/${wd.length}\r`);
    await sleep(1000);
  }
  console.log("");
}

// ----------------------------------------------------------------
// Tahap 2: OpenStreetMap / Nominatim (alamat + jam/biaya bila ada), 1 request/detik
// ----------------------------------------------------------------
async function nominatim(path, params) {
  const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
  Object.entries({ format: "jsonv2", addressdetails: "1", extratags: "1", namedetails: "1", "accept-language": "id", ...params })
    .forEach(([k, v]) => url.searchParams.set(k, v));
  return geo.throttled(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return res.json();
  });
}

async function fromOsm(rows, plan) {
  const todo = rows.filter((r) => empty(r.address) || empty(r.open_hours) || empty(r.price));
  console.log(`OpenStreetMap: ${todo.length} destinasi (perkiraan ${Math.ceil((todo.length * 1.2) / 60)} menit)...`);
  let n = 0;
  for (const r of todo) {
    n++;
    const p = (plan[r.id] ||= {});
    try {
      let hit = null;
      if (r.latitude !== null && r.longitude !== null) {
        // Cari nama tempat di sekitar koordinatnya (±5 km); bila tidak ada, pakai alamat titik koordinat
        const lat = Number(r.latitude);
        const lon = Number(r.longitude);
        const found = await nominatim("search", {
          q: r.name,
          countrycodes: "id",
          limit: "1",
          bounded: "1",
          viewbox: `${lon - 0.05},${lat + 0.05},${lon + 0.05},${lat - 0.05}`,
        });
        hit = found[0] && sameName(found[0].name || found[0].namedetails?.name, r.name) ? found[0] : null;
        // Pulau: titik tengahnya jatuh di desa acak, jadi alamat titik tidak dipakai
        if (!hit && empty(r.address) && r.highlights !== "Pulau") {
          const rev = await nominatim("reverse", { lat: String(lat), lon: String(lon), zoom: "16" });
          if (rev && !rev.error) p.address = geo.toItem(rev).address;
        }
      } else {
        const found = await nominatim("search", { q: `${r.name} ${r.location === "Indonesia" ? "" : r.location}`.trim(), countrycodes: "id", limit: "1" });
        hit = found[0] && sameName(found[0].name || found[0].namedetails?.name, r.name) ? found[0] : null;
        if (hit) {
          p.latitude = Number(Number(hit.lat).toFixed(7));
          p.longitude = Number(Number(hit.lon).toFixed(7));
        }
      }

      if (hit) {
        const item = geo.toItem(hit);
        if (empty(r.address)) p.address = item.address;
        if (r.location === "Indonesia" && item.location !== "Indonesia") p.location = item.location;
        const t = hit.extratags || {};
        if (empty(r.open_hours) && empty(p.open_hours)) {
          const h = osmHours(t.opening_hours);
          if (h) p.open_hours = h;
        }
        if (empty(r.price) && p.price === undefined) {
          const pr = osmPrice(t);
          if (pr !== null) p.price = pr;
        }
      }
      if (p.address || p.open_hours || p.price !== undefined) p.src = [...new Set([...(p.src || []), "osm"])];
    } catch (err) {
      console.error(`  ✘ ${r.name}: ${err.message}`);
    }
    if (n % 25 === 0) console.log(`  ${n}/${todo.length}`);
    if (!DRY && Object.keys(p).some((k) => k !== "src")) await save(r.id, p); // simpan bertahap agar aman bila terhenti
  }
}

const COLS = ["address", "open_hours", "price", "latitude", "longitude", "location"];

// Simpan hanya kolom yang direncanakan dan MASIH kosong di database (dicek ulang di WHERE)
async function save(id, p) {
  for (const col of COLS) {
    if (p[col] === undefined || p[col] === null || p[col] === "") continue;
    const cond = col === "location" ? "location = 'Indonesia'" : `(${col} IS NULL${col === "price" || col === "latitude" || col === "longitude" ? "" : ` OR ${col} = ''`})`;
    await db.query(
      `UPDATE destinations SET ${col} = ? WHERE id = ? AND owner_id IS NULL AND ${cond}`,
      [typeof p[col] === "string" ? p[col].slice(0, col === "address" ? 255 : col === "location" ? 150 : 100) : p[col], id],
    );
  }
  p.saved = true;
}

(async () => {
  const [hasAddr] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'address'`,
  );
  if (!hasAddr.length) {
    console.error("Kolom address belum ada. Jalankan backend/sql/address.sql dulu.");
    process.exit(1);
  }

  let [rows] = await db.query(
    `SELECT id, name, location, address, open_hours, price, latitude, longitude, external_id, highlights
     FROM destinations
     WHERE owner_id IS NULL AND (address IS NULL OR address = '' OR open_hours IS NULL OR open_hours = '' OR price IS NULL)
     ORDER BY popularity DESC, id`,
  );
  if (MAX) rows = rows.slice(0, MAX);
  console.log(`${rows.length} destinasi perlu dilengkapi${DRY ? " (MODE TES, tidak disimpan)" : ""}\n`);

  const plan = {};
  await fromWikidata(rows, plan);
  if (!DRY) for (const [id, p] of Object.entries(plan)) if (Object.keys(p).some((k) => k !== "src")) await save(Number(id), p);

  if (!ONLY_WD) {
    // Data Wikidata yang baru tersimpan ikut dihitung supaya OSM tidak menimpa
    rows = rows.map((r) => ({ ...r, ...Object.fromEntries(Object.entries(plan[r.id] || {}).filter(([k]) => COLS.includes(k))) }));
    await fromOsm(rows, plan);
  }

  const vals = Object.values(plan);
  const count = (k) => vals.filter((p) => p[k] !== undefined && p[k] !== null && p[k] !== "").length;
  if (DRY) {
    rows.forEach((r) => {
      const p = plan[r.id] || {};
      console.log(`- ${r.name} | alamat: ${p.address || "-"} | jam: ${p.open_hours || "-"} | harga: ${p.price ?? "-"} | ${(p.src || []).join("+")}`);
    });
  }
  console.log(`\nSELESAI${DRY ? " (tes)" : ""}: alamat ${count("address")}, jam buka ${count("open_hours")}, harga ${count("price")}, koordinat baru ${count("latitude")}`);
  await db.end();
})();
