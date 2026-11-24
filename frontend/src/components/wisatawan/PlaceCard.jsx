import { Link } from 'react-router-dom';
import { Star, MapPin, Ticket, Sparkles } from 'lucide-react';
import { imgUrl } from '../../utils/helpers';
import { priceInfo, priceChip } from '../../utils/estimates';

export default function PlaceCard({ item }) {
  const cover = imgUrl(item.cover_image);
  const filled = Math.round(item.avg_rating);

  return (
    <Link to={`/destinasi/${item.id}`} className="place-card">
      <div className="place-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <span className="badge-match">{item.category}</span>
      </div>

      <div className="place-body">
        <h3>{item.name}</h3>
        <small className="place-loc"><MapPin size={12} /> {item.location}</small>

        <div className="place-chips">
          {item.highlights && <span className="chip"><Sparkles size={12} /> {item.highlights}</span>}
          <span className="chip" title={priceInfo(item).estimate ? 'Perkiraan berdasarkan tempat sejenis' : undefined}>
            <Ticket size={12} /> {priceChip(item)}
          </span>
        </div>

        {item.description && <p className="place-desc">{item.description}</p>}

        <div className="place-foot">
          <span className="place-stars">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={13} fill={item.rating_count > 0 && i <= filled ? 'currentColor' : 'none'} />
            ))}
            <em>{item.rating_count > 0 ? `${item.avg_rating} (${item.rating_count})` : 'Belum ada rating'}</em>
          </span>
          <span className="btn-explore">Eksplor</span>
        </div>
      </div>
    </Link>
  );
}