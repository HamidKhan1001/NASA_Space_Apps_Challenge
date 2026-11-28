/* Pull-request checker: pure function over PR metadata + changed files, so it can be
   unit-tested and run without executing any PR code. Used by .github/workflows/pr-checker.yml. */
export const TITLE_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|data|revert)(\([a-z0-9._/-]+\))?!?: .{3,}$/;
const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google service-account key', /"private_key"\s*:\s*"-----BEGIN/],
  ['generic API key assignment', /\b(?:api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{20,}['"]/i]
];
const FORBIDDEN_FILES = /(^|\/)(\.env(\..+)?|.*service-account.*\.json|ee-key.*\.json|.*\.pem|id_rsa)$/i;

export function evaluate({ title = '', body = '', author = '', labels = [], files = [] }) {
  const fail = [], warn = [], info = [];
  const labelSet = new Set(labels);
  const isBot = /\[bot\]$|^atlas-bot$/.test(author);

  if (!TITLE_RE.test(title)) fail.push('Title must look like `type(scope): summary` (types: feat, fix, docs, refactor, test, ci, chore, data, ...).');
  if (body.trim().length < 30) warn.push('Description is almost empty. Say what changed and how you tested it.');
  if (!/test/i.test(body)) warn.push('Description does not mention how this was tested.');

  const changed = files.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  const size = changed < 50 ? 'XS' : changed < 250 ? 'S' : changed < 800 ? 'M' : changed < 2000 ? 'L' : 'XL';
  if (size === 'XL') warn.push(`Large PR (${changed} changed lines). Consider splitting it.`);

  const names = files.map((f) => f.filename);
  const touch = (re) => names.some((n) => re.test(n));

  for (const f of files) {
    if (FORBIDDEN_FILES.test(f.filename) && f.status !== 'removed') fail.push(`Secret-like file must not be committed: \`${f.filename}\``);
    for (const line of String(f.patch || '').split('\n')) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const [label, re] of SECRET_PATTERNS) if (re.test(line)) { fail.push(`Possible ${label} in \`${f.filename}\`. Remove it and rotate the credential.`); break; }
    }
    if ((f.size || 0) > 1_000_000 && !/^data\//.test(f.filename)) warn.push(`Large file (${Math.round(f.size / 1e6)} MB): \`${f.filename}\``);
  }

  if (touch(/^data\//) && !labelSet.has('data-update') && !isBot) fail.push('`data/` is written only by the pipeline. Change `pipeline/` instead, or add the `data-update` label with an explanation.');
  if (touch(/^site\/js\//) && !touch(/^tests\//)) warn.push('Site code changed without a test change.');
  if (touch(/^site\/(js|css|index|methods|guide)/) && !touch(/^AGENTS\.md$/)) info.push('Consider a line in the AGENTS.md change log.');
  if (touch(/^\.github\/workflows\//)) warn.push('Workflow files changed: needs a maintainer review of permissions and secrets.');
  if (touch(/^site\/strings\.json$/)) info.push('Strings changed: Urdu and Pashto need a native-speaker check.');
  if (touch(/^package(-lock)?\.json$/)) info.push('Dependencies changed: `npm audit` runs in CI.');

  const area = new Set();
  for (const n of names) {
    if (/^site\//.test(n)) area.add('area:site');
    else if (/^pipeline\//.test(n)) area.add('area:pipeline');
    else if (/^data\//.test(n)) area.add('area:data');
    else if (/^(\.github|scripts)\//.test(n)) area.add('area:ci');
    else if (/^tests\//.test(n)) area.add('area:tests');
    else if (/^docs\/|\.md$/.test(n)) area.add('area:docs');
  }
  return { fail, warn, info, size, changed, labels: ['size:' + size, ...area], ok: fail.length === 0 };
}

export function render(r) {
  const sec = (icon, title, items) => (items.length ? `\n**${icon} ${title}**\n${items.map((i) => `- ${i}`).join('\n')}\n` : '');
  return `<!-- pr-checker -->\n## PR checker: ${r.ok ? 'passed' : 'needs changes'}\n` +
    `Size **${r.size}** (${r.changed} changed lines)\n` +
    sec('❌', 'Must fix', r.fail) + sec('⚠️', 'Should look at', r.warn) + sec('ℹ️', 'Notes', r.info) +
    (r.fail.length + r.warn.length + r.info.length === 0 ? '\nAll checks clean.\n' : '') +
    '\n<sub>Automated by `scripts/pr-check.mjs`. It reads the PR through the API and never runs PR code.</sub>';
}
