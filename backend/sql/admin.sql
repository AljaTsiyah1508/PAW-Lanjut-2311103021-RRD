-- =====================================================
-- Dashboard admin: perubahan database (OPSIONAL)
-- =====================================================
-- Fitur admin TIDAK butuh tabel atau kolom baru; semua endpoint jalan tanpa file ini.
-- File ini hanya menambah indeks agar grafik pertumbuhan dan daftar
-- "terbaru" tetap cepat saat data bertambah. Tidak ada data yang diubah atau dihapus.
--
-- Cara menjalankan (sekali saja):
--   mysql -u <user> -p rrd < backend/sql/admin.sql
-- atau buka di HeidiSQL / phpMyAdmin (Laragon), pilih database `rrd`, lalu jalankan.
--
-- Kalau muncul "Duplicate key name", indeks itu sudah ada; aman diabaikan.
-- =====================================================

USE rrd;

-- Grafik ulasan per bulan + daftar ulasan terbaru (ORDER BY created_at DESC)
CREATE INDEX idx_reviews_created ON reviews (created_at);

-- Grafik user per bulan + daftar user terbaru
CREATE INDEX idx_users_created ON users (created_at);

-- Filter "sumber" di Kelola Destinasi
CREATE INDEX idx_destinations_source ON destinations (source);

-- Untuk membatalkan:
--   DROP INDEX idx_reviews_created ON reviews;
--   DROP INDEX idx_users_created ON users;
--   DROP INDEX idx_destinations_source ON destinations;
