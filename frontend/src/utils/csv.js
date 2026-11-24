// Ekspor tabel ke CSV di browser (tanpa library). Pemisah ";" + BOM agar terbaca rapi di Excel Indonesia.
const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => cell(c.label)).join(';'),
    ...rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(';')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Ambil semua halaman dari endpoint berpaginasi (maks. maxRows baris) untuk diekspor
export async function fetchAllPages(fetchPage, maxRows = 2000) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await fetchPage(page);
    all.push(...data.items);
    totalPages = data.totalPages;
    page += 1;
  } while (page <= totalPages && all.length < maxRows);
  return all.slice(0, maxRows);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
