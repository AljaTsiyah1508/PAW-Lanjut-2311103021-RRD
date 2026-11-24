// Pencarian alamat & koordinat lewat Nominatim (OpenStreetMap), gratis tanpa API key.
// Aturan pemakaian Nominatim: maks. 1 request/detik dan User-Agent yang jelas,
// jadi semua permintaan diantrikan di sini dan hasilnya di-cache sebentar.
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const UA = "NusantaraReview/1.0 (tugas kuliah)";
const GAP_MS = 1100;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // q -> { at, items }

let queue = Promise.resolve();
let lastCall = 0;

// Jalankan fn satu per satu dengan jeda minimal GAP_MS antar-request
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

const pick = (a, keys) => keys.map((k) => a[k]).find(Boolean) || null;

// Ubah satu hasil Nominatim (search/reverse) jadi bentuk yang dipakai form destinasi
function toItem(r) {
  const a = r.address || {};
  // Nomor rumah di data OSM kadang sudah berawalan "No." atau berakhiran koma
  const num = String(a.house_number || "").replace(/^no\.?\s*/i, "").replace(/[,\s]+$/, "");
  const road = [a.road, num && `No.${num}`].filter(Boolean).join(" ");
  const city = pick(a, ["city", "town", "regency", "county", "municipality", "village"]);
  const area = pick(a, ["city_district", "district", "subdistrict", "suburb", "quarter", "town", "village", "hamlet"]);
  const province = pick(a, ["state", "province"]);
  const parts = [road, area !== city ? area : null, city, province].filter(Boolean);
  return {
    name: r.name || r.display_name.split(",")[0],
    label: r.display_name,
    address: parts.join(", ") || r.display_name,
    location: city || province || "Indonesia", // lokasi singkat untuk kartu
    latitude: Number(Number(r.lat).toFixed(7)),
    longitude: Number(Number(r.lon).toFixed(7)),
    type: r.type || null,
  };
}

// Cari tempat di Indonesia berdasarkan teks (nama tempat atau alamat)
exports.search = async (q) => {
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const url = new URL(ENDPOINT);
  Object.entries({
    q,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "id",
    limit: "6",
    "accept-language": "id",
  }).forEach(([k, v]) => url.searchParams.set(k, v));

  const rows = await throttled(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw Object.assign(new Error("Layanan peta sedang sibuk, coba lagi sebentar"), { status: 502 });
    return res.json();
  });

  const items = rows.map(toItem);
  cache.set(key, { at: Date.now(), items });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return items;
};

exports.toItem = toItem;
exports.throttled = throttled;
exports.UA = UA;
