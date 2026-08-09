// POST /api/logout -> hapus cookie sesi.

import { clearSessionCookie } from "../_lib/auth.js";

export async function onRequestPost(context) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() }
  });
}
