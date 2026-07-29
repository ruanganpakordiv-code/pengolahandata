-- Skema database untuk Sistem Pengolahan Data Hasil Pengawasan
-- Model data mengikuti struktur IKP (Indeks Kerawanan Pemilu): 61 indikator,
-- setiap LHP bisa memuat 0 atau lebih "kejadian" (setiap kejadian = satu indikator
-- yang terjadi di satu desa tertentu).
--
-- Dijalankan sekali saat setup D1:
--   wrangler d1 execute db_pengawasan --file=./schema.sql --remote

DROP TABLE IF EXISTS kejadian;
DROP TABLE IF EXISTS laporan;
DROP TABLE IF EXISTS reports; -- nama tabel lama (skema versi sebelumnya), dibersihkan

CREATE TABLE laporan (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  processed_at TEXT,
  nomor_lhp TEXT,
  tanggal TEXT,
  kecamatan TEXT,
  tahapan_diawasi TEXT,
  nama_pengawas TEXT,
  jabatan_pengawas TEXT
);

CREATE TABLE kejadian (
  id TEXT PRIMARY KEY,
  laporan_id TEXT,
  indicator_no INTEGER,     -- 1..61, sesuai daftar indikator IKP
  kecamatan TEXT,
  desa TEXT,
  catatan TEXT
);

CREATE INDEX idx_kejadian_laporan ON kejadian(laporan_id);
CREATE INDEX idx_kejadian_kecamatan ON kejadian(kecamatan);
CREATE INDEX idx_kejadian_indicator ON kejadian(indicator_no);
