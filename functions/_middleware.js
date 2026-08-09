// Middleware Cloudflare Pages Functions -- berjalan untuk SETIAP request ke situs ini
// (termasuk file statis seperti index.html, /data/*.json, dan semua /api/*), karena
// ada file _middleware.js di root functions/. Ini gerbang login satu-satunya untuk
// seluruh aplikasi -- tanpa sesi valid, tidak ada apa pun yang bisa diakses.
//
// Wajib di-set dulu di Cloudflare Pages -> Settings -> Environment variables (Production
// & Preview), sebagai "Secret":
//   AUTH_PASSWORD  = password yang dipakai untuk login
//   AUTH_SECRET    = string acak panjang untuk menandatangani sesi (bebas, mis. hasil
//                     `openssl rand -hex 32`) -- JANGAN sama dengan AUTH_PASSWORD

import { isValidSession } from "./_lib/auth.js";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.has(url.pathname)) {
    return next();
  }

  if (!env.AUTH_PASSWORD || !env.AUTH_SECRET) {
    return new Response(
      "Autentikasi belum dikonfigurasi.\n\n" +
      "Set environment variable AUTH_PASSWORD dan AUTH_SECRET di Cloudflare Pages -> " +
      "Settings -> Environment variables, lalu redeploy.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const valid = await isValidSession(request, env.AUTH_SECRET);
  if (valid) {
    return next();
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Belum login" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  return Response.redirect(new URL("/login", url).toString(), 302);
}
