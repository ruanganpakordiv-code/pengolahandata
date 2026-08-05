// PUT    /api/laporan/:id -> perbarui metadata + ganti seluruh kejadian (dipakai "Proses Ulang")
// PATCH  /api/laporan/:id -> ubah HANYA field is_rekap (toggle manual, tanpa reclassify/ubah kejadian)
// DELETE /api/laporan/:id -> hapus satu laporan beserta seluruh kejadiannya
//
// Body PUT yang diharapkan (sama seperti POST /api/laporan, tanpa field 'id' di dalam laporan):
// {
//   laporan: { nomor_lhp, tanggal, kecamatan, tahapan_diawasi, nama_pengawas, jabatan_pengawas, is_rekap },
//   kejadian: [ { indicator_no, kecamatan, desa, catatan }, ... ]  // boleh kosong; menggantikan semua kejadian lama
// }
// Body PATCH yang diharapkan: { is_rekap: true|false }

export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const body = await request.json();
    const lap = body.laporan || {};
    const kejadianList = body.kejadian || [];

    const statements = [
      env.DB.prepare(
        `UPDATE laporan SET
           nomor_lhp = ?, tanggal = ?, kecamatan = ?, tahapan_diawasi = ?,
           nama_pengawas = ?, jabatan_pengawas = ?, is_rekap = ?, processed_at = ?
         WHERE id = ?`
      ).bind(
        lap.nomor_lhp || null,
        lap.tanggal || null,
        lap.kecamatan || null,
        lap.tahapan_diawasi || null,
        lap.nama_pengawas || null,
        lap.jabatan_pengawas || null,
        lap.is_rekap ? 1 : 0,
        new Date().toISOString(),
        params.id
      ),
      env.DB.prepare("DELETE FROM kejadian WHERE laporan_id = ?").bind(params.id)
    ];

    kejadianList.forEach((k, idx) => {
      const kejadianId = `${params.id}_r${Date.now()}_${idx}`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO kejadian (id, laporan_id, indicator_no, kecamatan, desa, catatan)
           VALUES (?,?,?,?,?,?)`
        ).bind(
          kejadianId,
          params.id,
          k.indicator_no || null,
          k.kecamatan || lap.kecamatan || null,
          k.desa || null,
          k.catatan || null
        )
      );
    });

    await env.DB.batch(statements);
    return new Response(JSON.stringify({ ok: true, kejadian_count: kejadianList.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  try {
    const body = await request.json();
    await env.DB.prepare("UPDATE laporan SET is_rekap = ? WHERE id = ?")
      .bind(body.is_rekap ? 1 : 0, params.id)
      .run();
    return new Response(JSON.stringify({ ok: true, is_rekap: !!body.is_rekap }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

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
