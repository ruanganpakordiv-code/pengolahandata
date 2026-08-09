// PUT    /api/pdf/:id?folder=<path folder>  -> simpan PDF asli ke R2 di dalam folder
//                                               (boleh bertingkat, dipisah "/"), key =
//                                               "<folder>/<id>.pdf". Path lengkapnya
//                                               (r2_key) dicatat ke D1 supaya GET/DELETE
//                                               bisa menemukannya lagi.
// GET    /api/pdf/:id                        -> ambil kembali PDF asli dari R2
//                                               (dipakai saat "Proses Ulang")
// DELETE /api/pdf/:id                        -> hapus PDF dari R2
//
// Folder ditentukan oleh CLIENT (index.html -> computeR2FolderFromFileName()) dari pola
// nama file Form A:
//   - Tidak ada segmen kecamatan/desa (mis. "35.07_malang-form_a-106782-v004")
//     -> folder "Form A Kabupaten" (Bawaslu Kab.)
//   - Ada segmen kecamatan tapi tidak ada segmen desa
//     -> folder "Kecamatan <Nama>" (Panwaslu Kec.)
//   - Ada segmen kecamatan DAN desa (tanpa TPS)
//     -> folder "Kecamatan <Nama>/Desa <Nama>" (PKD)
//   - Ada segmen kecamatan, desa, DAN TPS (mis. "..._TPS01_...")
//     -> folder "Kecamatan <Nama>/Desa <Nama>/TPS <NNN>" (PKD tingkat TPS)
// Nama tiap segmen folder disanitasi di server sebelum dipakai sebagai R2 key, supaya
// tidak bisa dipakai untuk path traversal atau karakter aneh lainnya.

function sanitizeFolder(raw) {
  if (!raw) return "Form A Lainnya";
  // Folder boleh bertingkat (dipisah "/", mis. "Kecamatan Pujon/Desa Wiyurejo/TPS 001").
  // Tiap segmen disanitasi terpisah: buang "..", backslash, dan karakter selain
  // huruf/angka/spasi/titik/strip/kurung -- supaya tidak bisa dipakai untuk path
  // traversal atau bikin key R2 yang aneh.
  const segments = String(raw)
    .split("/")
    .map(seg =>
      seg
        .replace(/\.\./g, "")
        .replace(/\\/g, "-")
        .replace(/[^\p{L}\p{N} .()\-]/gu, "")
        .trim()
        .slice(0, 60)
    )
    .filter(seg => seg.length > 0);
  const joined = segments.join("/").slice(0, 200);
  return joined || "Form A Lainnya";
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const contentType = request.headers.get("Content-Type") || "application/pdf";
    const bytes = await request.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      return new Response(JSON.stringify({ error: "Body PDF kosong" }), { status: 400 });
    }
    const url = new URL(request.url);
    const folder = sanitizeFolder(url.searchParams.get("folder"));
    const r2Key = `${folder}/${params.id}.pdf`;

    await env.PDF_BUCKET.put(r2Key, bytes, {
      httpMetadata: { contentType }
    });

    // Catat path lengkapnya supaya GET/DELETE bisa menemukan file ini lagi nanti.
    // Best-effort: kalau baris laporan belum ada di D1 (urutan panggilan tidak biasa),
    // jangan gagalkan upload PDF-nya.
    try {
      await env.DB.prepare("UPDATE laporan SET r2_key = ? WHERE id = ?").bind(r2Key, params.id).run();
    } catch (dbErr) {
      console.warn("Gagal mencatat r2_key ke D1 untuk", params.id, dbErr.message);
    }

    return new Response(JSON.stringify({ ok: true, size: bytes.byteLength, r2_key: r2Key }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function resolveR2Key(env, id) {
  try {
    const row = await env.DB.prepare("SELECT r2_key FROM laporan WHERE id = ?").bind(id).first();
    if (row && row.r2_key) return row.r2_key;
  } catch (e) {
    console.warn("Gagal membaca r2_key dari D1 untuk", id, e.message);
  }
  return null;
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const r2Key = await resolveR2Key(env, params.id);

  // Coba path folder tersimpan dulu; kalau tidak ada (laporan lama sebelum fitur folder
  // ini ada), fallback ke key lama yang datar (flat key = id, tanpa folder).
  const candidates = [r2Key, params.id].filter(Boolean);
  for (const key of candidates) {
    const obj = await env.PDF_BUCKET.get(key);
    if (obj) {
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "application/pdf",
          "Cache-Control": "private, max-age=0"
        }
      });
    }
  }

  return new Response(JSON.stringify({ error: "PDF tidak ditemukan di penyimpanan (mungkin diunggah sebelum fitur ini aktif)" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    const r2Key = await resolveR2Key(env, params.id);
    // Hapus keduanya (kalau ada) — path folder baru dan kemungkinan sisa key lama yang datar.
    const keys = [r2Key, params.id].filter(Boolean);
    await Promise.all(keys.map(k => env.PDF_BUCKET.delete(k).catch(() => {})));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    // Tidak fatal — dipanggil sebagai pembersihan best-effort saat laporan dihapus
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
