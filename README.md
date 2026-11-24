# Nusantara Review

Platform ulasan dan rating destinasi wisata Indonesia. Wisatawan menulis ulasan, memberi rating, dan mengunggah foto. Pengelola destinasi mengelola informasi tempatnya dan menanggapi ulasan secara resmi. Admin memoderasi ulasan, destinasi, dan pengguna.

Data awal berisi **1.311 destinasi** dari seluruh Indonesia (Wikidata/Wikipedia), lengkap dengan foto, deskripsi, dan alamat dari OpenStreetMap.

## Fitur

**Wisatawan**
- Jelajah destinasi dengan pencarian, filter kategori/rating, dan urutan
- Rekomendasi berdasarkan minat
- Tulis, ubah, dan hapus ulasan beserta rating dan foto
- Tandai ulasan "Membantu", laporkan ulasan yang melanggar
- Simpan destinasi ke wishlist, notifikasi, profil publik

**Pengelola destinasi** (portal mitra)
- Dashboard: rata-rata rating, tren rating 6 bulan, ulasan terbaru
- Kelola destinasi milik sendiri: info, alamat (cari lokasi otomatis dari peta), harga, jam buka, galeri foto
- Ulasan & Rating: filter, tanggapan resmi dengan template cepat, ekspor CSV

**Admin**
- Dashboard statistik dan grafik
- Moderasi ulasan (laporan pengguna, rating rendah, ulasan berfoto)
- Kelola destinasi & mitra, kategori, dan pengguna

## Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | React 19, Vite, React Router, Axios, lucide-react |
| Backend | Node.js, Express 5, mysql2, JWT, bcrypt, multer |
| Database | MySQL 8 |
| Data peta | Nominatim (OpenStreetMap), tanpa API key |

## Kebutuhan

- [Node.js](https://nodejs.org) 20 atau lebih baru
- MySQL 8 (mis. lewat [Laragon](https://laragon.org) atau XAMPP)

## Cara menjalankan

### 1. Database

Impor file database (struktur + 1.311 destinasi, tanpa akun pengguna):

```bash
mysql -u root -p < backend/sql/database.sql
```

Atau buka `backend/sql/database.sql` di HeidiSQL / phpMyAdmin lalu jalankan. File ini membuat database `rrd`.

> Perhatian: bila database `rrd` sudah ada, tabel-tabelnya akan diganti.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Buka `.env`, isi password MySQL dan `JWT_SECRET`, lalu jalankan:

```bash
npm run dev               # atau: npm start
```

Backend berjalan di `http://localhost:5000`.

### 3. Frontend

Di terminal lain:

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173`.

### 4. Membuat akun admin

1. Daftar akun biasa lewat halaman **Daftar**.
2. Jadikan admin lewat MySQL:

   ```sql
   UPDATE rrd.users SET role = 'admin' WHERE email = 'email-anda@contoh.com';
   ```

3. Keluar lalu masuk lagi. Admin langsung diarahkan ke `/admin`.

Akun **pengelola** dibuat lewat halaman Masuk → kartu "Pengelola Destinasi Wisata?" (atau buka `/register?role=pengelola`). Admin dapat menautkan destinasi yang sudah ada ke akun pengelola di menu Kelola Destinasi & Mitra.

## Skrip data (opsional)

Jalankan dari folder `backend`:

| Perintah | Fungsi |
|---|---|
| `node src/scripts/syncWikidata.js 300` | Menambah destinasi baru dari Wikidata (tidak menimpa data yang ada) |
| `node src/scripts/enrichDestinations.js` | Melengkapi alamat, harga, dan jam buka yang kosong dari Wikidata/OpenStreetMap |
| `node src/scripts/resetPassword.js email@contoh.com` | Mengganti password satu akun |

Tambahkan `tes` di akhir untuk mencoba tanpa menyimpan, mis. `node src/scripts/enrichDestinations.js 20 tes`.

## Struktur folder

```
backend/
  sql/            database.sql (impor awal), admin.sql (indeks opsional)
  src/
    controllers/  admin/ pengelola/ wisatawan/ shared/
    routes/       admin/ pengelola/ wisatawan/ shared/
    services/     logika bersama (destinasi, galeri, laporan, tanggapan, peta)
    middleware/   auth, role, upload foto
    scripts/      impor & perawatan data
  uploads/        foto unggahan (dibuat otomatis, tidak ikut Git)
frontend/
  src/
    pages/        admin/ pengelola/ wisatawan/ auth/
    components/   common/ wisatawan/
    layouts/  routes/  styles/  utils/
```

Endpoint API: `/api/*` (publik & wisatawan), `/api/manage/*` (pengelola), `/api/admin/*` (admin).

## Catatan

- Harga tiket dan jam buka yang belum diisi pengelola ditampilkan sebagai **perkiraan** berdasarkan jenis tempat, dengan label jelas.
- Alamat backend di frontend diatur di `frontend/src/api/axios.js` dan `frontend/src/utils/helpers.js` (bawaan `http://localhost:5000`).

## Sumber data & lisensi data

- Destinasi, deskripsi, dan foto: [Wikidata](https://www.wikidata.org) & [Wikipedia](https://id.wikipedia.org) (CC BY-SA), foto dari [Wikimedia Commons](https://commons.wikimedia.org).
- Alamat, koordinat, dan sebagian jam buka: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
