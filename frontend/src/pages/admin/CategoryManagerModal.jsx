import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Tags } from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';

const cleanName = (s) => s.trim().replace(/\s+/g, ' ');
const nameError = (s) => (cleanName(s).length < 2 || cleanName(s).length > 50 ? 'Nama kategori 2 sampai 50 karakter' : '');

// Kelola kategori destinasi (tambah / ubah nama / hapus) dari dalam halaman Kelola Destinasi.
// onChanged: dipanggil setelah ada perubahan (daftar kategori di halaman ikut dimuat ulang)
// onPick(id): klik jumlah destinasi → tampilkan destinasi kategori itu
export default function CategoryManagerModal({ onClose, onChanged, onPick }) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, items: null, error: '' });
  const loading = result.key !== tick;

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [edit, setEdit] = useState(null); // { id, name }
  const [savingEdit, setSavingEdit] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/categories')
      .then((res) => alive && setResult({ key: tick, items: res.data.items, error: '' }))
      .catch((err) => alive && setResult({ key: tick, items: null, error: errorMessage(err, 'Gagal memuat kategori') }));
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !toDelete && !edit) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toDelete, edit, onClose]);

  const changed = () => {
    setTick((t) => t + 1);
    onChanged();
  };
  const items = result.items;

  const add = async (e) => {
    e.preventDefault();
    const msg = nameError(newName);
    if (msg) return setAddError(msg);
    setAddError('');
    setAdding(true);
    try {
      await api.post('/admin/categories', { name: cleanName(newName) });
      toast.success(`Kategori "${cleanName(newName)}" ditambahkan`);
      setNewName('');
      changed();
    } catch (err) {
      setAddError(errorMessage(err, 'Gagal menambah kategori'));
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async () => {
    const msg = nameError(edit.name);
    if (msg) return toast.error(msg);
    const original = items.find((c) => c.id === edit.id);
    if (original && cleanName(edit.name) === original.name) return setEdit(null);
    setSavingEdit(true);
    try {
      await api.put(`/admin/categories/${edit.id}`, { name: cleanName(edit.name) });
      toast.success('Nama kategori diperbarui');
      setEdit(null);
      changed();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah kategori'));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/categories/${toDelete.id}`);
      toast.success(`Kategori "${toDelete.name}" dihapus`);
      setToDelete(null);
      changed();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus kategori'));
      setToDelete(null);
      changed(); // jumlah destinasi mungkin sudah berubah
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ad-overlay" onClick={() => !toDelete && onClose()}>
        <div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="cat-title" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ad-modal-x" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
          <h3 id="cat-title"><Tags size={18} style={{ verticalAlign: '-3px' }} /> Kelola Kategori Destinasi</h3>
          <p className="ad-muted" style={{ margin: '0 0 16px' }}>
            Kategori mengelompokkan destinasi. Kategori yang masih dipakai destinasi tidak bisa dihapus; pindahkan dulu
            destinasinya lewat tombol ubah.
          </p>

          <form className="ad-cat-add" onSubmit={add} noValidate style={{ maxWidth: 'none', marginBottom: 14 }}>
            <label htmlFor="cat-new">Kategori baru</label>
            <div className="ad-cat-add-row">
              <input
                id="cat-new"
                className="ad-input"
                maxLength={50}
                placeholder="Contoh: Wisata Sejarah"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (addError) setAddError('');
                }}
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'cat-new-err' : undefined}
              />
              <button type="submit" className="ad-btn accent" disabled={adding}>
                <Plus size={15} /> {adding ? 'Menambah...' : 'Tambah'}
              </button>
            </div>
            {addError && <span id="cat-new-err" className="ad-field-err" role="alert">{addError}</span>}
          </form>

          {result.error && !loading ? (
            <div className="ad-state error" role="alert">
              <strong>Kategori tidak bisa dimuat</strong>
              <p>{result.error}</p>
              <button type="button" className="ad-btn soft" onClick={() => setTick((t) => t + 1)}>Coba lagi</button>
            </div>
          ) : items && items.length === 0 ? (
            <div className="ad-state">
              <Tags size={28} />
              <strong>Belum ada kategori</strong>
              <p>Tambahkan kategori pertama lewat form di atas.</p>
            </div>
          ) : (
            <div className="ad-table-wrap" aria-busy={loading}>
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Nama kategori</th>
                    <th className="num">Destinasi</th>
                    <th className="actions"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody style={{ opacity: loading && items ? 0.55 : 1 }}>
                  {!items ? (
                    <tr className="ad-loading-row"><td colSpan={3}>Memuat kategori...</td></tr>
                  ) : (
                    items.map((c) => {
                      const editing = edit?.id === c.id;
                      const used = c.total > 0;
                      return (
                        <tr key={c.id}>
                          <td>
                            {editing ? (
                              <input
                                className="ad-input ad-cat-edit"
                                autoFocus
                                maxLength={50}
                                value={edit.name}
                                disabled={savingEdit}
                                aria-label={`Nama baru untuk ${c.name}`}
                                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') setEdit(null);
                                }}
                              />
                            ) : (
                              <strong>{c.name}</strong>
                            )}
                          </td>
                          <td className="num">
                            {used ? (
                              <button type="button" className="ad-link ad-link-btn" title="Tampilkan destinasi kategori ini" onClick={() => onPick(c.id)}>
                                {c.total.toLocaleString('id-ID')}
                              </button>
                            ) : (
                              <span className="ad-muted">0</span>
                            )}
                          </td>
                          <td className="actions">
                            {editing ? (
                              <>
                                <button type="button" className="ad-icon-btn" title="Simpan" aria-label="Simpan nama" onClick={saveEdit} disabled={savingEdit}>
                                  <Check size={15} />
                                </button>
                                <button type="button" className="ad-icon-btn" title="Batal" aria-label="Batal ubah" onClick={() => setEdit(null)} disabled={savingEdit}>
                                  <X size={15} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="ad-icon-btn" title="Ubah nama" aria-label={`Ubah nama ${c.name}`} onClick={() => setEdit({ id: c.id, name: c.name })}>
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="ad-icon-btn danger"
                                  disabled={used}
                                  title={used ? `Masih dipakai ${c.total} destinasi` : `Hapus ${c.name}`}
                                  aria-label={used ? `${c.name} tidak bisa dihapus, masih dipakai ${c.total} destinasi` : `Hapus ${c.name}`}
                                  onClick={() => setToDelete(c)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus kategori ini?"
        confirmLabel="Ya, hapus kategori"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={toDelete && <p>Kategori <b>{toDelete.name}</b> akan dihapus. Tidak ada destinasi yang memakainya.</p>}
      />
    </>
  );
}
