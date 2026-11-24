import { Link } from 'react-router-dom';
import { Star, ThumbsUp, Pencil, MapPin } from 'lucide-react';
import { imgUrl, monthYear } from '../../utils/helpers';

export default function ProfileReviews({ items, editable, emptyText }) {
  if (!items || items.length === 0) {
    return <p className="muted-center">{emptyText}</p>;
  }

  return (
    <div className="pf-reviews">
      {items.map((r) => {
        const cover = imgUrl(r.cover_image);
        return (
          <article key={r.id} className="pf-review">
            <div
              className="pf-review-thumb"
              style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
            />
            <div className="pf-review-body">
              <div className="pf-review-top">
                <div>
                  <Link to={`/destinasi/${r.destination_id}`} className="pf-review-dest">
                    {r.destination_name}
                  </Link>
                  <small><MapPin size={11} /> {r.location}</small>
                </div>
                {r.score > 0 && (
                  <span className="stars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} size={14} fill={i <= r.score ? 'currentColor' : 'none'} />
                    ))}
                  </span>
                )}
              </div>

              {r.title && <h4>{r.title}</h4>}
              <p>{r.content}</p>

              {r.photos.length > 0 && (
                <div className="pf-review-photos">
                  {r.photos.map((p) => (
                    <a key={p} href={imgUrl(p)} target="_blank" rel="noreferrer">
                      <img src={imgUrl(p)} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}

              <div className="pf-review-foot">
                <span><ThumbsUp size={13} /> {r.helpful_count} terbantu</span>
                <span>Kunjungan: {monthYear(r.visit_date || r.created_at)}</span>
                {editable && (
                  <Link to={`/destinasi/${r.destination_id}/tulis-review`} className="pf-edit">
                    <Pencil size={12} /> Ubah
                  </Link>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}