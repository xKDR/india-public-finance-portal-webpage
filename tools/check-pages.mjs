// Headless check of a running preview: for every state, fetch the home page, its
// explore and series pages, the Explore tab and the compare page; fetch every local
// script, stylesheet and image they reference; fetch and parse the JSON the pages load.
// Fails on any non-200 response or JSON parse error.
// Usage: node tools/check-pages.mjs [base URL, default http://127.0.0.1:4180]
import {STATES} from './states.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:4180').replace(/\/$/, '');
const seen = new Map(), errors = [];
async function get(url) {
  if (seen.has(url)) return seen.get(url);
  const p = fetch(url).then(async r => ({status: r.status, type: r.headers.get('content-type') || '', body: await r.text()}));
  seen.set(url, p);
  const r = await p;
  if (r.status !== 200) errors.push(`${r.status} ${url}`);
  return r;
}
async function json(url) {
  const r = await get(url);
  try { return JSON.parse(r.body); } catch (e) { errors.push(`JSON parse error ${url}: ${e.message}`); return null; }
}
async function page(url) {
  const r = await get(url);
  if (!/charset=utf-8/i.test(r.type) || !/<meta charset="utf-8">/i.test(r.body)) errors.push(`not UTF-8: ${url}`);
  for (const [, ref] of r.body.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(ref)) continue;
    const u = new URL(ref, url);
    if (/\.(js|css|png|svg|woff|json)$/.test(u.pathname) || u.pathname.endsWith('.html')) await get(u.href);
  }
}

const pf = `${base}/public-finance`;
await page(`${base}/index.html`);
await page(`${pf}/index.html`);
await page(`${pf}/compare.html`);
await page(`${pf}/about.html`);
const states = await json(`${pf}/data/states.json`);
await json(`${pf}/data/provenance.json`);
await json(`${pf}/assets/india_states.json`);
const cix = await json(`${pf}/data/compare/index.json`);
for (const S of STATES) {
  await page(`${base}/explore.html?exploreState=${S.st}`);
  for (const p of ['explore', 'dashboard', 'series']) await page(`${pf}/${S.st}/${p}.html`);
  const ix = await json(`${pf}/data/${S.st}/index.json`);
  await json(`${pf}/data/${S.st}/quality.json`);
  for (const part of ['core', 'subheads', 'detailed', 'leaves']) await json(`${pf}/data/${S.st}/search/${part}.json`);
  const rec = states?.states.find(s => s.st === S.st);
  if (!rec) errors.push(`${S.st} missing from states.json`);
  if (!cix?.states.some(s => s.k === S.st)) errors.push(`${S.st} missing from compare/index.json`);
  if (ix) {
    const top = ix.majors.slice().sort((a, b) => (b.d.be?.[ix.fys.length - 1] || 0) - (a.d.be?.[ix.fys.length - 1] || 0))[0];
    const shard = await json(`${pf}/data/${S.st}/major/${top.c}.json`);
    const deva = /[ऀ-ॿ]/;
    const sample = [...Object.values(ix.demands), ...(shard?.nodes || []).map(n => n.name)].find(n => deva.test(n));
    console.log(`${S.st}: ${ix.majors.length} majors, BE ${rec?.be.fy} ₹${Math.round(rec?.be.cr).toLocaleString('en-IN')} cr, ` +
      `largest major ${top.c} shard ${shard?.nodes.length} nodes` + (sample ? `, Devanagari sample "${sample}"` : ''));
  }
}
console.log(`${seen.size} URLs fetched`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('PASS: no 404, no JSON parse error, all pages UTF-8.');
