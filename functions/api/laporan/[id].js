// DELETE /api/laporan/:id -> hapus satu laporan beserta seluruh kejadiannya

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM kejadian WHERE laporan_id = ?").bind(params.id),
      env.DB.prepare("DELETE FROM laporan WHERE id = ?").bind(params.id)
    ]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
