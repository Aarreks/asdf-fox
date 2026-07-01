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

## Security boundary

Do not collect submitted passwords for analytics or logging. A production sign-up system also
needs secure password hashing, account-rate limits, MFA/recovery protections, TLS, and a
compromised-password policy appropriate to its threat model.

See `THIRD_PARTY_NOTICES.md` for bundled-data attribution and review requirements.
