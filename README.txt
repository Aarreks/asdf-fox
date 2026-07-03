Extract this ZIP directly into the asdf-fox repository root, then run:

  node .\apply-npm-trusted-publishing-config.mjs

The script preserves the current package version and all other manifest fields.
It makes only these two changes:

1. package/package.json
   repository = {
     "type": "git",
     "url": "git+https://github.com/aarreks/asdf-fox.git"
   }

2. .github/workflows/publish.yml
   registry-url: https://registry.npmjs.org
   under the actions/setup-node@v6 configuration.
