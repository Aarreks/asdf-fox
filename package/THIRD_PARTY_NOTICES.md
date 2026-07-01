# Third-party notices

## zxcvbn-ts

This package bundles portions of `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, and
`@zxcvbn-ts/language-en`. See their upstream repository and license terms:
https://github.com/zxcvbn-ts/zxcvbn

## wordfreq-derived ranked token data

`data/wordfreq-en-2021.json` is a generated ordered token list derived from
`wordfreq` by Robyn Speer and contributors. The list preserves a local rank order
rather than redistributing raw source corpora.

- Upstream: https://github.com/rspeer/wordfreq
- Snapshot characteristic: language usage through approximately 2021, as stated by
  the upstream project.
- Upstream code license: Apache-2.0. The upstream project separately documents
  data attribution and share-alike obligations in its `NOTICE.md`; this package
  preserves attribution and source metadata alongside the generated data.

Before distributing a modified lexicon, review the upstream `NOTICE.md` and any
licensing obligations for the data sources. This file is attribution/provenance
information, not legal advice.

## Pwned Passwords

The optional breach check queries HIBP's public Pwned Passwords range API. The
implementation hashes locally and sends only a five-character SHA-1 hash prefix.
Pwned Passwords API documentation: https://haveibeenpwned.com/API/v3#PwnedPasswords
