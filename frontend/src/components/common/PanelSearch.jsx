import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';

// Pencarian cepat di top bar panel. sources: [{ label, search(q) => Promise<[{ key, title, sub, to }]> }]
export default function PanelSearch({ sources, placeholder }) {
  const navigate = useNavigate();
  const boxRef = useRef(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ q: null, groups: [] });
  const term = q.trim();
  const searching = term.length >= 2 && found.q !== term;

  useEffect(() => {
    if (term.length < 2) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      Promise.all(
        sources.map((s) =>
          s
            .search(term)
            .then((items) => ({ label: s.label, items }))
            .catch(() => ({ label: s.label, items: [] })),
        ),
      ).then((groups) => alive && setFound({ q: term, groups }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, sources]);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (to) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };

  const groups = found.groups.filter((g) => g.items.length > 0);
  const first = groups[0]?.items[0];

  return (
    <div className="ad-qs" ref={boxRef}>
      <label className="ad-qs-input">
        <Search size={16} />
        <input
          type="search"
          value={q}
          placeholder={placeholder}
          aria-label="Pencarian cepat"
          aria-expanded={open && term.length >= 2}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && first) go(first.to);
          }}
        />
        {searching && <Loader2 size={15} className="ad-spin" />}
      </label>

      {open && term.length >= 2 && !searching && (
        <div className="ad-qs-panel" role="listbox">
          {groups.length === 0 ? (
            <p className="ad-qs-empty">Tidak ada hasil untuk "{term}"</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="ad-qs-group">
                <span className="ad-qs-label">{g.label}</span>
                {g.items.map((it) => (
                  <button key={it.key} type="button" role="option" aria-selected="false" onClick={() => go(it.to)}>
                    <strong>{it.title}</strong>
                    {it.sub && <small>{it.sub}</small>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
