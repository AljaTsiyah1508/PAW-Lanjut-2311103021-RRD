import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Star, MapPin, Lightbulb, ImagePlus, X, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import { imgUrl } from '../../utils/helpers';
import '../../styles/home.css';
import '../../styles/detail.css';
import '../../styles/photos.css';
const LABELS = ['', 'Buruk', 'Kurang', 'Cukup', 'Bagus', 'Luar Biasa'];
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_MB = 8;
const BATCH = 20; // jumlah foto per kali kirim (otomatis bertahap, total tidak dibatasi)

export default function WriteReview() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [dest, setDest] = useState(null);
  const [score, setScore] = useState(Number(params.get('rating')) || 0);
  const [hover, setHover] = useState(0);
  const [form, setForm] = useState({ title: '', content: '', visit_date: '' });
  const [existing, setExisting] = useState(false);
  const [photos, setPhotos] = useState([]); // foto lama di server: [{ id, file_path }]
  const [files, setFiles] = useState([]);   // foto baru dipilih: [{ id, file, url }]
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delRating, setDelRating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filesRef = useRef([]);
  filesRef.current = files;

  const load = useCallback(
    () =>
      api
        .get(`/destinations/${id}`)
        .then((r) => {
          setDest(r.data.destination);
          if (r.data.myRating && !params.get('rating')) setScore(r.data.myRating);
          if (r.data.myReview) {
            setExisting(true);
            setForm({
              title: r.data.myReview.title || '',
              content: r.data.myReview.content || '',
              visit_date: r.data.myReview.visit_date || '',
            });
            setPhotos(r.data.myReview.photos || []);
          }
        })
        .catch(() => setError('Destinasi tidak ditemukan.')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, [load]);

  // Bersihkan URL pratinjau saat halaman ditutup
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const addFiles = (list) => {
    const good = [];
    const problems = [];
    Array.from(list).forEach((f) => {
      if (!OK_TYPES.includes(f.type)) problems.push(`${f.name} (format tidak didukung)`);
      else if (f.size > MAX_MB * 1024 * 1024) problems.push(`${f.name} (lebih dari ${MAX_MB} MB)`);
      else good.push({ id: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, file: f, url: URL.createObjectURL(f) });
    });
    setFiles((prev) => [...prev, ...good]);
    setError(
      problems.length
        ? `Dilewati: ${problems.slice(0, 3).join(', ')}${problems.length > 3 ? ` dan ${problems.length - 3} lainnya` : ''}`
        : ''
    );
  };

  const removeNew = (fid) =>
    setFiles((prev) => {
      const t = prev.find((x) => x.id === fid);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter((x) => x.id !== fid);
    });

  const removeOld = async (photoId) => {
    if (!window.confirm('Hapus foto ini dari ulasanmu?')) return;
    try {
      await api.delete(`/photos/${photoId}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!score) return setError('Pilih rating bintang dulu.');
    if (form.content.trim().length < 10) return setError('Ulasan minimal 10 karakter.');

    setSaving(true);
    try {
      await api.put(`/destinations/${id}/rating`, { score });
      await api.put(`/destinations/${id}/review`, form);
      setExisting(true);

      // Unggah foto bertahap; paket yang gagal tetap disimpan di daftar supaya bisa dicoba lagi
      const failed = [];
      let lastMsg = '';
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        setProgress(`Mengunggah foto ${Math.min(i + BATCH, files.length)} dari ${files.length}...`);
        const fd = new FormData();
        batch.forEach((x) => fd.append('photos', x.file));
        try {
          await api.post(`/destinations/${id}/photos`, fd);
          batch.forEach((x) => URL.revokeObjectURL(x.url));
        } catch (err) {
          failed.push(...batch);
          lastMsg = err.response?.data?.message || '';
        }
      }
      setProgress('');

      if (failed.length > 0) {
        setFiles(failed);
        await load();
        setError(
          `Ulasan tersimpan, tetapi ${failed.length} foto gagal diunggah${lastMsg ? ` (${lastMsg})` : ''}. Klik "Kirim" lagi untuk mencoba ulang.`
        );
        return;
      }
      navigate(`/destinasi/${id}`);
    } catch (err) {
      setProgress('');
      setError(err.response?.data?.message || 'Gagal menyimpan ulasan.');
    } finally {
      setSaving(false);
    }
  };

  // SRS 3.13: hapus ulasan milik sendiri setelah konfirmasi
  const deleteReview = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/destinations/${id}/review`, {
        params: delRating ? { with_rating: 1 } : {},
      });
      navigate(`/destinasi/${id}`, { state: { toast: res.data.message } });
    } catch (err) {
      setConfirmDel(false);
      setError(err.response?.data?.message || 'Gagal menghapus ulasan.');
      setDeleting(false);
    }
  };

  if (!dest) {
    return (
      <div className="home">
        <Navbar />
        <main className="dt">
          {error ? <div className="alert">{error}</div> : <p className="muted-center">Memuat...</p>}
        </main>
      </div>
    );
  }

  const cover = imgUrl(dest.cover_image);
  const shown = hover || score;

  return (
    <div className="home">
      <Navbar />

      <main className="dt">
        <Link to={`/destinasi/${id}`} className="dt-crumb">← Kembali ke <b>{dest.name}</b></Link>

        <div className="wr-grid">
          <form className="dt-card wr-form" onSubmit={submit}>
            <small className="eyebrow">KONTRIBUSI KOMUNITAS</small>
            <h1>{existing ? 'Ubah Ulasan Anda' : 'Tulis Ulasan'}</h1>
            <p className="dt-sub">Ceritakan pengalaman Anda di {dest.name} dengan jujur supaya membantu traveler lain.</p>

            {error && <div className="alert">{error}</div>}

            <label>Rating Anda</label>
            <div className="wr-stars">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i} type="button" aria-label={`${i} bintang`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
                  onClick={() => setScore(i)}
                >
                  <Star size={34} fill={i <= shown ? 'currentColor' : 'none'} />
                </button>
              ))}
              <span className="wr-label">{LABELS[shown] || 'Pilih bintang'}</span>
            </div>

            <label>Judul ulasan (opsional)</label>
            <input
              placeholder="Contoh: Sunrise-nya luar biasa!"
              maxLength={150}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <label>Ulasan Anda</label>
            <textarea
              rows={7}
              placeholder="Apa yang paling berkesan? Bagaimana akses, fasilitas, dan biayanya? (min. 10 karakter)"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
            <small className="wr-count">{form.content.trim().length} karakter</small>

            <label>Tanggal kunjungan</label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.visit_date}
              onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
            />

            {/* ---------- Foto ---------- */}
            <label>Foto (opsional)</label>
            <div
              className={`ph-drop ${drag ? 'on' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            >
              <ImagePlus size={28} />
              <strong>Tambah foto</strong>
              <small>Klik atau seret foto ke sini. Jumlah foto tidak dibatasi. JPG, PNG, WEBP, GIF • maks. {MAX_MB} MB per foto.</small>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />

            {photos.length > 0 && (
              <>
                <div className="ph-title">Foto tersimpan ({photos.length})</div>
                <div className="ph-grid">
                  {photos.map((p) => (
                    <div className="ph-item" key={p.id}>
                      <img src={imgUrl(p.file_path)} alt="" />
                      <button type="button" aria-label="Hapus foto" onClick={() => removeOld(p.id)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {files.length > 0 && (
              <>
                <div className="ph-title">Akan diunggah ({files.length})</div>
                <div className="ph-grid">
                  {files.map((f) => (
                    <div className="ph-item new" key={f.id}>
                      <img src={f.url} alt="" />
                      <button type="button" aria-label="Batalkan foto" onClick={() => removeNew(f.id)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {progress && <p className="ph-progress">{progress}</p>}

            <div className="wr-actions">
              {existing && (
                <button
                  type="button"
                  className="pf-btn danger"
                  style={{ marginRight: 'auto' }}
                  onClick={() => { setDelRating(false); setConfirmDel(true); }}
                  disabled={saving}
                >
                  <Trash2 size={15} /> Hapus Ulasan
                </button>
              )}
              <Link to={`/destinasi/${id}`} className="dt-btn">Batal</Link>
              <button type="submit" className="dt-btn primary big" disabled={saving}>
                {saving ? 'Menyimpan...' : existing ? 'Simpan Perubahan' : 'Kirim Ulasan'}
              </button>
            </div>
          </form>

          <aside>
            <div className="dt-card wr-dest">
              <div className="wr-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined} />
              <h3>{dest.name}</h3>
              <small><MapPin size={12} /> {dest.location}</small>
            </div>

            <div className="dt-card wr-tips">
              <h3><Lightbulb size={16} /> Tips menulis ulasan</h3>
              <ul>
                <li>Ceritakan hal yang kamu lihat dan alami langsung.</li>
                <li>Sebut biaya, waktu tempuh, dan kondisi fasilitas.</li>
                <li>Unggah foto asli dari kunjunganmu.</li>
                <li>Hindari kata kasar dan promosi.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {/* ---------- Konfirmasi hapus ulasan ---------- */}
      {confirmDel && (
        <div className="pf-overlay" onClick={() => !deleting && setConfirmDel(false)}>
          <div className="pf-modal" role="alertdialog" aria-modal="true" aria-labelledby="del-title" onClick={(e) => e.stopPropagation()}>
            <button className="pf-modal-x" onClick={() => setConfirmDel(false)} disabled={deleting} aria-label="Tutup"><X size={16} /></button>
            <div className="pf-modal-head">
              <span className="pf-modal-icon"><Trash2 size={22} /></span>
              <div>
                <h3 id="del-title">Hapus ulasan?</h3>
                <p>
                  Ulasan Anda di {dest.name}
                  {photos.length > 0 ? ` beserta ${photos.length} foto` : ''} akan dihapus permanen dan tidak bisa dikembalikan.
                </p>
              </div>
            </div>
            {score > 0 && (
              <label className="check" style={{ marginTop: 18 }}>
                <input type="checkbox" checked={delRating} onChange={(e) => setDelRating(e.target.checked)} disabled={deleting} />
                Hapus juga rating {score} bintang saya untuk destinasi ini
              </label>
            )}
            <div className="pf-modal-actions">
              <button className="pf-btn soft" onClick={() => setConfirmDel(false)} disabled={deleting}>Tidak, batal</button>
              <button className="pf-btn danger" onClick={deleteReview} disabled={deleting}>
                <Trash2 size={15} /> {deleting ? 'Menghapus...' : 'Ya, hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}