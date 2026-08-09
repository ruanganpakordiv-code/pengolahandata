// POST /api/login  -> body: { password }. Kalau cocok dengan env.AUTH_PASSWORD,
// set cookie sesi (httpOnly, ditandatangani, berlaku 7 hari) dan balas { ok: true }.
// Route ini ada di daftar PUBLIC_PATHS di functions/_middleware.js supaya bisa
// diakses tanpa sudah login (kalau tidak, orang tidak akan pernah bisa login).

import { createSessionCookie, constantTimeEqual } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AUTH_PASSWORD || !env.AUTH_SECRET) {
    return new Response(JSON.stringify({ error: "Autentikasi belum dikonfigurasi di server." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const body = await request.json();
    const password = body && typeof body.password === "string" ? body.password : "";
    if (!password || !constantTimeEqual(password, env.AUTH_PASSWORD)) {
      return new Response(JSON.stringify({ error: "Password salah" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cookie = await createSessionCookie(env.AUTH_SECRET);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": cookie }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
