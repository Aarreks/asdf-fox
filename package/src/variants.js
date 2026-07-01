'use strict';

function isArithmeticDigits(tail) {
  if (!/^\d{2,8}$/u.test(tail)) return false;
  const digits = [...tail].map(Number);
  const delta = digits[1] - digits[0];
  if (Math.abs(delta) !== 1) return false;
  return digits.every((digit, index) => index === 0 || digit - digits[index - 1] === delta);
}

function normaliseLeet(password) {
  const map = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't' };
  let replacements = 0;
  let result = '';
  for (const ch of password) {
    if (Object.hasOwn(map, ch)) {
      result += map[ch];
      replacements += 1;
    } else {
      result += ch;
    }
  }
  return { value: result.toLowerCase(), replacements };
}

function buildVariantCandidates(password) {
  const candidates = [];
  const seen = new Set();
  const add = (value, kind, label, minimumLength = 8) => {
    if (value.length < minimumLength || value === password || seen.has(value)) return;
    seen.add(value);
    candidates.push({ value, kind, label });
  };

  // Exact is deliberately separate. A positive exact result is evidence that
  // this complete password appeared in HIBP; a variant is only an attacker-cost
  // warning and never relabelled as an exact exposure.
  candidates.push({ value: password, kind: 'exact', label: 'exact password' });
  seen.add(password);

  // A single appended character is an extremely cheap rule-based mutation of
  // a breached base (for example, "Password" -> "Password!"). This check is
  // intentionally only ONE deletion: it does not turn a breached base plus six
  // genuinely random digits into a near-breach result, because deleting one
  // character still leaves five unknown digits.
  // A breached short base can still matter when the entered password is
  // just that base plus one final character. Keep this narrowly bounded:
  // one deletion only, and never test a base shorter than five characters.
  if (password.length >= 6) {
    add(password.slice(0, -1), 'cheap-suffix', 'removed one final character', 5);
  }

  // Low-cost numeric suffixes only. Crucially, this does NOT strip a generic
  // six-digit suffix, so pwnedBase + six random digits is not treated as pwned.
  const trailingDigits = password.match(/(\d+)$/u);
  if (trailingDigits) {
    const tail = trailingDigits[1];
    const base = password.slice(0, -tail.length);
    const year = /^\d{4}$/u.test(tail) && Number(tail) >= 1900 && Number(tail) <= 2099;
    const repeats = /^([0-9])\1{1,7}$/u.test(tail);
    if (base.length >= 8 && (tail.length <= 3 || year || repeats || isArithmeticDigits(tail))) {
      const reason = tail.length <= 3
        ? 'removed short numeric suffix (≤3 digits)'
        : year
          ? 'removed year suffix'
          : repeats
            ? 'removed repeated-digit suffix'
            : 'removed arithmetic digit suffix';
      add(base, 'cheap-suffix', reason);
    }
  }

  const separators = password.match(/([^A-Za-z0-9]{1,2})$/u);
  if (separators) {
    const base = password.slice(0, -separators[1].length);
    add(base, 'cheap-suffix', 'removed one or two trailing separators');
  }

  // Case folding is limited to alphabetic passwords, avoiding arbitrary edits.
  if (/^[A-Za-z]{8,64}$/u.test(password) && password !== password.toLowerCase()) {
    add(password.toLowerCase(), 'case-normalization', 'case-folded alphabetic form');
  }

  // Require at least two common substitutions; we do not try edit distance,
  // arbitrary character deletions, or all possible digit tails.
  if (/^[A-Za-z0-9@$!]+$/u.test(password)) {
    const leet = normaliseLeet(password);
    if (leet.replacements >= 2 && /^[a-z]{8,64}$/u.test(leet.value)) {
      add(leet.value, 'leet-normalization', 'normalized ≥2 common leet substitutions');
    }
  }

  return candidates.slice(0, 5);
}

module.exports = { buildVariantCandidates };
