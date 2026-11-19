// Add validation pass rates to public-finance/data/<st>/{quality,index}.json and
// states.json, and rebuild the shared compare index. Run after build-local-data.mjs.
// Usage:  node tools/prepare-preview.mjs --data <india-public-finance-portal checkout>
// The recovered version also rewrote the HTML (Site navigation, preview banner);
// those steps are dropped because the committed pages already carry the result.
import fs from 'node:fs/promises';
import {existsSync, createReadStream} from 'node:fs';
import path from 'node:path';
import {createGunzip} from 'node:zlib';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {STATES} from './states.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataRepo = path.resolve(arg('--data', path.join(site, '..', 'india-public-finance-portal')));
const root = path.join(site, 'public-finance');
const built = STATES.filter(s => existsSync(`${root}/data/${s.st}/index.json`));

// Quality metrics come from the repository's published validation summaries.
function csv(s){const out=[];let v='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(v);v='';}else v+=c;}out.push(v);return out;}
for(const {st,code:pre,slug} of built){
 const plain=path.join(dataRepo,`state-finances/${slug}/${pre}_validation_summary.csv`);
 const gz=existsSync(plain+'.gz');
 let stream=createReadStream(gz?plain+'.gz':plain);if(gz)stream=stream.pipe(createGunzip());
 let header;const years={},majorFlags=new Map();
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(!header){header=csv(line);continue;}const v=csv(line),r=Object.fromEntries(header.map((k,i)=>[k,v[i]]));
  if(!['Year','Major-Head'].includes(r.level))continue;
  const key=r.document_year+'|'+(r.major_head_code||'');
  let a=r.level==='Year'?years[r.document_year]:majorFlags.get(key);
  if(!a){a={dy:r.document_year,codes:[r.major_head_code],n:0,passed:0,accuracy:0};if(r.level==='Year')years[r.document_year]=a;else majorFlags.set(key,a);}
  a.n+=+r.n_checks;a.passed+=+r.n_passed;a.accuracy+=(+r.mu_accuracy_pct||0)*(+r.n_checks);
 }
 const finish=a=>({...a,pp:a.n?100*a.passed/a.n:0,mu:a.n?a.accuracy/a.n:null});
 const quality={years:Object.fromEntries(Object.entries(years).map(([k,a])=>[k,finish(a)])),worst:[...majorFlags.values()].map(finish).sort((a,b)=>a.pp-b.pp)};
 await fs.writeFile(`${root}/data/${st}/quality.json`,JSON.stringify(quality));
 const ix=JSON.parse(await fs.readFile(`${root}/data/${st}/index.json`,'utf8'));
 for(const m of ix.majors)for(const a of quality.worst.filter(a=>a.codes[0]===m.c))m.flagged[ix.doc_years.indexOf(a.dy)]=[a.n-a.passed,a.n];
 await fs.writeFile(`${root}/data/${st}/index.json`,JSON.stringify(ix));
}
const sj=JSON.parse(await fs.readFile(`${root}/data/states.json`,'utf8'));
for(const s of sj.states){const q=JSON.parse(await fs.readFile(`${root}/data/${s.st}/quality.json`,'utf8'));if(q.years[s.last])s.pass={dy:s.last,pct:q.years[s.last].pp};}
await fs.writeFile(`${root}/data/states.json`,JSON.stringify(sj));
// Reconstruct the shared major-head comparison index from local indexes.
const entries=new Map(),states=[];
for(const {st} of built){const ix=JSON.parse(await fs.readFile(`${root}/data/${st}/index.json`,'utf8'));states.push({k:st,name:ix.name,fys:ix.fys});for(const m of ix.majors){if(!entries.has(m.c))entries.set(m.c,[m.c,'mj',{}]);entries.get(m.c)[2][st]=[m.n,(m.d.be?.[ix.fys.length-1]||0)/ix.crore_div];}}
await fs.mkdir(`${root}/data/compare`,{recursive:true});await fs.writeFile(`${root}/data/compare/index.json`,JSON.stringify({v:1,states,entries:[...entries.values()]}));
