import { Link } from 'react-router-dom';
import { Star, CalendarDays, Ticket, Sparkles } from 'lucide-react';
import { imgUrl } from '../../utils/helpers';
import { priceInfo, priceChip } from '../../utils/estimates';

const cut = (s = '', n = 130) => (s.length > n ? s.slice(0, n).trim() + '…' : s);

export default function DestinationCard({ item }) {
  const cover = imgUrl(item.cover_image);

  return (
    <article className="dest-card">
      <div
        className="dest-cover"
        style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
      >
        <span className="badge-match">Kecocokan {item.match}%</span>
        <span className="badge-rating">
          <Star size={12} fill="currentColor" />
          {item.rating_count > 0 ? ` ${item.avg_rating} (${item.rating_count} rating)` : ' Belum ada rating'}
        </span>
      </div>

      <div className="dest-body">
        <small className="dest-label">{item.category} • {item.location}</small>
        <h3>{item.name}</h3>

        <div className="chip-row">
          {item.best_time && <span className="chip"><CalendarDays size={13} /> Waktu: {item.best_time}</span>}
          <span className="chip" title={priceInfo(item).estimate ? 'Perkiraan berdasarkan tempat sejenis' : undefined}>
            <Ticket size={13} /> Tiket: {priceChip(item)}
          </span>
        </div>
        {item.highlights && (
          <div className="chip full"><Sparkles size={13} /> Jenis: {item.highlights}</div>
        )}

        {item.quote ? (
          <blockquote className="dest-quote">
            “{cut(item.quote.content, 90)}”
            <cite>— {item.quote.user_name}</cite>
          </blockquote>
        ) : (
          item.description && <p className="dest-desc">{cut(item.description)}</p>
        )}

        <Link to={`/destinasi/${item.id}`} className="btn-explore">Eksplor Sekarang</Link>
      </div>
    </article>
  );
}