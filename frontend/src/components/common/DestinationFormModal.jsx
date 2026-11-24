import { useEffect, useRef, useState } from 'react';
import { X, Save, Search, MapPin, Link2, ExternalLink, Upload, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import { errorMessage, useToast } from '../../context/toast';
import { imgUrl } from '../../utils/helpers';

const FIELDS = [
  'name',
  'location',
  'address',
  'category_id',
  'price',
  'open_hours',
  'best_time',
  'highlights',
  'latitude',
  'longitude',
  'cover_image',
  'description',
];
const MAX_PHOTO = 8 * 1024 * 1024; // sama dengan batas multer di backend
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const toForm = (d) =>
  Object.fromEntries(FIELDS.map((f) => [f, d && d[f] !== null && d[f] !== undefined ? String(d[f]) : '']));

// Baca koordinat dari link Google Maps yang disalin dari browser.
// Urutan: titik tempat (!3d..!4d..) > ?q=/ll=/query= > posisi kamera (@lat,lng).
function parseMapsLink(text) {
  const s = decodeURIComponent(String(text || '').trim());
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/, // "lat, lng" yang disalin langsung
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

// Cek ringan di browser; validasi utama tetap di backend
function validate(f) {
  if (f.name.trim().length < 2) return 'Nama destinasi minimal 2 karakter';
  if (f.location.trim().length < 2) return 'Lokasi minimal 2 karakter';
  if (!f.category_id) return 'Pilih kategori';
  if (f.price !== '' && !(Number.isInteger(Number(f.price)) && Number(f.price) >= 0))
    return 'Harga tiket harus bilangan bulat 0 atau lebih';
  const hasLat = f.latitude.trim() !== '';
  const hasLng = f.longitude.trim() !== '';
  if (hasLat !== hasLng) return 'Isi latitude dan longitude sekaligus, atau kosongkan keduanya';
  if (hasLat && !(Math.abs(Number(f.latitude)) <= 90)) return 'Latitude harus angka -90 sampai 90';
  if (hasLng && !(Math.abs(Number(f.longitude)) <= 180)) return 'Longitude harus angka -180 sampai 180';
  return '';
}

// destination = null → tambah baru; selain itu ubah
// apiBase: '/admin' (default) atau '/manage' (pengelola, hanya destinasi miliknya)
// addressEnabled: kolom alamat lengkap sudah ada di database (backend/sql/address.sql)
export default function DestinationFormModal({ destination, categories, onClose, onSaved, apiBase = '/admin', addressEnabled = false }) {
  const toast = useToast();
  const isEdit = Boolean(destination);
  const [form, setForm] = useState(() => toForm(destination));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);

  // Cari lokasi (Nominatim lewat backend)
  const [place, setPlace] = useState('');
  const [found, setFound] = useState(null); // null = belum mencari; [] = tidak ada hasil
  const [searching, setSearching] = useState(false);
  const [placeErr, setPlaceErr] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [mapsMsg, setMapsMsg] = useState(null); // { ok, text }

  // Foto cover yang akan diunggah setelah destinasi tersimpan
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  // Bebaskan URL pratinjau foto lokal
  useEffect(() => () => coverPreview && URL.revokeObjectURL(coverPreview), [coverPreview]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const searchPlace = async () => {
    const q = (place || form.name).trim();
    if (q.length < 3) return setPlaceErr('Ketik minimal 3 huruf nama tempat atau alamat');
    setPlaceErr('');
    setSearching(true);
    try {
      const res = await api.get(`${apiBase}/geocode`, { params: { q } });
      setFound(res.data.items);
    } catch (err) {
      setFound(null);
      setPlaceErr(errorMessage(err, 'Pencarian lokasi gagal'));
    } finally {
      setSearching(false);
    }
  };

  const pickPlace = (p) => {
    setForm((f) => ({
      ...f,
      name: f.name.trim() ? f.name : p.name,
      location: p.location,
      address: p.address,
      latitude: String(p.latitude),
      longitude: String(p.longitude),
    }));
    setFound(null);
    setMapsMsg({ ok: true, text: `Lokasi diisi dari "${p.name}". Periksa titiknya lewat tautan Google Maps di bawah.` });
  };

  const applyMapsLink = (text) => {
    setMapsLink(text);
    if (!text.trim()) return setMapsMsg(null);
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) {
      return setMapsMsg({
        ok: false,
        text: 'Link pendek tidak berisi koordinat. Buka link itu di browser, lalu salin alamat lengkap dari address bar.',
      });
    }
    const c = parseMapsLink(text);
    if (!c) return setMapsMsg({ ok: false, text: 'Koordinat tidak ditemukan di link ini. Klik kanan titik di Google Maps lalu salin angkanya, atau salin link lengkap.' });
    setForm((f) => ({ ...f, latitude: c.lat.toFixed(7), longitude: c.lng.toFixed(7) }));
    setMapsMsg({ ok: true, text: `Koordinat diisi: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` });
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError('Foto harus JPG, PNG, WEBP, atau GIF');
    if (file.size > MAX_PHOTO) return setError('Ukuran foto maksimal 8 MB');
    setError('');
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const clearFile = () => {
    setCoverFile(null);
    setCoverPreview('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const msg = validate(form);
    if (msg) return setError(msg);
    setError('');
    setSaving(true);
    let savedId = null;
    try {
      const body = { ...form, category_id: Number(form.category_id) };
      if (!addressEnabled) delete body.address;
      if (isEdit) {
        await api.put(`${apiBase}/destinations/${destination.id}`, body);
        savedId = destination.id;
      } else {
        const res = await api.post(`${apiBase}/destinations`, body);
        savedId = res.data.id;
      }
    } catch (err) {
      setError(errorMessage(err, 'Gagal menyimpan destinasi'));
      setSaving(false);
      return;
    }

    const name = form.name.trim();
    const done = isEdit ? `Destinasi "${name}" diperbarui` : `Destinasi "${name}" ditambahkan`;
    if (coverFile) {
      // Destinasi sudah tersimpan; foto diunggah ke galeri lalu dijadikan cover
      try {
        const fd = new FormData();
        fd.append('photos', coverFile);
        await api.post(`${apiBase}/destinations/${savedId}/photos`, fd, { params: { cover: 1 } });
        return onSaved(`${done}, foto cover diunggah`);
      } catch (err) {
        toast.error(`Destinasi tersimpan, tapi foto gagal diunggah: ${errorMessage(err, 'coba lagi lewat Kelola Foto')}`);
      }
    }
    onSaved(done);
  };

  // Pratinjau: URL http(s) atau foto galeri lokal (mis. gallery/xxx.jpg)
  const coverOk = /^https?:\/\/\S+$/i.test(form.cover_image.trim()) || form.cover_image.trim() === destination?.cover_image;
  const hasCoords = form.latitude.trim() !== '' && form.longitude.trim() !== '' && !validate({ ...form, name: 'xx', location: 'xx', category_id: '1', price: '' });

  return (
    <div className="ad-overlay" onClick={() => !saving && onClose()}>
      <form
        className="ad-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dest-form-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <button type="button" className="ad-modal-x" onClick={onClose} disabled={saving} aria-label="Tutup">
          <X size={16} />
        </button>
        <h3 id="dest-form-title">{isEdit ? 'Ubah destinasi' : 'Tambah destinasi'}</h3>
        <p className="ad-muted" style={{ margin: 0 }}>
          {isEdit
            ? `Sumber: ${destination.source}. Kolom bertanda * wajib diisi.`
            : 'Destinasi baru tercatat dengan sumber "manual". Kolom bertanda * wajib diisi.'}
        </p>

        <div className="ad-form">
          {error && <div className="ad-form-error" role="alert">{error}</div>}

          <div className="ad-field full">
            <label htmlFor="df-name">Nama destinasi <span className="req">*</span></label>
            <input id="df-name" ref={firstRef} className="ad-input" maxLength={150} value={form.name} onChange={set('name')} />
          </div>

          {/* ---------- Lokasi dari peta ---------- */}
          <fieldset className="ad-field full df-geo">
            <legend><MapPin size={14} /> Isi lokasi otomatis</legend>
            <div className="df-geo-row">
              <input
                className="ad-input"
                maxLength={150}
                placeholder={form.name.trim() ? `Cari "${form.name.trim()}" atau ketik alamat` : 'Nama tempat atau alamat'}
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchPlace();
                  }
                }}
                aria-label="Cari lokasi di peta"
                disabled={saving}
              />
              <button type="button" className="ad-btn soft" onClick={searchPlace} disabled={searching || saving}>
                <Search size={14} /> {searching ? 'Mencari...' : 'Cari lokasi'}
              </button>
            </div>
            {placeErr && <span className="ad-field-err" role="alert">{placeErr}</span>}
            {found && (
              found.length === 0 ? (
                <p className="df-geo-empty">Tidak ditemukan. Coba nama lain, tambahkan nama kota, atau gunakan link Google Maps.</p>
              ) : (
                <ul className="df-geo-list" aria-label="Hasil pencarian lokasi">
                  {found.map((p) => (
                    <li key={`${p.latitude},${p.longitude}`}>
                      <button type="button" onClick={() => pickPlace(p)}>
                        <strong>{p.name}</strong>
                        <small>{p.label}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}

            <div className="df-geo-row">
              <span className="df-geo-icon"><Link2 size={14} /></span>
              <input
                className="ad-input"
                placeholder="Atau tempel link Google Maps / koordinat (-7.56, 110.85)"
                value={mapsLink}
                onChange={(e) => applyMapsLink(e.target.value)}
                aria-label="Link Google Maps"
                disabled={saving}
              />
            </div>
            {mapsMsg && <small className={mapsMsg.ok ? 'df-ok' : 'ad-field-err'} role="status">{mapsMsg.text}</small>}
            <small>Data peta © OpenStreetMap. Hasil pencarian tetap bisa diubah di kolom di bawah.</small>
          </fieldset>

          <div className="ad-field">
            <label htmlFor="df-location">Lokasi singkat <span className="req">*</span></label>
            <input id="df-location" className="ad-input" maxLength={150} placeholder="Kota / kabupaten" value={form.location} onChange={set('location')} />
          </div>
          <div className="ad-field">
            <label htmlFor="df-category">Kategori <span className="req">*</span></label>
            <select id="df-category" className="ad-select" value={form.category_id} onChange={set('category_id')}>
              <option value="">Pilih kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {addressEnabled && (
            <div className="ad-field full">
              <label htmlFor="df-address">Alamat lengkap</label>
              <input id="df-address" className="ad-input" maxLength={255} placeholder="Jalan, kecamatan, kota, provinsi" value={form.address} onChange={set('address')} />
            </div>
          )}
          <div className="ad-field">
            <label htmlFor="df-lat">Latitude</label>
            <input id="df-lat" className="ad-input" type="number" step="any" min="-90" max="90" placeholder="-7.5639" value={form.latitude} onChange={set('latitude')} />
          </div>
          <div className="ad-field">
            <label htmlFor="df-lng">Longitude</label>
            <input id="df-lng" className="ad-input" type="number" step="any" min="-180" max="180" placeholder="110.8586" value={form.longitude} onChange={set('longitude')} />
          </div>
          {hasCoords && (
            <div className="ad-field full" style={{ marginTop: -6 }}>
              <a
                className="ad-link"
                href={`https://www.google.com/maps?q=${form.latitude.trim()},${form.longitude.trim()}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} /> Cek titik ini di Google Maps
              </a>
            </div>
          )}

          <div className="ad-field">
            <label htmlFor="df-price">Harga tiket (Rp)</label>
            <input id="df-price" className="ad-input" type="number" min="0" step="1000" placeholder="Kosongkan bila belum tahu" value={form.price} onChange={set('price')} />
            <small>Isi 0 untuk gratis.</small>
          </div>
          <div className="ad-field">
            <label htmlFor="df-hours">Jam buka</label>
            <input id="df-hours" className="ad-input" maxLength={100} placeholder="08.00 - 17.00" value={form.open_hours} onChange={set('open_hours')} />
          </div>
          <div className="ad-field">
            <label htmlFor="df-best">Waktu terbaik berkunjung</label>
            <input id="df-best" className="ad-input" maxLength={50} placeholder="Mei - September" value={form.best_time} onChange={set('best_time')} />
          </div>
          <div className="ad-field">
            <label htmlFor="df-highlights">Highlights</label>
            <input id="df-highlights" className="ad-input" maxLength={255} placeholder="Pisahkan dengan koma" value={form.highlights} onChange={set('highlights')} />
          </div>

          {/* ---------- Foto cover: unggah atau URL ---------- */}
          <div className="ad-field full">
            <label htmlFor="df-cover">Foto cover</label>
            {coverFile ? (
              <div className="ad-cover-row">
                <img className="ad-thumb" src={coverPreview} alt="Pratinjau foto yang akan diunggah" />
                <span className="df-file">{coverFile.name} · {(coverFile.size / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB</span>
                <button type="button" className="ad-icon-btn danger" onClick={clearFile} disabled={saving} aria-label="Batalkan foto" title="Batalkan foto">
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <div className="ad-cover-row">
                <input id="df-cover" className="ad-input" maxLength={500} placeholder="https://... (tautan gambar)" value={form.cover_image} onChange={set('cover_image')} />
                {coverOk && form.cover_image.trim() && <img className="ad-thumb" src={imgUrl(form.cover_image.trim())} alt="Pratinjau cover" />}
                <button type="button" className="ad-btn soft" onClick={() => fileRef.current?.click()} disabled={saving}>
                  <Upload size={14} /> Unggah foto
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} hidden onChange={pickFile} />
            <small>
              {coverFile
                ? 'Foto akan masuk galeri dan dijadikan cover saat Anda menyimpan.'
                : 'Tempel tautan gambar http(s), atau unggah foto dari perangkat (JPG/PNG/WEBP, maks. 8 MB).'}
            </small>
          </div>

          <div className="ad-field full">
            <label htmlFor="df-desc">Deskripsi</label>
            <textarea id="df-desc" className="ad-input" rows={5} maxLength={5000} value={form.description} onChange={set('description')} />
            <small>{form.description.length.toLocaleString('id-ID')} / 5.000 karakter</small>
          </div>
        </div>

        <div className="ad-modal-actions">
          <button type="button" className="ad-btn soft" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="ad-btn accent" disabled={saving}>
            <Save size={15} /> {saving ? 'Menyimpan...' : isEdit ? 'Simpan perubahan' : 'Tambah destinasi'}
          </button>
        </div>
      </form>
    </div>
  );
}
