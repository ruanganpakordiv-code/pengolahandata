// Helper login: tanda tangan & verifikasi cookie sesi.
// Nama file/folder diawali "_" supaya TIDAK dianggap route oleh Cloudflare Pages
// Functions (hanya file yang meng-export onRequestGet/Post/dst yang jadi route).
// Dipakai oleh functions/_middleware.js, functions/api/login.js, functions/api/logout.js

const COOKIE_NAME = "session";

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(bytes) {
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// exp (timestamp ms) ditandatangani pakai HMAC-SHA256, dikirim sebagai "exp.signature".
// Tidak menyimpan sesi di server (stateless) -- cukup verifikasi tanda tangan + kedaluwarsa.
export async function createSessionCookie(secret, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const exp = Date.now() + maxAgeSeconds * 1000;
  const payload = String(exp);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const token = payload + "." + toBase64Url(new Uint8Array(sig));
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isValidSession(request, secret) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(COOKIE_NAME + "=([^;]+)"));
  if (!match) return false;
  const token = decodeURIComponent(match[1]);
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const exp = Number(payload);
  if (!exp || Number.isNaN(exp) || Date.now() > exp) return false;
  try {
    const key = await hmacKey(secret);
    const sig = fromBase64Url(sigB64);
    return await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payload));
  } catch (e) {
    return false;
  }
}

// Perbandingan waktu-konstan sederhana, supaya durasi cek password tidak membocorkan
// informasi lewat timing attack.
export function constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
