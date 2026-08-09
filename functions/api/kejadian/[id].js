// PATCH /api/kejadian/:id -> koreksi manual satu kejadian, dipakai saat pengguna
// memindahkan kejadian ke kategori indikator lain lewat drawer detail di Tab 1/2.
// Body: { indicator_no: <1-61> }  (field lain diabaikan untuk sekarang, cukup
// pindah kategori indikator saja -- desa/catatan tetap seperti hasil ekstraksi awal).

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  try {
    const body = await request.json();
    const indicatorNo = Number(body.indicator_no);
    if (!indicatorNo || indicatorNo < 1 || indicatorNo > 61) {
      return new Response(JSON.stringify({ error: "indicator_no tidak valid (harus 1-61)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const result = await env.DB.prepare("UPDATE kejadian SET indicator_no = ? WHERE id = ?")
      .bind(indicatorNo, params.id)
      .run();
    if (!result.meta || result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: "Kejadian tidak ditemukan" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true, indicator_no: indicatorNo }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
