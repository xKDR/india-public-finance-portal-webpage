// Rebuild public-finance/data/<st>/ from the data repository's additive-leaf NDJSON.
// Usage, from anywhere:  node tools/build-local-data.mjs --data <india-public-finance-portal checkout> [--only ka,tn]
// States come from tools/states.mjs. --only rebuilds some states and keeps the
// others' entries in states.json and provenance.json.
import fs from 'node:fs/promises';
import {existsSync, createReadStream} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {STATES} from './states.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataRepo = path.resolve(arg('--data', path.join(site, '..', 'india-public-finance-portal')));
const only = arg('--only', null)?.split(',');
if (!existsSync(path.join(dataRepo, 'state-finances'))) throw Error(`no state-finances/ in ${dataRepo}; pass --data`);
const root = path.join(site, 'public-finance/data');
const fy = y => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const write = async (p, x) => { await fs.mkdir(path.dirname(p), {recursive: true}); await fs.writeFile(p, JSON.stringify(x)); };
const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return d; throw e; } };
const git = (...a) => execFileSync('git', ['-C', dataRepo, ...a], {encoding: 'utf8'}).trim();
const template = JSON.parse(await fs.readFile(path.join(here, 'schema-index.json'), 'utf8'));
// Only presentation labels are reused from the recovered format.

const oldStates = new Map(((await readJson(`${root}/states.json`, {states: []})).states).map(s => [s.st, s]));
const oldExcluded = await readJson(`${root}/excluded-rows.json`, []);
const oldProv = await readJson(`${root}/provenance.json`, {});
const states = [], excluded = [], provStates = {};

