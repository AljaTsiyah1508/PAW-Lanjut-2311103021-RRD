const SPARQL = 'https://query.wikidata.org/sparql';
const WIKI_API = 'https://id.wikipedia.org/w/api.php';
const UA = 'NusantaraReview/1.0 (proyek open source)';

// Jenis tempat (ID Wikidata) -> kategori di database kita
// max: batas khusus per jenis (tempat ibadah dibatasi ke yang paling terkenal saja)
exports.TYPES = [
  { key: 'beach',     qid: 'Q40080',  label: 'Pantai',               category: 'Pantai' },
  { key: 'volcano',   qid: 'Q8072',   label: 'Gunung berapi',        category: 'Gunung' },
  { key: 'mountain',  qid: 'Q8502',   label: 'Gunung',               category: 'Gunung' },
  { key: 'hill',      qid: 'Q54050',  label: 'Bukit',                category: 'Gunung' },
  { key: 'waterfall', qid: 'Q34038',  label: 'Air terjun',           category: 'Wisata Alam' },
  { key: 'lake',      qid: 'Q23397',  label: 'Danau',                category: 'Wisata Alam' },
  { key: 'park',      qid: 'Q46169',  label: 'Taman nasional',       category: 'Wisata Alam' },
  { key: 'cave',      qid: 'Q35509',  label: 'Gua',                  category: 'Wisata Alam' },
  { key: 'hotspring', qid: 'Q177380', label: 'Pemandian air panas',  category: 'Wisata Alam' },
  { key: 'hindu',     qid: 'Q842402', label: 'Candi / Pura',         category: 'Wisata Budaya' },
  { key: 'buddhist',  qid: 'Q160742', label: 'Candi / Vihara',       category: 'Wisata Budaya' },
  { key: 'museum',    qid: 'Q33506',  label: 'Museum',               category: 'Wisata Budaya' },
  { key: 'palace',    qid: 'Q16560',  label: 'Istana / Keraton',     category: 'Wisata Budaya' },
  { key: 'archaeo',   qid: 'Q839954', label: 'Situs arkeologi',      category: 'Wisata Budaya' },
  { key: 'fort',      qid: 'Q57821',  label: 'Benteng',              category: 'Wisata Budaya' },
  { key: 'mosque',    qid: 'Q32815',  label: 'Masjid',               category: 'Wisata Religi', max: 120 },
  { key: 'church',    qid: 'Q16970',  label: 'Gereja',               category: 'Wisata Religi', max: 60 },
  { key: 'chinese',   qid: 'Q44539',  label: 'Klenteng / Kuil',      category: 'Wisata Religi', max: 30 },
  { key: 'amusement', qid: 'Q194195', label: 'Taman hiburan',        category: 'Taman Hiburan' },
  { key: 'zoo',       qid: 'Q43501',  label: 'Kebun binatang',       category: 'Taman Hiburan' },
];

const isQid = (s) => !s || /^Q\d+$/.test(s);

// Jalankan query SPARQL; coba ulang bila server Wikidata sibuk / timeout (jeda 10 dtk, lalu 20 dtk)
async function sparql(query) {
  const url = new URL(SPARQL);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`Wikidata error ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 10000));
    }
  }
}

// Ambil tempat di Indonesia dengan jenis tertentu, yang punya foto, urut paling terkenal.
// Dua tahap supaya tidak timeout: (1) daftar ID teratas, (2) detail per 50 ID.
exports.fetchType = async (qid, limit = 100) => {
  const top = await sparql(`
    SELECT ?item ?sl WHERE {
      ?item wdt:P31 wd:${qid}; wdt:P17 wd:Q252; wikibase:sitelinks ?sl.
      FILTER EXISTS { ?item wdt:P18 [] }
    }
    ORDER BY DESC(?sl) LIMIT ${Number(limit)}`);
  const rank = new Map();
  top.forEach((b) => {
    const id = b.item.value.split('/').pop();
    if (!rank.has(id)) rank.set(id, Number(b.sl.value) || 0);
  });
  const ids = [...rank.keys()];

  const seen = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await sparql(`
      SELECT ?item ?itemLabel ?desc ?image ?coord ?locLabel ?article WHERE {
        VALUES ?item { ${ids.slice(i, i + 50).map((id) => `wd:${id}`).join(' ')} }
        ?item wdt:P18 ?image.
        OPTIONAL { ?item wdt:P625 ?coord. }
        OPTIONAL { ?item wdt:P131 ?loc. }
        OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://id.wikipedia.org/>. }
        OPTIONAL { ?item schema:description ?desc. FILTER(LANG(?desc) = "id") }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
      }`);

    for (const b of rows) {
      const id = b.item.value.split('/').pop();
      const name = b.itemLabel?.value;
      if (seen.has(id) || isQid(name)) continue; // baris pertama per tempat; lewati yang tanpa nama

      const m = b.coord?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      let title = null;
      if (b.article) {
        try { title = decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' '); }
        catch { title = null; }
      }

      seen.set(id, {
        qid: id,
        sl: rank.get(id) || 0,
        name,
        desc: b.desc?.value || null,
        image: b.image.value.replace('http://', 'https://') + '?width=800',
        lon: m ? Number(m[1]) : null,
        lat: m ? Number(m[2]) : null,
        location: isQid(b.locLabel?.value) ? null : b.locLabel.value,
        title,
      });
    }
  }
  return [...seen.values()].sort((a, b) => b.sl - a.sl);
};

// Ringkasan artikel Wikipedia Indonesia (per 20 judul)
exports.fetchExtracts = async (titles) => {
  const out = {};
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const url = new URL(WIKI_API);
    Object.entries({
      action: 'query', format: 'json', formatversion: '2', prop: 'extracts',
      exintro: '1', explaintext: '1', exsentences: '3', exlimit: 'max',
      redirects: '1', titles: batch.join('|'),
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) continue;
    const q = (await res.json()).query || {};
    const byTitle = Object.fromEntries((q.pages || []).filter((p) => p.extract).map((p) => [p.title, p.extract]));

    for (const t of batch) {
      const n = q.normalized?.find((x) => x.from === t)?.to || t;
      const r = q.redirects?.find((x) => x.from === n)?.to || n;
      if (byTitle[r]) out[t] = byTitle[r];
    }
  }
  return out;
};
