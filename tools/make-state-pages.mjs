// Write public-finance/<st>/{explore,dashboard,series}.html for every state in
// tools/states.mjs except Karnataka and Tamil Nadu, from the Karnataka pages.
// Karnataka's leaf is the object head, as in every added state so far; a state
// with another leaf level needs its own dashboard text.
// Usage:  node tools/make-state-pages.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STATES} from './states.mjs';

const pf = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public-finance');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const S of STATES) {
  if (S.st === 'ka' || S.st === 'tn') continue;
  if (S.leaf !== 'object_head') throw Error(`${S.st}: leaf ${S.leaf} needs its own dashboard text`);
  const native = S.native ? ` · <span lang="${S.lang}">${esc(S.native)}</span>` : '';
  await fs.mkdir(path.join(pf, S.st), {recursive: true});
  for (const page of ['explore', 'dashboard', 'series']) {
    let h = await fs.readFile(path.join(pf, 'ka', page + '.html'), 'utf8');
    h = h.replace('<p class="kicker">Karnataka · state finances</p>',
      `<p class="kicker">${esc(S.name)}${native} · state finances</p>`);
    h = h.replaceAll('../ka/', `../${S.st}/`).replaceAll('state=ka', `state=${S.st}`)
      .replaceAll("state:'ka'", `state:'${S.st}'`).replaceAll('Karnataka', esc(S.name));
    if (/Karnataka|\bka\//.test(h)) throw Error(`${S.st}/${page}: Karnataka text left`);
    await fs.writeFile(path.join(pf, S.st, page + '.html'), h);
  }
  console.log(`${S.st}: explore, dashboard, series`);
}
