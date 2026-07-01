# asdf-fox

`asdf-fox` is an experimental, inspectable password-strength analyzer. It bundles a
zxcvbn-ts baseline with:

- a local modern-vocabulary overlay for ranked proper nouns and contemporary names;
- targeted detectors for concatenated arithmetic runs, repeat/truncation constructions,
  and simple interleaved streams;
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
optional breach results, and per-stage timings. Treat numerical scores as estimates; use the
explanation fields for policy/audit UI.

### Default grades

`result.score.grade` is a deliberately conservative presentation default based on the **raw**
`effectiveLog10` estimate. The displayed estimate may be rounded, but grading is not.

| Grade | Minimum `effectiveLog10` | Meaning |
| --- | ---: | --- |
| A | 10.5 | Acceptable |
| B | 8.5 | Warning |
| C | 6.5 | Critical warning |
| D | 4.5 | Fail |
| F | below 4.5 | Extreme fail |

An exact Pwned Passwords match overrides the presentation grade to `F — Exposed password`.
Applications should still enforce their own policy from the raw estimate plus breach state and
context. For example, a sign-up flow may require Grade A and reject both exact breach matches
and close-variant warnings.

```js
const acceptable =
  result.score.grade.letter === 'A' &&
  result.exactPwned?.breached !== true &&
  result.closeVariantWarnings.length === 0;
```

`result.score.band` and the exported `band()` helper remain legacy aliases in the 0.1.x
series. New integrations should use `result.score.grade` and `grade()`.

## Security boundary

Do not collect submitted passwords for analytics or logging. A production sign-up system also
needs secure password hashing, account-rate limits, MFA/recovery protections, TLS, and a
compromised-password policy appropriate to its threat model.

See `THIRD_PARTY_NOTICES.md` for bundled-data attribution and review requirements.
