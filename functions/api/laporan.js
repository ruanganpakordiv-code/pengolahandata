// GET  /api/laporan  -> { laporan: [...], kejadian: [...] } (semua data, digabung di frontend)
// POST /api/laporan  -> simpan satu laporan baru beserta daftar kejadiannya
//
// Body POST yang diharapkan:
// {
//   laporan: { id, fileName, processedAt, nomor_lhp, tanggal, kecamatan, tahapan_diawasi, nama_pengawas, jabatan_pengawas },
//   kejadian: [ { indicator_no, kecamatan, desa, catatan }, ... ]  // boleh kosong
// }

export async function onRequestGet(context) {
  const { env } = context;
  const laporanRes = await env.DB.prepare("SELECT * FROM laporan ORDER BY processed_at DESC").all();
  const kejadianRes = await env.DB.prepare("SELECT * FROM kejadian").all();

  const laporan = laporanRes.results.map(r => ({
    id: r.id,
    fileName: r.file_name,
    processedAt: r.processed_at,
    nomor_lhp: r.nomor_lhp,
    tanggal: r.tanggal,
    kecamatan: r.kecamatan,
    tahapan_diawasi: r.tahapan_diawasi,
    nama_pengawas: r.nama_pengawas,
    jabatan_pengawas: r.jabatan_pengawas
  }));

  const kejadian = kejadianRes.results.map(k => ({
    id: k.id,
    laporan_id: k.laporan_id,
    indicator_no: k.indicator_no,
    kecamatan: k.kecamatan,
    desa: k.desa,
    catatan: k.catatan
  }));

  return new Response(JSON.stringify({ laporan, kejadian }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const lap = body.laporan;
    const kejadianList = body.kejadian || [];

    if (!lap || !lap.id) {
      return new Response(JSON.stringify({ error: "Field 'laporan.id' wajib diisi" }), { status: 400 });
    }

    const statements = [];

    statements.push(
      env.DB.prepare(
        `INSERT INTO laporan
          (id, file_name, processed_at, nomor_lhp, tanggal, kecamatan, tahapan_diawasi, nama_pengawas, jabatan_pengawas)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        lap.id,
        lap.fileName || null,
        lap.processedAt || new Date().toISOString(),
        lap.nomor_lhp || null,
        lap.tanggal || null,
        lap.kecamatan || null,
        lap.tahapan_diawasi || null,
        lap.nama_pengawas || null,
        lap.jabatan_pengawas || null
      )
    );

    kejadianList.forEach((k, idx) => {
      const kejadianId = `${lap.id}_k${idx}`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO kejadian (id, laporan_id, indicator_no, kecamatan, desa, catatan)
           VALUES (?,?,?,?,?,?)`
        ).bind(
          kejadianId,
          lap.id,
          k.indicator_no || null,
          k.kecamatan || lap.kecamatan || null,
          k.desa || null,
          k.catatan || null
        )
      );
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    const isDuplicate = /UNIQUE constraint failed/i.test(e.message || "");
    return new Response(JSON.stringify({
      error: isDuplicate ? "File dengan nama ini sudah pernah diunggah sebelumnya" : e.message,
      duplicate: isDuplicate
    }), {
      status: isDuplicate ? 409 : 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
