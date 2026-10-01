import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encode,
  decode,
  encodeWithChecksum,
  decodeWithChecksum,
  SYMBOLS,
  DecodeError,
} from '../src/index.js';

test('encode zero produces a single zero digit', () => {
  assert.equal(encode(0), '0');
  assert.equal(encode(0n), '0');
});

test('encode a small number produces the canonical alphabet', () => {
  // 0x14F = 335. In base32: 335 / 32 = 10 r 15; 10 / 32 = 0 r 10.
  // Digits low-to-high: 15, 10. Reversed: 10, 15 → 'AF'.
  // (Index 15 in the Crockford alphabet is 'F', not 'P'; 'P' is index 22.)
  assert.equal(encode(335), 'AF');
  assert.equal(encode(0x14Fn), 'AF');
});

test('encode rejects negative numbers', () => {
  assert.throws(() => encode(-1), TypeError);
  assert.throws(() => encode(-1n), TypeError);
});

test('encode rejects non-integers', () => {
  assert.throws(() => encode(1.5), TypeError);
  assert.throws(() => encode('5'), TypeError);
  assert.throws(() => encode(null), TypeError);
});

test('encode never emits confusable letters O, I, L', () => {
  for (let i = 0; i < 10000; i++) {
    const s = encode(i);
    assert.ok(!s.includes('O'), `no O at ${i}`);
    assert.ok(!s.includes('I'), `no I at ${i}`);
    assert.ok(!s.includes('L'), `no L at ${i}`);
  }
});

test('decode is case-insensitive', () => {
  assert.equal(decode('af'), 335n);
  assert.equal(decode('AF'), 335n);
  assert.equal(decode('aF'), 335n);
});

test('decode accepts visual confusables O→0, I/L→1', () => {
  assert.equal(decode('O'), 0n);
  assert.equal(decode('I'), 1n);
  assert.equal(decode('L'), 1n);
  assert.equal(decode('o'), 0n);
  assert.equal(decode('i'), 1n);
  assert.equal(decode('l'), 1n);
});

test('decode rejects invalid symbols', () => {
  assert.throws(() => decode('!'), DecodeError);
  assert.throws(() => decode('A B'), DecodeError);
  assert.throws(() => decode('U'), DecodeError);
});

test('decode rejects empty input', () => {
  assert.throws(() => decode(''), DecodeError);
});

test('decode supports leading-U negative numbers', () => {
  // 'U' followed by digits means negative.
  assert.equal(decode('U0'), 0n);  // -0 == 0
  assert.equal(decode('U1'), -1n);
  assert.equal(decode('uAF'), -335n);
});

test('round-trip for a range of small integers', () => {
  for (let i = 0; i < 5000; i++) {
    assert.equal(decode(encode(i)), BigInt(i));
  }
});

test('round-trip for bigints beyond Number.MAX_SAFE_INTEGER', () => {
  const big = 2n ** 63n + 7n;
  assert.equal(decode(encode(big)), big);
});

test('decode returns bigint even for small values', () => {
  // Documented in JSDoc: decode always returns bigint.
  assert.equal(typeof decode('5'), 'bigint');
});

test('encodeWithChecksum appends a checksum symbol', () => {
  // 0 mod 37 = 0 → '0'
  assert.equal(encodeWithChecksum(0), '00');
  // 335 mod 37: 37*9 = 333, remainder 2 → '2'
  assert.equal(encodeWithChecksum(335), 'AF2');
});

test('decodeWithChecksum accepts valid checksum', () => {
  assert.equal(decodeWithChecksum('AF2'), 335n);
  assert.equal(decodeWithChecksum('00'), 0n);
});

test('decodeWithChecksum rejects invalid checksum', () => {
  assert.throws(() => decodeWithChecksum('AF3'), DecodeError);
  assert.throws(() => decodeWithChecksum('AFX'), DecodeError);
});

test('decodeWithChecksum rejects input too short', () => {
  assert.throws(() => decodeWithChecksum('A'), DecodeError);
  assert.throws(() => decodeWithChecksum(''), DecodeError);
});

test('decodeWithChecksum supports extra symbols for residues 30-33', () => {
  // 30 mod 37 = 30. encode(30) = 'Y' (index 30 in the Crockford alphabet).
  // Checksum symbol = '*'.
  assert.equal(encodeWithChecksum(30), 'Y*');
  assert.equal(decodeWithChecksum('Y*'), 30n);
  assert.equal(decodeWithChecksum('Z~'), 31n);
  assert.equal(decodeWithChecksum('10$'), 32n);
  assert.equal(decodeWithChecksum('11='), 33n);
});

test('decodeWithChecksum round-trips with negatives', () => {
  // Negative value: body is 'U1', checksum computed from abs(value)=1, residue 1 → '1'.
  // Full string: 'U1' + '1' = 'U11'.
  assert.equal(encodeWithChecksum(1n), '11');
  // We don't ship a negative-encode helper, but decodeWithChecksum must still
  // validate a hand-built 'U11' (value -1, checksum for 1).
  assert.equal(decodeWithChecksum('U11'), -1n);
});

test('SYMBOLS has length 32 and no duplicates', () => {
  assert.equal(SYMBOLS.length, 32);
  assert.equal(new Set(SYMBOLS).size, 32);
});

test('DecodeError has a useful name', () => {
  try {
    decode('!');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.name, 'DecodeError');
    assert.ok(e instanceof Error);
  }
});
