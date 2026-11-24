import { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Trash2, Star, ImageOff, RotateCcw, Save } from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';
import { imgUrl, timeAgo } from '../../utils/helpers';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_MB = 8;
const BATCH = 20; // sama dengan batas backend per unggahan
let seq = 0; // kunci unik foto baru yang belum diunggah

// Kelola foto satu destinasi (SRS 3.15 & 3.16).
// Admin (apiBase '/admin'): galeri resmi + foto dari ulasan (boleh dihapus).
// Pengelola (apiBase '/manage', canDeleteReviewPhotos=false): hanya galeri resmi;
// foto ulasan pengunjung tidak ditampilkan karena moderasinya tugas admin.
//
// Semua perubahan (unggah, ganti cover, hapus) ditampung dulu dan baru dikirim
// ke server saat "Simpan Perubahan"; "Batal" membuang semuanya.
export default function GalleryModal({ destination, onClose, onChanged, apiBase = '/admin', canDeleteReviewPhotos = true }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== tick;
  const [drag, setDrag] = useState(false);

  // Perubahan yang belum disimpan
  const [added, setAdded] = useState([]); // [{ key, file, url }]
  const [removed, setRemoved] = useState(() => new Set()); // id foto lama yang akan dihapus
  const [coverPick, setCoverPick] = useState(null); // { id } foto lama | { key } foto baru

  const [saving, setSaving] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = added.length > 0 || removed.size > 0 || coverPick !== null;

  useEffect(() => {
    let alive = true;
    api
      .get(`${apiBase}/destinations/${destination.id}/photos`)
      .then((res) => alive && setResult({ key: tick, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key: tick, data: null, error: errorMessage(err, 'Gagal memuat foto') }));
    return () => {
      alive = false;
    };
  }, [apiBase, destination.id, tick]);

  // Bebaskan URL pratinjau saat modal ditutup
  const addedRef = useRef(added);
  useEffect(() => {
    addedRef.current = added;
  }, [added]);
  useEffect(() => () => addedRef.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

  const resetChanges = () => {
    added.forEach((a) => URL.revokeObjectURL(a.url));
    setAdded([]);
    setRemoved(new Set());
    setCoverPick(null);
  };

  // Tutup: bila ada perubahan, tanya dulu
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !confirmSave && !confirmDiscard) requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const queueFiles = (list) => {
    const files = Array.from(list);
    const bad = files.filter((f) => !OK_TYPES.includes(f.type) || f.size > MAX_MB * 1024 * 1024);
    const good = files.filter((f) => !bad.includes(f));
    if (bad.length) toast.error(`${bad.length} file dilewati (harus JPG/PNG/WEBP/GIF, maks. ${MAX_MB} MB)`);
    if (!good.length) return;
    setAdded((a) => [...a, ...good.map((file) => ({ key: `n${++seq}`, file, url: URL.createObjectURL(file) }))]);
  };

  const unqueue = (key) => {
    setAdded((a) => {
      const hit = a.find((x) => x.key === key);
      if (hit) URL.revokeObjectURL(hit.url);
      return a.filter((x) => x.key !== key);
    });
    if (coverPick?.key === key) setCoverPick(null);
  };

  const toggleRemove = (p) => {
    setRemoved((s) => {
      const next = new Set(s);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    if (coverPick?.id === p.id) setCoverPick(null);
  };

  const items = result.data?.items || [];
  const galleryItems = items.filter((p) => p.kind === 'gallery');
  const reviewItems = items.filter((p) => p.kind === 'review');
  const oldCover = galleryItems.find((p) => p.is_cover);

  // Cover setelah perubahan disimpan (untuk tampilan)
  const isCoverNow = (p) =>
    coverPick ? coverPick.id === p.id : p.is_cover && !removed.has(p.id);
  const coverCleared = !coverPick && oldCover && removed.has(oldCover.id);

  const save = async () => {
    setConfirmSave(false);
    const errors = [];
    let uploaded = 0;
    let deleted = 0;
    const base = `${apiBase}/destinations/${destination.id}`;

    // 1) Unggah foto baru. Foto baru yang dipilih jadi cover diunggah sendiri dengan ?cover=1.
    const coverNew = coverPick?.key ? added.find((a) => a.key === coverPick.key) : null;
    const rest = added.filter((a) => a !== coverNew);
    try {
      if (coverNew) {
        setSaving('Mengunggah foto cover...');
        const fd = new FormData();
        fd.append('photos', coverNew.file);
        await api.post(`${base}/photos`, fd, { params: { cover: 1 } });
        uploaded += 1;
      }
      for (let i = 0; i < rest.length; i += BATCH) {
        setSaving(`Mengunggah ${Math.min(i + BATCH, rest.length)} dari ${rest.length} foto...`);
        const fd = new FormData();
        rest.slice(i, i + BATCH).forEach((a) => fd.append('photos', a.file));
        const res = await api.post(`${base}/photos`, fd);
        uploaded += res.data.added;
      }
    } catch (err) {
      errors.push(errorMessage(err, 'Sebagian foto gagal diunggah'));
    }

    // 2) Hapus foto yang ditandai
    for (const id of removed) {
      setSaving(`Menghapus foto (${deleted + 1} dari ${removed.size})...`);
      try {
        await api.delete(`${apiBase}/photos/${id}`);
        deleted += 1;
      } catch (err) {
        errors.push(errorMessage(err, 'Sebagian foto gagal dihapus'));
      }
    }

    // 3) Ganti cover ke foto lama yang dipilih
    if (coverPick?.id) {
      setSaving('Mengganti cover...');
      try {
        await api.patch(`${base}/cover`, { photo_id: coverPick.id });
      } catch (err) {
        errors.push(errorMessage(err, 'Gagal mengganti cover'));
      }
    }

    setSaving('');
    resetChanges();
    setTick((t) => t + 1);
    onChanged();

    const parts = [
      uploaded && `${uploaded} foto diunggah`,
      deleted && `${deleted} foto dihapus`,
      coverPick && !errors.length && 'cover diperbarui',
    ].filter(Boolean);
    if (errors.length) toast.error([...new Set(errors)].join('. '));
    if (parts.length) toast.success(`Perubahan disimpan: ${parts.join(', ')}`);
    // Berhasil semua: modal langsung ditutup; bila ada yang gagal, tetap terbuka agar bisa dicek
    if (!errors.length) onClose();
  };

  const requestSave = () => {
    if (!dirty || saving) return;
    // Penghapusan permanen wajib dikonfirmasi
    if (removed.size > 0) setConfirmSave(true);
    else save();
  };

  const renderTile = (p) => {
    const gone = removed.has(p.id);
    const cover = isCoverNow(p);
    const canDelete = p.kind === 'gallery' || canDeleteReviewPhotos;
    return (
      <figure key={p.id} className={`ad-ph${cover ? ' cover' : ''}${gone ? ' removed' : ''}`}>
        <a href={imgUrl(p.file_path)} target="_blank" rel="noreferrer">
          <img src={imgUrl(p.file_path)} alt={p.kind === 'gallery' ? 'Foto galeri' : `Foto ulasan ${p.user_name}`} loading="lazy" />
        </a>
        {cover && <span className="ad-ph-badge"><Star size={11} /> Cover</span>}
        {gone && <span className="ad-ph-badge danger"><Trash2 size={11} /> Akan dihapus</span>}
        <figcaption>
          <span title={new Date(p.created_at).toLocaleString('id-ID')}>
            {p.user_name} · {timeAgo(p.created_at)}
          </span>
          <span className="ad-ph-actions">
            {p.kind === 'gallery' && !cover && !gone && (
              <button type="button" className="ad-icon-btn" title="Jadikan cover" aria-label="Jadikan cover" onClick={() => setCoverPick({ id: p.id })} disabled={Boolean(saving)}>
                <Star size={14} />
              </button>
            )}
            {canDelete && (
              gone ? (
                <button type="button" className="ad-icon-btn" title="Batal hapus" aria-label="Batal hapus foto" onClick={() => toggleRemove(p)} disabled={Boolean(saving)}>
                  <RotateCcw size={14} />
                </button>
              ) : (
                <button type="button" className="ad-icon-btn danger" title="Tandai untuk dihapus" aria-label="Tandai foto untuk dihapus" onClick={() => toggleRemove(p)} disabled={Boolean(saving)}>
                  <Trash2 size={14} />
                </button>
              )
            )}
          </span>
        </figcaption>
      </figure>
    );
  };

  const renderNewTile = (a) => {
    const cover = coverPick?.key === a.key;
    return (
      <figure key={a.key} className={`ad-ph pending${cover ? ' cover' : ''}`}>
        <img src={a.url} alt={`Foto baru ${a.file.name}`} />
        <span className={`ad-ph-badge${cover ? '' : ' new'}`}>{cover ? <><Star size={11} /> Cover baru</> : 'Baru'}</span>
        <figcaption>
          <span title={a.file.name}>{a.file.name}</span>
          <span className="ad-ph-actions">
            {!cover && (
              <button type="button" className="ad-icon-btn" title="Jadikan cover" aria-label="Jadikan foto baru ini cover" onClick={() => setCoverPick({ key: a.key })} disabled={Boolean(saving)}>
                <Star size={14} />
              </button>
            )}
            <button type="button" className="ad-icon-btn danger" title="Batalkan foto ini" aria-label="Batalkan foto baru" onClick={() => unqueue(a.key)} disabled={Boolean(saving)}>
              <X size={14} />
            </button>
          </span>
        </figcaption>
      </figure>
    );
  };

  const changes = [
    added.length && `${added.length} foto baru`,
    removed.size && `${removed.size} foto dihapus`,
    coverPick && 'cover diganti',
  ].filter(Boolean);

  return (
    <>
      <div className="ad-overlay" onClick={requestClose}>
        <div className="ad-modal lg" role="dialog" aria-modal="true" aria-labelledby="gal-title" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ad-modal-x" onClick={requestClose} disabled={Boolean(saving)} aria-label="Tutup"><X size={16} /></button>
          <h3 id="gal-title">Foto destinasi</h3>
          <p className="ad-muted" style={{ margin: '0 0 14px' }}>{destination.name}</p>

          {result.error && !loading ? (
            <div className="ad-state error" role="alert">
              <strong>Foto tidak bisa dimuat</strong>
              <p>{result.error}</p>
              <button type="button" className="ad-btn soft" onClick={() => setTick((t) => t + 1)}>Coba lagi</button>
            </div>
          ) : !result.data ? (
            <p className="ad-empty-inline">Memuat foto...</p>
          ) : (
            <>
              <section>
                <div className="ad-card-head">
                  <h3>Galeri resmi ({galleryItems.length - [...removed].filter((id) => galleryItems.some((p) => p.id === id)).length + added.length})</h3>
                </div>
                <div
                  className={`ad-drop${drag ? ' on' : ''}${saving ? ' busy' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => !saving && inputRef.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !saving && inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); if (!saving) queueFiles(e.dataTransfer.files); }}
                >
                  <ImagePlus size={22} />
                  <strong>{saving || 'Tambah foto galeri'}</strong>
                  {!saving && <small>Klik atau seret foto ke sini · JPG, PNG, WEBP, GIF · maks. {MAX_MB} MB per foto</small>}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  accept={OK_TYPES.join(',')}
                  onChange={(e) => { queueFiles(e.target.files); e.target.value = ''; }}
                />
                {galleryItems.length + added.length > 0 ? (
                  <div className="ad-ph-grid">
                    {added.map(renderNewTile)}
                    {galleryItems.map(renderTile)}
                  </div>
                ) : (
                  <p className="ad-empty-inline">Belum ada foto galeri. Tambahkan foto, pilih cover dengan ikon bintang, lalu simpan.</p>
                )}
                {coverCleared && (
                  <p className="ad-note" style={{ marginTop: 10 }}>Cover saat ini akan dihapus. Pilih foto lain sebagai cover, atau destinasi tampil tanpa cover.</p>
                )}
              </section>

              {canDeleteReviewPhotos && (
              <section style={{ marginTop: 22 }}>
                <div className="ad-card-head">
                  <h3>Foto dari ulasan pengunjung ({reviewItems.length})</h3>
                </div>
                {reviewItems.length > 0 ? (
                  <div className="ad-ph-grid">{reviewItems.map(renderTile)}</div>
                ) : (
                  <p className="ad-empty-inline"><ImageOff size={14} /> Belum ada foto dari ulasan.</p>
                )}
              </section>
              )}

              <div className="ad-modal-actions ad-gal-foot">
                <span className="ad-muted" role="status">
                  {dirty ? `Belum disimpan: ${changes.join(', ')}` : 'Tidak ada perubahan'}
                </span>
                <button
                  type="button"
                  className="ad-btn soft"
                  disabled={Boolean(saving)}
                  onClick={() => {
                    resetChanges();
                    onClose();
                  }}
                >
                  Batal
                </button>
                <button type="button" className="ad-btn accent" onClick={requestSave} disabled={!dirty || Boolean(saving)}>
                  <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmSave}
        title="Simpan perubahan foto?"
        confirmLabel="Ya, simpan"
        onClose={() => setConfirmSave(false)}
        onConfirm={save}
        message={
          <>
            <p>
              <b>{removed.size} foto</b> akan dihapus permanen dari server
              {added.length > 0 && <>, dan <b>{added.length} foto baru</b> akan diunggah</>}.
            </p>
            {coverCleared && <p>Foto yang sedang dipakai sebagai <b>cover</b> ikut terhapus; cover destinasi akan dikosongkan.</p>}
            {[...removed].some((id) => reviewItems.some((p) => p.id === id)) && <p>Ulasan pemilik foto tetap ada.</p>}
          </>
        }
      />

      <ConfirmModal
        open={confirmDiscard}
        title="Buang perubahan?"
        confirmLabel="Ya, buang"
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          resetChanges();
          onClose();
        }}
        message={<p>Perubahan foto yang belum disimpan ({changes.join(', ')}) akan hilang.</p>}
      />
    </>
  );
}
