// Runs google-drive/Code.gs inside Node with in-memory stand-ins for DriveApp, SpreadsheetApp, etc.,
// and serves it like an Apps Script web app (POST -> doPost, JSON + CORS) on a local port.
const fs=require('fs');const vm=require('vm');const http=require('http');
let nid=0;const newId=()=>('id'+(++nid)).padEnd(30,'x');
const files=new Map(),folders=new Map();
function Folder(name,parent){const f={id:newId(),name,parent,trashed:false,kids:[],files:[]};folders.set(f.id,f);if(parent)parent.kids.push(f);return wrapF(f)}
function wrapF(f){return {getId:()=>f.id,getName:()=>f.name,setName:n=>{f.name=n},isTrashed:()=>f.trashed,setTrashed:t=>{f.trashed=t},getUrl:()=>'https://drive.google.com/drive/folders/'+f.id,
  getFoldersByName:n=>{const l=f.kids.filter(k=>k.name===n&&!k.trashed);let i=0;return {hasNext:()=>i<l.length,next:()=>wrapF(l[i++])}},
  createFolder:n=>Folder(n,f),
  getFiles:()=>{const l=f.files.filter(x=>!x.trashed);let i=0;return {hasNext:()=>i<l.length,next:()=>wrapFile(l[i++])}},
  createFile:b=>{const x={id:newId(),name:b.name,type:b.type,size:b.bytes.length,bytes:b.bytes,trashed:false,folder:f};files.set(x.id,x);f.files.push(x);return wrapFile(x)},_raw:f}}
