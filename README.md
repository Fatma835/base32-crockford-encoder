# Base32 Crockford Encoder

Encode and decode Crockford Base32 strings, with optional checksum symbols, for human-readable identifiers.

```js
import {
  encode,
  decode,
  encodeWithChecksum,
  decodeWithChecksum,
} from './src/index.js';

encode(335);                 // 'AF'
decode('AF');                 // 335n  (always bigint)
encodeWithChecksum(335);      // 'AF2'
decodeWithChecksum('AF2');    // 335n
```

## Why

Crockford Base32 is designed for humans: a 32-symbol alphabet that omits the
letters most easily confused with digits (I, L, O, U) so that hand-typed
identifiers survive transcription. This library implements that scheme with a
checksum variant for catching single-character typos.

The trade-off: `decode` returns `bigint` unconditionally. Crockford Base32 is
often used for UUID-scale integers that exceed JavaScript's safe integer range,
and returning `number` would silently lose precision for the very case the
format exists to serve. Callers who know their values are small coerce with
`Number(result)` themselves.

## Edges you will hit

- **Decode is more permissive than encode.** It accepts `O`, `I`, `L` (and
  their lowercase forms) and normalizes them to `0` and `1`. Encode never
  emits those letters, so round-trips are clean — but decoding external input
  may succeed on strings that `encode` would never have produced.
- **Negative numbers via leading `U`.** Crockford reserves `U` as a sign
  prefix. `decode('U1')` yields `-1n`. There is no `encode` for negatives;
  negative encoding is not part of this library's contract.
- **Checksum extra symbols.** The spec defines four extra symbols for
  checksum residues 30–33 but does not name their mapping. This library uses
  `* ~ $ =` for `30 31 32 33`, in that order. If you interoperate with another
  implementation, confirm it uses the same convention.
- **Leading zeros are stripped on decode.** `'0A'` and `'A'` decode to the
  same value. This matches how positional numeral systems work and removes
  ambiguity about whether zero-padding is significant.

## API

- `encode(value: number | bigint): string` — non-negative only.
- `decode(text: string): bigint` — case-insensitive, accepts confusables, supports leading `U`.
- `encodeWithChecksum(value): string` — appends one checksum symbol.
- `decodeWithChecksum(text): bigint` — validates the trailing checksum; throws `DecodeError` on mismatch.
- `SYMBOLS` — the 32-character canonical alphabet.
- `DecodeError` — thrown on any decode failure.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

