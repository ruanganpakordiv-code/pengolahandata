// PUT    /api/laporan/:id -> perbarui metadata + ganti seluruh kejadian (dipakai "Proses Ulang")
// PATCH  /api/laporan/:id -> koreksi manual SEBAGIAN field, tanpa reclassify/ubah kejadian.
//                             Body boleh berisi salah satu atau kombinasi:
//                             { is_rekap?: true|false, kecamatan?: string, nomor_lhp?: string }
//                             Kalau "kecamatan" dikirim, ikut di-cascade ke semua baris
//                             kejadian milik laporan ini (supaya peta/matrix/rekap tetap
//                             konsisten dengan koreksi manual di tabel "Daftar Laporan Tersimpan").
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
    const statements = [];

    if (typeof body.is_rekap !== "undefined") {
      statements.push(
        env.DB.prepare("UPDATE laporan SET is_rekap = ? WHERE id = ?")
          .bind(body.is_rekap ? 1 : 0, params.id)
      );
    }
    if (typeof body.kecamatan === "string") {
      const kec = body.kecamatan.trim();
      statements.push(
        env.DB.prepare("UPDATE laporan SET kecamatan = ? WHERE id = ?").bind(kec, params.id)
      );
      // cascade -- kejadian.kecamatan dipakai langsung oleh peta/matrix/rekap, jangan sampai
      // laporan sudah dikoreksi tapi kejadiannya masih mengacu ke nama kecamatan yang lama
      statements.push(
        env.DB.prepare("UPDATE kejadian SET kecamatan = ? WHERE laporan_id = ?").bind(kec, params.id)
      );
    }
    if (typeof body.nomor_lhp === "string") {
      statements.push(
        env.DB.prepare("UPDATE laporan SET nomor_lhp = ? WHERE id = ?").bind(body.nomor_lhp.trim(), params.id)
      );
    }

    if (!statements.length) {
      return new Response(JSON.stringify({ error: "Tidak ada field yang dikirim untuk diperbarui" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    await env.DB.batch(statements);
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
