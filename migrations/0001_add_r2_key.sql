-- Migrasi: tambah kolom r2_key ke tabel laporan yang sudah ada.
-- Jalankan SEKALI, tidak menghapus data yang sudah ada:
--   wrangler d1 execute db_pengawasan --file=./migrations/0001_add_r2_key.sql --remote
--
-- Kolom ini menyimpan path folder PDF di R2 (mis. "Kecamatan Pujon Desa
-- Wiyurejo/lap_xxx.pdf"), ditentukan otomatis dari pola nama file saat upload.
-- Laporan lama yang PDF-nya sempat gagal tersimpan (sebelum bug binding R2
-- diperbaiki) akan tetap NULL di sini sampai kamu upload ulang PDF-nya.

ALTER TABLE laporan ADD COLUMN r2_key TEXT;