function wrapFile(x){return {getBlob:()=>({getBytes:()=>Buffer.from(x.bytes||[]),getContentType:()=>x.type}),getId:()=>x.id,getUrl:()=>'https://drive.google.com/file/d/'+x.id+'/view',isTrashed:()=>x.trashed,setTrashed:t=>{x.trashed=t},moveTo:fo=>{x.folder=fo._raw;fo._raw.files.push(x)}}}
const rootF=Folder('My Drive',null);
const sheets=new Map();
function Sheet(name){const rows=[];let gid=Math.floor(Math.random()*1e6);
  const s={name,rows,getSheetId:()=>gid,getLastRow:()=>rows.length,getLastColumn:()=>rows.reduce((m,r)=>Math.max(m,r.length),0),setFrozenRows:()=>{},
   getRange:(r,c,nr=1,nc=1)=>({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((rows[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
     getValue:()=>(rows[r-1]||[])[c-1]??'',setValue:v=>{(rows[r-1]=rows[r-1]||[])[c-1]=v;return {setFontWeight:()=>{}}},setFontWeight:()=>{},
     setValues:vs=>{vs.forEach((row,i)=>row.forEach((v,j)=>{(rows[r-1+i]=rows[r-1+i]||[])[c-1+j]=v}))}})};return s}
function SS(name){const x={id:newId(),name,tabs:[Sheet('Sheet1')]};sheets.set(x.id,x);files.set(x.id,{id:x.id,name,trashed:false,folder:null,size:0});
  return wrapSS(x)}
function wrapSS(x){return {getId:()=>x.id,getUrl:()=>'https://docs.google.com/spreadsheets/d/'+x.id,getSheetByName:n=>x.tabs.find(t=>t.name===n)||null,
  insertSheet:n=>{const t=Sheet(n);x.tabs.push(t);return t},getSheets:()=>x.tabs,deleteSheet:t=>{x.tabs=x.tabs.filter(y=>y!==t)},_raw:x}}
const props=new Map();const cache=new Map();
const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)??null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
  DriveApp:{getRootFolder:()=>rootF,getFolderById:id=>{const f=folders.get(id);if(!f)throw new Error('no folder');return wrapF(f)},getFileById:id=>{const f=files.get(id);if(!f)throw new Error('no file');return wrapFile(f)}},
  SpreadsheetApp:{create:n=>SS(n),openById:id=>wrapSS(sheets.get(id))},
  Utilities:{getUuid:()=>require('crypto').randomUUID(),base64Decode:s=>Buffer.from(s,'base64'),
    newBlob:(bytes,type,name)=>({bytes,type,name,getDataAsString:()=>Buffer.from(bytes).toString('utf8')}),
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    computeDigest:(alg,v)=>[...require('crypto').createHash('sha256').update(typeof v==='string'?Buffer.from(v,'utf8'):Buffer.from(v.map(b=>b&255))).digest()].map(b=>b>127?b-256:b),
    computeHmacSha256Signature:(v,k)=>[...require('crypto').createHmac('sha256',k).update(v).digest()].map(b=>b>127?b-256:b),
    base64Encode:a=>(Buffer.isBuffer(a)?a:Buffer.from(a.map(b=>b&255))).toString('base64'),
    base64EncodeWebSafe:a=>(typeof a==='string'?Buffer.from(a,'utf8'):Buffer.from(a.map(b=>b&255))).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
    base64DecodeWebSafe:s=>[...Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64')]},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  ContentService:{createTextOutput:t=>({text:t,setMimeType(){return this}}),MimeType:{JSON:'json'}},
  UrlFetchApp:{fetch:(url)=>{const q=decodeURIComponent(url.split('q=')[1].split('&')[0]);const ms=url.includes('hl=ms');global.__fetches=(global.__fetches||0)+1;
    const now=Date.now();const mk=(t,src,h)=>`<item><title>${t} - ${src}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(t).slice(0,40)}</link><pubDate>${new Date(now-h*36e5).toUTCString()}</pubDate><description>&lt;a href="x"&gt;x&lt;/a&gt;</description><source url="https://example.com">${src}</source></item>`;
    let items='';if(q.includes('DOSH'))items=mk('TEST DOSH inspection drive &amp; new guideline','Test Daily',5)+mk('TEST JKKP campaign','Test Berita',30);
    else if(q.includes('Department of Environment'))items=mk('TEST DOE river pollution notice','Test Times',10);
    else if(q.includes('workplace accident'))items=mk(ms?'TEST Pekerja maut di kilang':'TEST Worker killed at factory','Test Star',2)+mk('TEST Worker killed at factory','Test Star',2)+mk('TEST old accident','Test Star',24*60);
    else items=mk('TEST NIOSH safety week <![CDATA[special]]>','Test Post',40);
    return {getResponseCode:()=>200,getContentText:()=>`<?xml version="1.0"?><rss><channel><title>x</title>${items}</channel></rss>`}}},
  ScriptApp:{getProjectTriggers:()=>[],deleteTrigger:()=>{},newTrigger:()=>{const o={timeBased:()=>o,everyDays:()=>o,atHour:()=>o,inTimezone:()=>o,create:()=>{global.__trigger=true;return o}};return o}},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  Logger:{log:m=>console.log('[gas] '+m)},console
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
ctx.setup();
fs.writeFileSync(process.argv[3],'users');
http.createServer((q,r)=>{const h={'access-control-allow-origin':'*','content-type':'application/json'};
  if(q.method==='OPTIONS'){r.writeHead(204,h);return r.end()}
  if(q.url.startsWith('/admin?')){const u=new URL('http://x'+q.url);const ss=[...sheets.values()][0];const t=ss.tabs.find(x=>x.name==='Users');
    const i=t.rows.findIndex(r=>String(r[0]).toLowerCase()===u.searchParams.get('email'));const col=t.rows[0].indexOf(u.searchParams.get('col')||'New password');
    if(i<0){t.rows.push([u.searchParams.get('email'),u.searchParams.get('name')||'X','Yes']);}const row=t.rows[i<0?t.rows.length-1:i];row[col]=u.searchParams.get('v');cache.clear();r.writeHead(200,h);return r.end('{"ok":true}')}
  if(q.url==='/fetches'){r.writeHead(200,h);return r.end(JSON.stringify({fetches:global.__fetches||0,trigger:!!global.__trigger}))}
  if(q.url==='/state'){r.writeHead(200,h);const tree=f=>({name:f.name,trashed:f.trashed,files:f.files.filter(x=>!x.trashed).map(x=>x.name+' ('+x.size+')'),kids:f.kids.filter(k=>!k.trashed).map(tree)});
    const ss=[...sheets.values()][0];return r.end(JSON.stringify({tree:tree(rootF._raw),tabs:ss.tabs.map(t=>({name:t.name,rows:t.rows}))}))}
  let b='';q.on('data',d=>b+=d);q.on('end',()=>{try{const o=ctx.doPost({postData:{contents:b}});r.writeHead(200,h);r.end(o.text)}catch(e){r.writeHead(500,h);r.end(JSON.stringify({ok:false,error:String(e)}))}})
}).listen(Number(process.argv[4]||8790),()=>console.log('[gas] listening'));
