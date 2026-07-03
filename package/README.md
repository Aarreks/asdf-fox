# asdf-fox

`asdf-fox` is an experimental, inspectable password-strength analyzer. It bundles a
zxcvbn-ts baseline with:

- a local modern-vocabulary overlay for ranked proper nouns and contemporary names;
- targeted detectors for concatenated arithmetic runs, repeat/truncation constructions,
  and simple interleaved streams;
- a bundled exact table of the 100,000 most frequent cleaned English two-word entries,
  used for bounded directional word-pair corrections after a full local word segmentation;
- deliberately small case-mask and standard-leet bonuses **only after** a bounded known-token
  parse is selected;
- an opt-in Pwned Passwords range check and bounded low-cost mutation checks.

It is a policy meter, not a claim to reproduce a real cracker's exact guess order or to prove
that a password is safe.

## Install

```bash
npm install asdf-fox
```

## Local-only analysis

This is an ESM package. In a CommonJS project, call `await import('asdf-fox')` rather than `require('asdf-fox')`.

```js
import { analyzePassword } from 'asdf-fox';

const result = analyzePassword('flareonflareo13141516', {
  userInputs: ['alex', 'exampleapp']
});

console.log(result.score.effectiveLog10);
console.log(result.structuralComposition);
```

`analyzePassword` is synchronous and performs no network request.

## Optional Pwned Passwords check

```js
import { analyzePasswordAsync } from 'asdf-fox';

const result = await analyzePasswordAsync(password, {
  userInputs: [username, serviceName],
  breachCheck: true
});
```

This hashes locally and sends only five SHA-1 prefix characters per bounded candidate to
HIBP's range endpoint with response padding. Run it only after the user has finished entering
the password, never on every keystroke.

For a server-side integration, pass a custom `fetch` implementation or an internal proxy endpoint:

```js
await analyzePasswordAsync(password, {
  breachCheck: true,
  pwned: {
    endpoint: 'https://your-service.example/pwned-range/'
  }
});
```

## Result contract

The result includes the native zxcvbn baseline, lexical/structural adjustments, selected spans,
common-bigram evidence, optional breach results, and per-stage timings. Treat numerical scores
as estimates; use the explanation fields for policy/audit UI.

### Common-bigram adjustment

`commonBigramPatterns` is local-only and exact. It uses a filtered 100,000-entry table generated
from lowercase alphabetic entries in Peter Norvig's `count_2w.txt` distribution. It recovers
recognized word spans inside an alphabetic run even when surrounding literal characters are not
recognized as words. Those surrounding characters remain part of the password and receive no
bigram discount. A pair must still be exactly adjacent or separated by one explicit separator such
as `_` or `-`; an uncovered internal letter never becomes an implied boundary. A selected
directional pair retains the higher-cost word and a `0.15 log10` order cost, so its reduction
cannot exceed the lower-cost word contribution. Adjacent selected pairs are matched without
overlap, so a middle word cannot be discounted twice.

This is a bounded lexical correction, not quote/lyric recognition or a semantic claim. The exact
pairs and reductions are returned in `commonBigramPatterns`.

### Default grades

`result.score.effectiveLog10` is intentionally rounded to two decimal places before it is returned. `result.score.grade` is assigned from that same rounded value.

This rounding is deliberate, not display-only. Password-strength estimates are approximate, and zxcvbn-style estimators can place nearly identical brute-force-looking passwords on opposite sides of a whole-number `log10` boundary even when neither password has a different detected pattern.

Returning a two-decimal estimate creates a small guard band around common threshold checks. For example:

```js
result.score.effectiveLog10 >= 10
```

accepts an internal estimate that rounds to `10.00`, rather than distinguishing a meaningless difference such as `9.999...` versus `10.000...`.

asdf-fox's default grade thresholds deliberately use half-log positions rather than whole-number `log10` cutoffs:

| Grade | Minimum `effectiveLog10` | Meaning          |
| ----- | -----------------------: | ---------------- |
| A     |                     10.5 | Acceptable       |
| B     |                      8.5 | Warning          |
| C     |                      6.5 | Critical warning |
| D     |                      4.5 | Fail             |
| F     |                below 4.5 | Extreme fail     |

The grade is a conservative default policy result. Grade A is the package's default acceptable outcome. An exact Pwned Passwords match overrides the presentation grade to `F: Exposed password`.

For a typical sign-up flow, require Grade A and separately reject exact breach matches and close-variant warnings:

```js
const acceptable =
  result.score.grade.letter === 'A' &&
  result.exactPwned?.breached !== true &&
  result.closeVariantWarnings.length === 0;
```

`result.score.band` and the exported `band()` helper remain legacy aliases. New integrations should use `result.score.grade` and `grade()`.

## Security boundary

Do not collect submitted passwords for analytics or logging. A production sign-up system also
needs secure password hashing, account-rate limits, MFA/recovery protections, TLS, and a
compromised-password policy appropriate to its threat model.

See `THIRD_PARTY_NOTICES.md` for bundled-data attribution and review requirements.
