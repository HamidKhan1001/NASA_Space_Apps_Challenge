/* Entry point for the workflow: reads the PR via the GitHub API, evaluates, comments, labels. */
import { evaluate, render } from './pr-check.mjs';
import { appendFileSync } from 'node:fs';

const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: num } = process.env;
if (!token || !repo || !num) { console.error('missing env'); process.exit(2); }
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const pr = await api(`/pulls/${num}`);
const files = [];
for (let page = 1; page <= 10; page++) {
  const chunk = await api(`/pulls/${num}/files?per_page=100&page=${page}`);
  files.push(...chunk.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })));
  if (chunk.length < 100) break;
}
const result = evaluate({ title: pr.title, body: pr.body || '', author: pr.user.login, labels: pr.labels.map((l) => l.name), files });
const body = render(result);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n');

const soft = async (fn) => { try { await fn(); } catch (e) { console.warn('non-fatal:', e.message); } };
await soft(async () => {
  const comments = await api(`/issues/${num}/comments?per_page=100`);
  const mine = comments.find((c) => c.body.startsWith('<!-- pr-checker -->'));
  const payload = { method: mine ? 'PATCH' : 'POST', body: JSON.stringify({ body }), headers: { 'Content-Type': 'application/json' } };
  await api(mine ? `/issues/comments/${mine.id}` : `/issues/${num}/comments`, payload);
});
await soft(async () => {
  const old = pr.labels.map((l) => l.name).filter((n) => n.startsWith('size:') && !result.labels.includes(n));
  for (const n of old) await api(`/issues/${num}/labels/${encodeURIComponent(n)}`, { method: 'DELETE' });
  await api(`/issues/${num}/labels`, { method: 'POST', body: JSON.stringify({ labels: result.labels }), headers: { 'Content-Type': 'application/json' } });
});
console.log(body);
process.exit(result.ok ? 0 : 1);
