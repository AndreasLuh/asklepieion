// Passwortsperre als Sichtschutz. Gespeichert ist nur salt + hash (gate-config.js).
const SCHLUESSEL = "asklepieion.frei";

export async function hashPassword(passwort, salt) {
  const daten = new TextEncoder().encode(salt + ":" + String(passwort).trim());
  const digest = await crypto.subtle.digest("SHA-256", daten);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function checkPassword(passwort, { salt, hash }) {
  return (await hashPassword(passwort, salt)) === hash;
}

// wert: z. B. der aktuelle Hash, damit ein neues Passwort alte Freigaben aufhebt
export function isUnlocked(storage, wert = "1") {
  try { return storage?.getItem(SCHLUESSEL) === wert; } catch { return false; }
}

export function unlock(storage, wert = "1") {
  try { storage?.setItem(SCHLUESSEL, wert); } catch { /* dann fragt die Seite beim nächsten Öffnen erneut */ }
}
