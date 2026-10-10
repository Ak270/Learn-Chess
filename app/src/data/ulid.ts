// Minimal ULID (Crockford base32, 48-bit time + 80-bit randomness). Sortable by creation time.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(
  now: number = Date.now(),
  rand: () => number = () => crypto.getRandomValues(new Uint8Array(1))[0] / 256,
): string {
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let r = '';
  for (let i = 0; i < 16; i++) r += ALPHABET[Math.floor(rand() * 32)];
  return time + r;
}
