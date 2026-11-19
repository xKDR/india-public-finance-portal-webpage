// Check the Site navigation of every page and the generated data of every state in states.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STATES} from './states.mjs';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=STATES.map(s=>s.name).join('|');
let count=0;
async function scan(d){for(const e of await fs.readdir(d,{withFileTypes:true})){if(e.name==='data'||e.name==='tools'||e.name.startsWith('.'))continue;const f=path.join(d,e.name);if(e.isDirectory())await scan(f);else if(f.endsWith('.html')){const h=await fs.readFile(f,'utf8');const nav=h.match(/<nav[^>]*aria-label="Site"[^>]*>([\s\S]*?)<\/nav>/);if(nav){if(new RegExp(`>\\s*(${names})\\s*</a>`).test(nav[1]))throw Error(f);count++;}}}}
await scan(site);
const data=path.join(site,'public-finance/data');
const sj=JSON.parse(await fs.readFile(`${data}/states.json`,'utf8'));
const cix=JSON.parse(await fs.readFile(`${data}/compare/index.json`,'utf8'));
for(const S of STATES){
 const ix=JSON.parse(await fs.readFile(`${data}/${S.st}/index.json`,'utf8'));
 for(const vs of Object.values(ix.totals))for(const v of Object.values(vs))if(!Number.isFinite(v))throw Error(`${S.st}: invalid total`);
 if(ix.unit!==S.unit||ix.crore_div!==S.crore_div)throw Error(`${S.st}: unit ${ix.unit}/${ix.crore_div}, table ${S.unit}/${S.crore_div}`);
 if(ix.levels.find(l=>l.k==='lf').label!==S.leaf_label)throw Error(`${S.st}: leaf label`);
 for(const m of ix.majors)await fs.access(`${data}/${S.st}/major/${m.c}.json`);
 for(const part of ['core','subheads','detailed','leaves'])JSON.parse(await fs.readFile(`${data}/${S.st}/search/${part}.json`,'utf8'));
 if(!sj.states.some(s=>s.st===S.st))throw Error(`${S.st}: not in states.json`);
 if(!cix.states.some(s=>s.k===S.st))throw Error(`${S.st}: not in compare/index.json`);
 for(const page of ['explore','dashboard','series'])await fs.access(path.join(site,'public-finance',S.st,page+'.html'));
 const tab=await fs.readFile(path.join(site,'explore.html'),'utf8');
 if(!tab.includes(`data-explore-state="${S.st}"`))throw Error(`${S.st}: no Explore tab`);
 console.log(`${S.st}: ${ix.majors.length} major heads, ${ix.n_leaf_rows} leaves, totals finite, pages and tab present`);
}
console.log(`${count} Site navigation blocks verified; all state totals finite.`);
