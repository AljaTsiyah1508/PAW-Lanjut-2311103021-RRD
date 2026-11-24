import { MapPin, Star, ThumbsUp } from 'lucide-react';
import { imgUrl, initials, monthYear, timeAgo } from '../../utils/helpers';

export default function ReviewCard({ review, onHelpful }) {
  const shown = review.photos.slice(0, 2);
  const extra = review.photos.length - shown.length;

  return (
    <article className="review-card">
      <div className="review-head">
        <span className="avatar">{initials(review.user_name)}</span>
        <div>
          <strong>{review.user_name}</strong>
          <small>{timeAgo(review.created_at)}</small>
        </div>
      </div>

      <div className="review-dest">
        <span><MapPin size={13} /> {review.destination_name}</span>
        <span className="stars">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={13} fill={i <= review.score ? 'currentColor' : 'none'} />
          ))}
        </span>
      </div>

      {review.title && <h4>“{review.title}”</h4>}
      <p>{review.content}</p>

      {review.photos.length > 0 && (
        <div className="review-photos">
          {shown.map((p) => <img key={p} src={imgUrl(p)} alt="" />)}
          {extra > 0 && <span className="more-photo">+{extra} Foto</span>}
        </div>
      )}

      <div className="review-foot">
        <button className={review.liked ? 'helpful on' : 'helpful'} onClick={() => onHelpful(review.id)}>
          <ThumbsUp size={14} /> Membantu ({review.helpful_count})
        </button>
        <small>Kunjungan: {monthYear(review.visit_date || review.created_at)}</small>
      </div>
    </article>
  );
}