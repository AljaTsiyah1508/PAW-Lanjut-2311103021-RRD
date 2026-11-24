import { ChevronLeft, ChevronRight } from 'lucide-react';

// Nomor halaman yang ditampilkan: 1 … (sekitar halaman aktif) … terakhir
function pageList(page, total) {
  const set = new Set([1, total, page - 1, page, page + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push('…' + p);
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, totalPages, total, onChange, disabled }) {
  if (!total) return null;
  return (
    <nav className="ad-pager" aria-label="Halaman">
      <span className="ad-pager-info">
        Halaman {page} dari {totalPages} · {total.toLocaleString('id-ID')} data
      </span>
      {totalPages > 1 && (
        <div className="ad-pager-btns">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft size={15} />
          </button>
          {pageList(page, totalPages).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="ad-pager-gap">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={p === page ? 'active' : ''}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onChange(p)}
                disabled={disabled}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={disabled || page >= totalPages}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </nav>
  );
}
