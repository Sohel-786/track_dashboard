/**
 * Password generator for the admin reset dialog.
 *
 * Deliberately dependency-free and browser-safe: `src/lib/passwords.ts` pulls in
 * bcrypt and must never reach the client bundle, so the generator lives here.
 */

/**
 * Ambiguous glyphs are excluded on purpose. A reset password gets read aloud,
 * typed from a screenshot, or copied by hand, and `0/O` or `1/l/I` turn that
 * into a support request.
 */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*+-=?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Uniform index into `chars`, rejection-sampled so no character is favoured. */
function pick(chars: string): string {
  const limit = Math.floor(256 / chars.length) * chars.length;
  const buf = new Uint8Array(1);
  let value = limit;
  while (value >= limit) {
    crypto.getRandomValues(buf);
    value = buf[0];
  }
  return chars[value % chars.length];
}

function shuffle(chars: string[]): string[] {
  // Fisher-Yates over the same CSPRNG, so the guaranteed-class characters do
  // not always land in the first four positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const limit = Math.floor(256 / (i + 1)) * (i + 1);
    const buf = new Uint8Array(1);
    let value = limit;
    while (value >= limit) {
      crypto.getRandomValues(buf);
      value = buf[0];
    }
    const j = value % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/**
 * A random password with at least one character from each class, so it clears
 * any reasonable policy on the first try.
 */
export function generatePassword(length = 16): string {
  const size = Math.max(8, length);
  const out = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (out.length < size) out.push(pick(ALL));
  return shuffle(out).join("");
}
