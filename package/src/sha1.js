'use strict';

// Small synchronous SHA-1 implementation for Pwned Passwords range prefixes.
// SHA-1 is used only because HIBP's k-anonymity range API is defined in terms
// of SHA-1 prefixes. Passwords are never sent to HIBP in plaintext.
function sha1(value) {
  const utf8 = new TextEncoder().encode(value);
  const bitLength = utf8.length * 8;
  const totalLength = (((utf8.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(totalLength);
  bytes.set(utf8);
  bytes[utf8.length] = 0x80;

  const view = new DataView(bytes.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(totalLength - 8, high, false);
  view.setUint32(totalLength - 4, low, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  const rotl = (word, amount) => ((word << amount) | (word >>> (32 - amount))) >>> 0;

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 80; index += 1) words[index] = rotl(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((part) => part.toString(16).padStart(8, '0')).join('').toUpperCase();
}

module.exports = { sha1 };