for (const S of STATES) {
 const {st, code: prefix, slug} = S;
 if (only && !only.includes(st)) {
  if (oldStates.has(st)) states.push(oldStates.get(st));
  excluded.push(...oldExcluded.filter(r => r.id?.startsWith(prefix + '.')));
  if (oldProv.states?.[st]) provStates[st] = oldProv.states[st];
  continue;
 }
 const pkg = `state-finances/${slug}`, base = path.join(dataRepo, pkg);
 const years = (await fs.readdir(`${base}/${prefix}_years`)).filter(s => s.startsWith(prefix + '_')).map(s => s.slice(prefix.length + 1)).sort();
 const fys = Array.from({length: parseInt(years.at(-1)) - parseInt(years[0]) + 3}, (_, i) => fy(parseInt(years[0]) - 2 + i));
 const names = JSON.parse(await fs.readFile(`${base}/${prefix}_demand_names.json`, 'utf8'));
 const demands = names.demands ? Object.fromEntries(Object.entries(names.demands).map(([k, v]) => [k, v.name])) : names;
 const levels = template.levels.map(l => l.k === 'lf' ? {...l, label: S.leaf_label} : l);
 const ix = {state: prefix, name: S.name, package_dir: pkg, unit: S.unit, crore_div: S.crore_div, doc_years: years, fys, spans: {be: [2, fys.length - 1], bp: [1, fys.length - 2], re: [1, fys.length - 2], ac: [0, fys.length - 3]}, levels, sector_groups: template.sector_groups, demands, demands_data: [], pdfs: {}, pdf_key: S.pdf_key, majors: [], totals: {}, n_leaf_rows: 0};
 const shards = new Map(), dmMap = new Map(), pdfOk = new Map();
 const add = (d, m, f, v) => { d[m] ??= {}; d[m][f] = (d[m][f] || 0) + v; };
 const field = ['sub_major_head', 'minor_head', 'sub_head', 'detailed_head', S.leaf];
 for (const [yi, year] of years.entries()) {
  const input = `${base}/${prefix}_years/${prefix}_${year}/${prefix}_json/${prefix}_budget_leaves_${year}.ndjson`;
  ix.pdfs[year] = {};
  for await (const line of readline.createInterface({input: createReadStream(input), crlfDelay: Infinity})) {
   if (!line.trim()) continue; const r = JSON.parse(line);
   if (r.amount_unit !== S.unit) throw Error(`${r._id}: amount_unit ${r.amount_unit}, table says ${S.unit}`);
   if (st === 'ka' && r.amounts.some(a => Math.abs(Number(a.value)) > 1e15) && ['major_head', 'sub_major_head', 'minor_head', 'sub_head', 'detailed_head', 'object_head'].some(k => r.hierarchy[k]?.code && !/^\d+$/.test(r.hierarchy[k].code))) { excluded.push({id: r._id, source: r.source, reason: 'Non-numeric Karnataka account-head code and implausible amount indicate a shifted extraction row; excluded for this preview only', row: r}); continue; }
   const h = r.hierarchy, code = h.major_head?.code;
   if (!code) throw Error(`${r._id}: leaf without a major head code`);
   ix.n_leaf_rows++;
   let s = shards.get(code); if (!s) { s = {state: prefix, major: code, name: h.major_head.name || code, levels: ix.levels, nodes: [], paths: [], flags: [], nodeMap: new Map()}; shards.set(code, s); }
   const n = field.map((f, i) => { const a = h[f]; if (!a || a.code == null || a.code === '') return -1; const key = JSON.stringify([i, ...field.slice(0, i + 1).map(k => h[k]?.code), a.name]); if (!s.nodeMap.has(key)) { s.nodeMap.set(key, s.nodes.length); s.nodes.push({i: s.nodes.length, lv: ix.levels[i].k, code: a.code, name: a.name || a.code}); } return s.nodeMap.get(key); });
   const p = {n, dm: r.demand, d: {}, pg: {[yi]: S.pdf_key === 'volume' ? [r.source.volume, r.source.page] : r.source.page}};
   // Keep each printed leaf separate; never sum repeated BE publications.
   for (const a of r.amounts) { const f = fys.indexOf(a.fiscal_year); if (f < 0 || a.value == null) continue; const m = a.measure === 'accounts' ? 'ac' : a.measure === 'revised_estimate' ? 're' : a.fiscal_year === year ? 'be' : 'bp'; add(p.d, m, f, Number(a.value)); }
   s.paths.push(p);
   // Link a source PDF only when the data repository ships it (all parts of a ';'-joined value).
   const file = r.source.file;
   if (file) { if (!pdfOk.has(file)) pdfOk.set(file, file.split(';').every(f => existsSync(path.join(base, f)))); if (pdfOk.get(file)) ix.pdfs[year][S.pdf_key === 'volume' ? String(r.source.volume) : r.demand] = file; }
  }
  console.log(st, year);
 }
 for (const [code, s] of [...shards].sort()) {
  const d = {}; for (const p of s.paths) { let dm = dmMap.get(p.dm); if (!dm) { dm = {dm: p.dm, n: demands[p.dm] || p.dm, mjs: new Set(), d: {}}; dmMap.set(p.dm, dm); } dm.mjs.add(code); for (const [m, vs] of Object.entries(p.d)) for (const [f, v] of Object.entries(vs)) { add(d, m, f, v); add(ix.totals, m, f, v); add(dm.d, m, f, v); } }
  const g = ix.sector_groups.find(g => +code >= g.lo && +code <= g.hi);
  const record = {c: code, n: s.name, sector: +code < 4000 ? 'revenue' : +code < 6000 ? 'capital' : +code <= 6010 ? 'debt' : 'loans', g: g?.k || 'other', d, np: s.paths.length, flagged: {}};
  delete s.nodeMap; await write(`${root}/${st}/major/${code}.json`, s); record.kb = Math.ceil(JSON.stringify(s).length / 1024); ix.majors.push(record);
 }
 // Drop shards of major heads that no longer exist in the package.
 for (const f of await fs.readdir(`${root}/${st}/major`)) if (!shards.has(f.replace(/\.json$/, ''))) await fs.unlink(`${root}/${st}/major/${f}`);
 ix.demands_data = [...dmMap.values()].map(d => ({...d, mjs: [...d.mjs].sort()}));
 // Name only demands that have leaf rows; a demand printed without object-head tables (MH 2010-11 D-14) has no data here.
 ix.demands = Object.fromEntries(Object.entries(demands).filter(([k]) => dmMap.has(k)));
 await write(`${root}/${st}/index.json`, ix);
 await write(`${root}/${st}/quality.json`, {years: {}, worst: [], unavailable: 'Validation badge rebuild is pending in this recovered preview.'});
 const entries = ix.majors.map(m => [m.c, m.n, 'mj', [m.c], (m.d.be?.[fys.length - 1] || 0) / ix.crore_div]);
 for (const s of shards.values()) for (const n of s.nodes) entries.push([n.code, n.name, n.lv, [s.major], 0]);
 for (const [part, lvs] of Object.entries({core: ['mj', 'sm', 'mn'], subheads: ['sh'], detailed: ['dh'], leaves: ['lf']})) await write(`${root}/${st}/search/${part}.json`, {entries: entries.filter(e => lvs.includes(e[2]))});
 const latest = fys.length - 1, ac = latest - 2;
 const rec = {st, code: prefix, name: ix.name, n_years: years.length, first: years[0], last: years.at(-1), majors: ix.majors.length, leaf_rows: ix.n_leaf_rows, be: {fy: fys[latest], cr: ix.totals.be[latest] / ix.crore_div}, exec: {fy: fys[ac], pct: 100 * ix.totals.ac[ac] / ix.totals.be[ac]}};
 if (S.native) Object.assign(rec, {native: S.native, lang: S.lang});
 states.push(rec);
 provStates[st] = {commit: git('log', '-1', '--format=%H', '--', pkg), package_dir: pkg, unit: S.unit, crore_div: S.crore_div, leaf: S.leaf, leaf_rule: S.leaf_rule};
}
await write(`${root}/states.json`, {states});
await write(`${root}/excluded-rows.json`, excluded);
await write(`${root}/provenance.json`, {repository: 'https://github.com/xKDR/india-public-finance-portal', commit: '371c1e5d79a7f2dfcb8d55f21867330384093910', inputs: 'state-finances/*/*_years/*/*_json/*_budget_leaves_*.ndjson', note: 'Every amount rebuilt from repository additive leaves. Hosted budget JSON is not used. Validation badges are pending. `commit` is the Karnataka and Tamil Nadu source of the first build; `states.<st>.commit` is the last data-repository commit that changed each package.', states: provStates});
