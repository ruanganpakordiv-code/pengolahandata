// PUT /api/pdf/:id  -> simpan PDF asli (body = raw bytes) ke R2, key = id
// GET /api/pdf/:id  -> ambil kembali PDF asli dari R2 (dipakai saat "Proses Ulang")
//
// Dipanggil dari browser setelah satu laporan berhasil diklasifikasi & disimpan
// ke D1 (lihat index.html -> uploadPdfToR2()), supaya PDF aslinya tersedia lagi
// nanti tanpa perlu user upload ulang.

export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const contentType = request.headers.get('Content-Type') || 'application/pdf';
    const bytes = await request.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      return new Response(JSON.stringify({ error: "Body PDF kosong" }), { status: 400 });
    }
    await env.PDF_BUCKET.put(params.id, bytes, {
      httpMetadata: { contentType }
    });
    return new Response(JSON.stringify({ ok: true, size: bytes.byteLength }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const obj = await env.PDF_BUCKET.get(params.id);
  if (!obj) {
    return new Response(JSON.stringify({ error: "PDF tidak ditemukan di penyimpanan (mungkin diunggah sebelum fitur ini aktif)" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/pdf",
      "Cache-Control": "private, max-age=0"
    }
  });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    await env.PDF_BUCKET.delete(params.id);
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
