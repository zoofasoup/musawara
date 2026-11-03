// AES-GCM encryption for the Meta token when stored in D1 (admin pastes it in settings).
// Key is derived from JWT_SECRET so no extra secret is needed.

async function getKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("meta-token:" + secret));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(secret: string, plaintext: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext))
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptString(secret: string, encoded: string): Promise<string> {
  const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const key = await getKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf.slice(0, 12) as BufferSource },
    key,
    buf.slice(12) as BufferSource
  );
  return new TextDecoder().decode(pt);
}
