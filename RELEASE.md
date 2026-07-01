# First release: npm + GitHub Pages

## 1. Create the GitHub repository

1. Create a new **public** GitHub repository, for example `asdf-fox`.
2. Extract this archive, run `git init`, add the GitHub remote, and push `main`.
3. Do not commit `node_modules`, `package/dist`, or `demo/dist`; `.gitignore`
   already excludes them.

```bash
git init
git add .
git commit -m "Initial asdf-fox release"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/asdf-fox.git
git push -u origin main
```

## 2. Verify the project locally

```bash
npm ci
npm test
npm run build
npm run check:publish
```

`npm run check:publish` is the important final preview: it runs tests, builds the
library/demo, and prints the npm tarball file list without publishing anything.

## 3. Decide the npm name

The package is currently named `asdf-fox`.

```bash
npm view asdf-fox version
```

- A version means the name is occupied; change to a scoped name such as
  `@YOUR_NPM_USERNAME/asdf-fox`.
- A 404 means the unscoped name is available at that moment.

For a scoped name, update the package name and demo import together, reinstall
from the root (`npm install`), then rerun the verification command above.

## 4. Publish version 0.1.0 manually

Create/sign in to an npm account and enable 2FA. From the repo root:

```bash
npm login
npm run build
cd package
npm publish --access public
```

For an unscoped public package, `--access public` is harmless. For a scoped public
package, it is required on the first publish.

Immediately verify the actual registry artifact in a separate temporary folder:

```bash
mkdir ../asdf-fox-install-check
cd ../asdf-fox-install-check
npm init -y
npm install asdf-fox
node --input-type=module -e "import('asdf-fox').then(a => console.log(a.analyzePassword('flareon').score))"
```

Replace `asdf-fox` with your final scoped name as needed.

## 5. Turn on GitHub Pages

This repository includes `.github/workflows/pages.yml`.

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` or run the **Deploy GitHub Pages** workflow manually.
4. GitHub shows the final project Pages URL in the deployment result. It is
   normally `https://YOUR_GITHUB_USERNAME.github.io/asdf-fox/` for a project repo.

The workflow builds `demo/dist` from the exact local package source; you never
commit generated demo assets.

## 6. Configure safer future publishes

After version 0.1.0 exists on npm:

1. Open the package's **Settings → Trusted Publisher** on npmjs.com.
2. Select **GitHub Actions**.
3. Enter your GitHub user/org, repository name, and `publish.yml`.
4. Allow `npm publish`.
5. Push a version tag matching `v*`.

The included `publish.yml` uses npm OIDC trusted publishing, not an npm write token.
It publishes the version written in `package/package.json`. Before tagging a new
release, update it with `npm version patch --workspace=asdf-fox` or edit the version,
then commit and tag the same version:

```bash
npm version patch --workspace=asdf-fox --workspaces-update=false
git add package/package.json package-lock.json
git commit -m "Release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

Do not republish or overwrite an existing npm version. Publish a new patch version
for a correction.

## Pre-release checklist

- [ ] `npm ci`, `npm test`, `npm run build`, and `npm run check:publish` pass.
- [ ] `npm pack --dry-run` contains only intended package files.
- [ ] `package/THIRD_PARTY_NOTICES.md` and the vocabulary source metadata remain intact.
- [ ] The demo has been tested with the HIBP checkbox both on and off.
- [ ] You have tried the generated `demo/dist` locally with `npm run dev`.
- [ ] You use a fresh version number and tag for every npm release.
