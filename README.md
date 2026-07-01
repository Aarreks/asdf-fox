# asdf-fox / zxcvbn+ demo

An experimental password-strength analyzer built on a bundled zxcvbn-ts baseline.
It adds an inspectable contemporary-vocabulary overlay, targeted structural parsers,
small case/leet adjustments for recognized tokens, and optional Pwned Passwords
range checks.

## Repository layout

```text
package/   publishable npm library (`asdf-fox` until you rename it)
demo/      static GitHub Pages demo that imports the library
tools/     non-runtime tools used to generate or extend the vocabulary data
```

There is one scoring implementation. The demo is just a browser consumer of the
same package you publish.

## Default grade scheme

asdf-fox reports a conservative letter grade from its raw effective log10 estimate:

```text
A  >= 10.5  Acceptable
B  >=  8.5  Warning
C  >=  6.5  Critical warning
D  >=  4.5  Fail
F  <   4.5  Extreme fail
```

An exact Pwned Passwords match is shown as `F - Exposed password` regardless of the estimate.
The grade is a presentation default, not permission to accept a password without considering
breach status or account-specific context.

## Local development

Requires Node 20+.

```bash
npm ci
npm test
npm run dev
```

Then open `http://127.0.0.1:4173`.

To produce the static demo and the package builds:

```bash
npm run build
```

The deployable static site is `demo/dist/`. The publishable npm package is
`package/`, after `npm run build` has generated its `dist/` directory.

## Package name before first publish

This repository currently uses the unscoped name `asdf-fox`. Before publishing,
check whether it is available:

```bash
npm view asdf-fox version
```

If npm returns a 404, you can retain it. If it already exists or you prefer a
personal namespace, edit **both** of these files:

```text
package/package.json  -> name
package/README.md     -> install/import examples
demo/src/app.js       -> import line
```

A public scoped name such as `@YOUR_NPM_USERNAME/asdf-fox` is usually safer
because the namespace belongs to you. The first scoped publish needs
`--access public`.

## What the static demo does

The demo runs zxcvbn, vocabulary parsing, and structure parsing in the browser.
It exposes a checkbox for the optional HIBP range check. The range check starts
only after a button click and hashes locally; it sends five SHA-1 prefix characters
for each bounded candidate. Do not enter a password you actively use into a public
demo.

GitHub Pages is static hosting. It cannot supply the response headers or request
logging controls that your localhost/production service might use. The demo is
therefore intentionally labeled as a public demonstration and does not pretend to
be a sign-up backend.

## Release docs

Read [`RELEASE.md`](RELEASE.md) for the exact first npm publication and GitHub
Pages deployment steps. Review [`package/THIRD_PARTY_NOTICES.md`](package/THIRD_PARTY_NOTICES.md)
before publishing, especially if you change the generated vocabulary data.
