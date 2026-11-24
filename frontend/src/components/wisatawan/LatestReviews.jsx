import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import ReviewCard from './ReviewCard';

export default function LatestReviews() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    api.get('/home').then((r) => setReviews(r.data.latestReviews)).catch(() => {});
  }, [user?.id]);

  const handleHelpful = async (reviewId) => {
    if (!user) return navigate('/login');
    try {
      const { data } = await api.post(`/reviews/${reviewId}/helpful`);
      setReviews((list) =>
        list.map((r) => (r.id === reviewId ? { ...r, liked: data.liked, helpful_count: data.total } : r))
      );
    } catch {
      /* abaikan */
    }
  };

  return (
    <section className="section latest">
      <div className="section-head">
        <div>
          <small className="eyebrow">AKTIVITAS TERKINI</small>
          <h2>Ulasan Terbaru</h2>
        </div>
        <span className="live"><i /> Real-time update</span>
      </div>

      {reviews.length === 0 ? (
        <p className="muted-center">Belum ada ulasan. Jadilah yang pertama menulis!</p>
      ) : (
        <div className="review-grid">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} onHelpful={handleHelpful} />)}
        </div>
      )}

      <div className="center">
        <Link to="/jelajah" className="btn-soft">Jelajahi Semua Destinasi <ChevronRight size={14} /></Link>
      </div>
    </section>
  );
}