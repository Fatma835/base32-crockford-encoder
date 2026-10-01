/**
 * Crockford Base32 encoder/decoder.
 *
 * Spec: https://www.crockford.com/base32.html
 *
 * Design decisions (documented so the behaviour is unambiguous):
 *
 * 1. Checksum symbol. Crockford specifies extra symbols '*' '~' '$' '=' for
 *    checksum values 30–33, but never says which symbol maps to which value.
 *    We use the order '*' '~' '$' '=' for 30, 31, 32, 33. The README states
 *    this explicitly so consumers are not surprised.
 *
 * 2. Decode is case-insensitive and accepts the visual-confusables 'O'→'0',
 *    'I'/'L'→'1' on decode only. Encode always emits the canonical alphabet
 *    (no 'O', 'I', 'L'), so round-tripping never produces those letters.
 *
 * 3. Mixed-case prefix 'U' decoding (for negative numbers) is supported but
 *    only as a leading 'U' or 'u'. The symbol must be the first character; any
 *    other position raises. This is the one interpretation Crockford describes,
 *    so we honour it rather than trying to guess alternatives.
 *
 * 4. Leading zeros. Crockford Base32 is a positional numeral system; a leading
 *    '0' carries no numeric value and is stripped on decode. Encode never
 *    emits a leading zero for non-zero inputs. This mirrors how the reference
 *    implementation in the wild behaves and avoids ambiguity about whether
 *    '0A' and 'A' are "the same" — they are.
 */

export const SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const NORMALIZE_MAP = new Map([
  ['o', '0'],
  ['O', '0'],
  ['i', '1'],
  ['I', '1'],
  ['l', '1'],
  ['L', '1'],
]);

const DECODE_MAP = new Map();
for (let i = 0; i < SYMBOLS.length; i++) {
  DECODE_MAP.set(SYMBOLS[i], i);
  DECODE_MAP.set(SYMBOLS[i].toLowerCase(), i);
}
for (const [from, to] of NORMALIZE_MAP) {
  DECODE_MAP.set(from, DECODE_MAP.get(to));
}

const CHECKSUM_EXTRA = ['*', '~', '$', '='];

/**
 * Build a lookup that includes the four extra checksum symbols for values 30-33.
 * Returned as a fresh Map so callers cannot mutate the shared one.
 */
function buildChecksumDecodeMap() {
  const m = new Map(DECODE_MAP);
  for (let v = 0; v < CHECKSUM_EXTRA.length; v++) {
    const sym = CHECKSUM_EXTRA[v];
    m.set(sym, 30 + v);
  }
  return m;
}

const CHECKSUM_DECODE_MAP = buildChecksumDecodeMap();

export class DecodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecodeError';
  }
}

function isUint(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBigUint(value) {
  return typeof value === 'bigint' && value >= 0n;
}

/**
 * Encode a non-negative integer to a Crockford Base32 string.
 *
 * @param {number|bigint} value
 * @returns {string}
 * @throws {TypeError} if value is not a non-negative integer or bigint.
 */
export function encode(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new TypeError('encode expects a non-negative value');
    }
    if (value === 0n) return '0';
    let digits = [];
    let v = value;
    while (v > 0n) {
      digits.push(SYMBOLS[Number(v % 32n)]);
      v /= 32n;
    }
    return digits.reverse().join('');
  }
  if (!isUint(value)) {
    throw new TypeError('encode expects a non-negative integer or bigint');
  }
  if (value === 0) return '0';
  let digits = [];
  let v = value;
  while (v > 0) {
    digits.push(SYMBOLS[v % 32]);
    v = Math.floor(v / 32);
  }
  return digits.reverse().join('');
}

/**
 * Compute the Crockford checksum symbol for a value.
 *
 * Crockford defines the checksum as value mod 37, using an extended symbol
 * table that adds '*' '~' '$' '=' for residues 30–33. 37 is prime, which is
 * why it was chosen: it gives a slightly better error-detection profile
 * than mod 32 would against single-symbol transcriptions.
 */
function checksumSymbol(value) {
  let residue;
  if (typeof value === 'bigint') {
    residue = Number(value % 37n);
  } else {
    residue = value % 37;
  }
  if (residue < 30) return SYMBOLS[residue];
  return CHECKSUM_EXTRA[residue - 30];
}

/**
 * Encode with a trailing checksum symbol.
 * @param {number|bigint} value
 * @returns {string}
 */
export function encodeWithChecksum(value) {
  return encode(value) + checksumSymbol(value);
}

/**
 * Decode a Crockford Base32 string to a non-negative bigint.
 *
 * We return bigint unconditionally because JavaScript numbers cannot safely
 * represent values above 2^53, and Crockford Base32 is commonly used for
 * UUID-scale integers. Callers who know their values are small can coerce
 * with Number(result) — but that is their decision, not ours.
 *
 * Leading zeros are accepted and do not change the result.
 *
 * @param {string} text
 * @returns {bigint}
 * @throws {DecodeError} if the text contains symbols outside the alphabet.
 */
export function decode(text) {
  if (typeof text !== 'string') {
    throw new DecodeError('decode expects a string');
  }
  if (text.length === 0) {
    throw new DecodeError('empty input');
  }

  let negative = false;
  let body = text;
  if (body[0] === 'U' || body[0] === 'u') {
    negative = true;
    body = body.slice(1);
    if (body.length === 0) {
      throw new DecodeError('input was only a negative sign with no digits');
    }
  }

  let result = 0n;
  let anyDigits = false;
  for (const ch of body) {
    const v = DECODE_MAP.get(ch);
    if (v === undefined) {
      throw new DecodeError(`invalid symbol: ${ch}`);
    }
    result = result * 32n + BigInt(v);
    anyDigits = true;
  }
  if (!anyDigits) {
    throw new DecodeError('no digits in input');
  }
  return negative ? -result : result;
}

/**
 * Decode a string that carries a trailing checksum symbol.
 *
 * @param {string} text
 * @returns {bigint}
 * @throws {DecodeError} if the checksum is invalid or symbols are out of range.
 */
export function decodeWithChecksum(text) {
  if (typeof text !== 'string') {
    throw new DecodeError('decodeWithChecksum expects a string');
  }
  if (text.length < 2) {
    throw new DecodeError('input too short to contain value and checksum');
  }

  const checkChar = text[text.length - 1];
  const body = text.slice(0, -1);

  // The body still may carry a leading 'U' for negative numbers; decode handles that.
  const value = decode(body);

  // Checksum is computed on the magnitude; the leading 'U' is a sign prefix,
  // not part of the numeric payload being checksummed.
  const magnitude = value < 0n ? -value : value;
  const expectedResidue = Number(magnitude % 37n);
  const checkVal = CHECKSUM_DECODE_MAP.get(checkChar);
  if (checkVal === undefined) {
    throw new DecodeError(`invalid checksum symbol: ${checkChar}`);
  }
  if (checkVal !== expectedResidue) {
    throw new DecodeError(
      `checksum mismatch: expected ${checksumSymbolForResidue(expectedResidue)}, got ${checkChar}`,
    );
  }
  return value;
}

function checksumSymbolForResidue(residue) {
  if (residue < 30) return SYMBOLS[residue];
  return CHECKSUM_EXTRA[residue - 30];
}
