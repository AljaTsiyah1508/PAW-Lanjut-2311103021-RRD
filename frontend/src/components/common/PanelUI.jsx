// Komponen kecil yang dipakai bersama halaman panel admin & pengelola.
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fmtNum as fmt } from '../../utils/helpers';


// Kepala halaman: eyebrow kecil + judul besar + deskripsi + tombol aksi (sesuai desain)
export function PageHead({ eyebrow, icon: Icon, title, desc, children }) {
  return (
    <header className="ad-head">
      <div>
        {eyebrow && (
          <span className="ad-eyebrow">{Icon ? <Icon size={13} /> : <i className="ad-dot" />} {eyebrow}</span>
        )}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="ad-head-actions">{children}</div>}
    </header>
  );
}

// Tren persen dibanding periode sebelumnya. value null = belum ada pembanding.
export function Trend({ value }) {
  if (value === null || value === undefined) return <span className="ad-trend new">baru</span>;
  if (value === 0) return <span className="ad-trend flat"><Minus size={12} /> 0%</span>;
  const up = value > 0;
  return (
    <span className={`ad-trend ${up ? 'up' : 'down'}`} aria-label={`${up ? 'naik' : 'turun'} ${Math.abs(value)} persen`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {up ? '+' : ''}{value.toLocaleString('id-ID')}%
    </span>
  );
}

// Kartu statistik: label + ikon di kanan atas + angka besar + keterangan
export function StatCard({ icon: Icon, label, value, unit, trend, tone, children }) {
  return (
    <div className={`ad-stat${tone ? ` ${tone}` : ''}`}>
      <span className="ad-stat-icon"><Icon size={19} /></span>
      <div>
        <span className="ad-stat-label">{label}</span>
        <strong className="ad-stat-value">
          {value}
          {unit && <small className="ad-stat-unit"> {unit}</small>}
          {trend !== undefined && <Trend value={trend} />}
        </strong>
        {children && <span className="ad-stat-sub">{children}</span>}
      </div>
    </div>
  );
}

// Tab pil dengan jumlah. tabs: [{ key, label, count }]
export function PillTabs({ tabs, value, onChange, label }) {
  return (
    <div className="ad-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          className={`ad-tab${value === t.key ? ' on' : ''}${t.alert ? ' alert' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && <b className="ad-tab-count">{fmt(t.count)}</b>}
        </button>
      ))}
    </div>
  );
}
