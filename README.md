# Sistem Pengolahan Data Hasil Pengawasan

Aplikasi pengolahan Laporan Hasil Pengawasan Pemilu (Form A) untuk Bawaslu
Kabupaten Malang, berbasis **61 indikator IKP (Indeks Kerawanan Pemilu)**.
Unggah PDF Form A → teks diekstrak di browser → diklasifikasikan langsung ke
Gemini API (dipanggil dari browser, bukan dari server) → tersimpan di
Cloudflare D1 → tampil di 4 tab: Input LHP, Peta Kecamatan, Ringkasan Hasil,
dan Infografis.

## Arsitektur

- **Frontend**: file statis di `public/` (HTML/CSS/JS biasa, tanpa build
  step), memakai Leaflet (peta), pdf.js (ekstraksi teks PDF), dan Chart.js
  (infografis), di-hosting oleh **Cloudflare Pages**.
- **Klasifikasi AI**: dipanggil **langsung dari browser pengguna** ke Gemini
  API — kunci API disimpan di `localStorage` browser (bukan di server),
  sehingga bisa diganti kapan saja lewat kotak input di halaman Tab 1 tanpa
  perlu redeploy. Bisa isi lebih dari satu kunci (pisahkan koma) — sistem
  otomatis pindah ke kunci berikutnya kalau salah satu kena limit kuota.
- **Backend**: Cloudflare Pages Functions di `functions/api/laporan.js` dan
  `functions/api/laporan/[id].js` — HANYA untuk menyimpan/mengambil/menghapus
  data ke database, tidak lagi memanggil AI apa pun.
- **Database**: **Cloudflare D1**, dua tabel:
  - `laporan` — metadata satu LHP (nomor, tanggal, kecamatan, pengawas, dst)
  - `kejadian` — satu baris per temuan/pelanggaran (indikator IKP + kecamatan
    + desa), terhubung ke `laporan` lewat `laporan_id`
- **Repository**: GitHub — Cloudflare Pages terhubung otomatis, tiap
  `git push` ke `main` men-deploy ulang.

## Struktur 4 Tab

1. **Input LHP** — kotak isi Gemini API Key, unggah PDF, dan tabel
   rekapitulasi otomatis (meniru sheet REKAP pada file Excel IKP) yang
   terus bertambah seiring makin banyak PDF diproses.
2. **Peta Kecamatan** — choropleth 33 kecamatan, makin merah = makin banyak
   kejadian (skala warna otomatis menyesuaikan seiring data bertambah). Klik
   kecamatan → ringkasan singkat → tombol detail per indikator.
3. **Ringkasan Hasil** — template ringkasan naratif yang bisa disunting
   admin (placeholder sementara, formatnya masih akan disesuaikan).
4. **Infografis** — sebaran kejadian per Dimensi, per Kecamatan (top 15),
   per Sub Dimensi, dan 10 indikator paling sering terjadi.

## Langkah setup

### 1. Push proyek ini ke GitHub

```bash
git init
git add .
git commit -m "Inisialisasi Sistem Pengolahan Data Hasil Pengawasan"
git branch -M main
git remote add origin https://github.com/<username>/<nama-repo>.git
git push -u origin main
```

### 2. Install & login Wrangler (CLI Cloudflare)

```bash
npm install -g wrangler
wrangler login
```

### 3. Buat database D1

```bash
wrangler d1 create db_pengawasan
```

Salin `database_id` yang muncul ke `wrangler.toml`, menggantikan
`GANTI_DENGAN_DATABASE_ID_ANDA`. **Penting**: `binding` harus tetap `"DB"`
persis (huruf besar semua) — itu nama variabel yang dipakai kode, bukan nama
database aslinya.

### 4. Jalankan skema database

```bash
wrangler d1 execute db_pengawasan --file=./schema.sql --remote
```

Skema ini membuat tabel `laporan` dan `kejadian` (menghapus tabel `reports`
versi lama kalau ada).

### 5. Buat proyek Cloudflare Pages & hubungkan ke GitHub

Dashboard Cloudflare → **Workers & Pages** → **Create application** →
**Pages** → **Connect to Git** → pilih repo ini.
- Build command: kosongkan
- Build output directory: `public`

### 6. Bind database D1 ke proyek Pages

**Kalau proyek terhubung ke GitHub**, binding **wajib** diatur lewat
`wrangler.toml` (bukan lewat dashboard — dashboard akan menampilkan pesan
"Bindings are being managed through wrangler.toml" dan menolak perubahan
manual). Jadi cukup pastikan `wrangler.toml` sudah benar (langkah 3), lalu
deploy ulang.

### 7. Isi Gemini API Key

