import { generateSecret, generate, verify } from "otplib";
import { encryptString, decryptString } from "./secretbox";

export const MFA_COOKIE = "ma_mfa";
export { generateSecret };

export async function encryptMfa(secret: string, value: string) {
  return encryptString("staff-mfa:" + secret, value);
}
export async function decryptMfa(secret: string, value: string) {
  return decryptString("staff-mfa:" + secret, value);
}
export async function recoveryHash(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toUpperCase()));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
}
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  });
}
export async function verifyTotp(secret: string, token: string) {
  if (!/^\d{6}$/.test(token)) return null;
  const now = Math.floor(Date.now() / 1000);
  for (const step of [Math.floor(now / 30), Math.floor(now / 30) - 1, Math.floor(now / 30) + 1]) {
    const result = await verify({ secret, token, epoch: step * 30 });
    if (result.valid) return step;
  }
  return null;
}
export { generate };
