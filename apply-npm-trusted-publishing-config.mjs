import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packagePath = path.join(root, 'package', 'package.json');
const workflowPath = path.join(root, '.github', 'workflows', 'publish.yml');

function requireFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Expected file not found: ${path.relative(root, file)}\nRun this from the repository root.`);
  }
}

requireFile(packagePath);
requireFile(workflowPath);

// 1. Preserve the package version and all existing metadata while setting the
// repository URL npm verifies for GitHub trusted publishing.
const packageText = fs.readFileSync(packagePath, 'utf8');
let manifest;
try {
  manifest = JSON.parse(packageText);
} catch (error) {
  throw new Error(`Could not parse package/package.json: ${error.message}`);
}

manifest.repository = {
  type: 'git',
  url: 'git+https://github.com/aarreks/asdf-fox.git',
};

const packageNewline = packageText.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(
  packagePath,
  `${JSON.stringify(manifest, null, 2)}${packageNewline}`.replace(/\n/g, packageNewline),
  'utf8',
);

// 2. Explicitly point setup-node at npm's public registry. The replacement is
// idempotent and changes no other workflow settings.
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const workflowNewline = workflowText.includes('\r\n') ? '\r\n' : '\n';
let workflowUpdated = workflowText;

if (!/^[ \t]*registry-url:[ \t]*https:\/\/registry\.npmjs\.org\/?[ \t]*$/m.test(workflowText)) {
  const setupNodeBlock = /(- uses: actions\/setup-node@v6\r?\n[ \t]+with:\r?\n(?:[ \t]+[^\r\n]+\r?\n)*?[ \t]+cache: npm)(\r?\n)/;
  if (!setupNodeBlock.test(workflowText)) {
    throw new Error(
      'Could not find the expected actions/setup-node@v6 cache block in .github/workflows/publish.yml. No workflow change was made.'
    );
  }
  workflowUpdated = workflowText.replace(
    setupNodeBlock,
    `$1${workflowNewline}          registry-url: https://registry.npmjs.org$2`,
  );
  fs.writeFileSync(workflowPath, workflowUpdated, 'utf8');
}

console.log('Updated package/package.json');
console.log('Updated .github/workflows/publish.yml');
console.log('\nReview with:');
console.log('  git diff -- package/package.json .github/workflows/publish.yml');