**Tidak perlu di-setting di Cloudflare sama sekali.** Buka website yang
sudah jadi, di Tab 1 ("Input LHP") ada kotak "Gemini API Key" di bagian atas
— tempel kunci Anda di situ (dari
[aistudio.google.com/apikey](https://aistudio.google.com/apikey), gratis).
Kunci tersimpan di browser (localStorage), tidak pernah dikirim ke server
mana pun selain langsung ke Google.

Kalau kuota satu kunci habis, tinggal ganti/tambahkan kunci baru di kotak
yang sama — tidak perlu redeploy apa pun. Bisa isi beberapa kunci sekaligus
dipisah koma; sistem otomatis mencoba kunci berikutnya kalau salah satu kena
limit.

### 8. Setup login (WAJIB, situs terkunci total tanpa ini)

Sejak update ini, seluruh situs (termasuk file statis dan semua `/api/*`)
dikunci lewat `functions/_middleware.js` — tidak ada satu pun halaman yang
bisa diakses tanpa login, termasuk oleh mesin pencari/orang luar. Wajib set
dua environment variable ini dulu, kalau tidak situs akan menampilkan pesan
error "Autentikasi belum dikonfigurasi":

Dashboard Cloudflare → **Workers & Pages** → proyek ini → **Settings** →
**Environment variables** → tambahkan untuk **Production** (dan **Preview**
kalau dipakai):

| Nama | Nilai | Tipe |
|---|---|---|
| `AUTH_PASSWORD` | password yang ingin dipakai untuk login | **Encrypt** (secret) |
| `AUTH_SECRET` | string acak panjang, mis. hasil `openssl rand -hex 32` — dipakai menandatangani sesi, JANGAN sama dengan `AUTH_PASSWORD` | **Encrypt** (secret) |

Setelah disimpan, **redeploy** (push commit baru, atau tombol "Retry
deployment" di dashboard) supaya environment variable-nya terbaca. Sesi login
berlaku 7 hari per browser (cookie `httpOnly`), lalu diminta login ulang.
Tombol "Keluar" ada di pojok kanan atas aplikasi.

### 9. Migrasi database untuk folder R2 otomatis

PDF sekarang otomatis disimpan ke folder R2 bertingkat sesuai kategori
pengawas (ditentukan dari pola nama file Form A):

- Tidak ada segmen kecamatan/desa (Bawaslu Kab.) → folder **`Form A Kabupaten`**
- Ada segmen kecamatan saja (Panwaslu Kec.) → folder **`Kecamatan <Nama>`**
- Ada segmen kecamatan + desa, tanpa TPS (PKD) → folder **`Kecamatan <Nama>/Desa <Nama>`**
- Ada segmen kecamatan + desa + TPS, mis. `..._TPS01_...` (PKD tingkat TPS)
  → folder **`Kecamatan <Nama>/Desa <Nama>/TPS <NNN>`**

Penulisan angka TPS di nama file boleh macam-macam (`TPS01`, `TPS1`, `TPS001`)
— semua otomatis dinormalisasi jadi 3 digit (`TPS 001`) supaya tidak dianggap
TPS berbeda hanya karena beda cara penulisan angka nolnya.

Kalau database D1 kamu sudah pernah dijalankan sebelumnya (bukan instalasi
baru), jalankan migrasi ini SEKALI supaya tabel `laporan` punya kolom baru
`r2_key` (path folder PDF-nya) — tidak menghapus data yang sudah ada:

```bash
wrangler d1 execute db_pengawasan --file=./migrations/0001_add_r2_key.sql --remote
```

Laporan lama yang PDF-nya sempat gagal tersimpan (karena bug binding R2
sebelumnya) tetap perlu diunggah ulang manual — fitur folder otomatis ini
hanya berlaku untuk PDF yang diunggah setelah migrasi & deploy ini.

### 10. Deploy

Push ke `main` otomatis men-deploy. Atau paksa manual:

```bash
wrangler pages deploy public --project-name=<nama-proyek-anda>
```

## Menjalankan secara lokal

```bash
wrangler pages dev public --d1=DB
```

(Tidak perlu binding untuk API key lagi karena dipanggil langsung dari
browser.)

## Struktur folder

```
├── public/
│   ├── index.html                     # UI 4 tab: Input, Peta, Ringkasan, Infografis
│   ├── login.html                     # halaman login (satu-satunya jalur masuk tanpa sesi)
│   └── data/
│       ├── kecamatan-malang.geojson   # 33 kecamatan Kabupaten Malang (disederhanakan)
│       ├── ikp-indikator.json         # 61 indikator IKP (dimensi/sub dimensi/indikator)
│       └── kecamatan-desa.json        # daftar desa per kecamatan
├── functions/
│   ├── _middleware.js                 # gerbang login untuk SEMUA request (situs + API)
│   ├── _lib/
│   │   └── auth.js                    # helper tanda tangan/verifikasi cookie sesi
│   └── api/
│       ├── login.js                   # POST -> cek password, set cookie sesi
│       ├── logout.js                  # POST -> hapus cookie sesi
│       ├── laporan.js                 # GET (semua laporan+kejadian) / POST (simpan baru)
│       ├── laporan/[id].js            # PUT/PATCH/DELETE satu laporan beserta kejadiannya
│       ├── pdf/[id].js                # PUT/GET/DELETE PDF asli ke/dari R2 (folder otomatis)
│       └── kejadian/[id].js           # PATCH -> koreksi manual indicator_no satu kejadian
├── migrations/
│   └── 0001_add_r2_key.sql             # migrasi tambah kolom r2_key (utk DB yang sudah ada)
├── schema.sql                          # skema tabel D1: laporan + kejadian
├── wrangler.toml                       # konfigurasi Cloudflare (D1 + R2 binding)
└── README.md
```

## Catatan

- Daftar kecamatan & 61 indikator IKP diekstrak dari file Excel
  "PEMETAAN KERAWANAN PEMILIHAN BERDASARKAN INDIKATOR IKP" yang menjadi
  acuan format aplikasi ini.
- Tab "Ringkasan Hasil" formatnya masih placeholder sementara — bisa
  disunting langsung dari UI (Tab 3), dan mendukung beberapa placeholder
  otomatis: `{{total_laporan}}`, `{{total_kejadian}}`,
  `{{kecamatan_terbanyak}}`, `{{dimensi_teratas}}`.
- Karena API key disimpan per-browser (localStorage), tiap pengguna/perangkat
  yang membuka situs ini perlu mengisi kunci masing-masing sekali saja.
