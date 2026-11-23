// End-to-end + stress test for the HSSE Safety app, with a mock of the claude.ai runtime (shared db, assets, downloads, user).
const {chromium,devices}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const SP=path.resolve(__dirname,'..');const QA=__dirname;
const results=[];const ok=(name,cond,info='')=>{results.push({name,pass:!!cond,info});console.log((cond?'PASS ':'FAIL ')+name+(info?' — '+info:''))};
const MOCK=`
(()=>{const store=new Map(),subs={};const clone=o=>JSON.parse(JSON.stringify(o));let writes=0;
 const snap=c=>({docs:[...store.entries()].filter(([k])=>k.split('/')[0]===c).map(([k,v])=>({id:k.split('/')[1],exists:true,data:()=>clone(v)}))});
 const notify=c=>(subs[c]||[]).forEach(f=>setTimeout(()=>f(snap(c)),5));
 const delay=()=>new Promise(r=>setTimeout(r,window.__lat??40));
 const db={collection:c=>({doc:id=>({set:async d=>{await delay();const s=JSON.stringify(d).length;if(s>256*1024)throw {code:'invalid_argument',message:'document over 256 KiB ('+s+')'};writes++;store.set(c+'/'+id,clone(d));notify(c)},
   get:async()=>{await delay();const v=store.get(c+'/'+id);return {exists:!!v,data:()=>v&&clone(v)}},
   delete:async()=>{await delay();store.delete(c+'/'+id);notify(c)}}),
   onSnapshot:(next,err)=>{(subs[c]=subs[c]||[]).push(next);setTimeout(()=>next(snap(c)),20);return()=>{}}})};
 const assetsBlobs=new Map();let n=0;
 const assets={upload:async(b)=>{await delay();if(b.size>20*1024*1024)throw {code:'too_large'};const id=(++n).toString(16).padStart(32,'0');assetsBlobs.set(id,b);window.__assetBytes=(window.__assetBytes||0)+b.size;return {id,url:'/_blob/'+id,sizeBytes:b.size,contentType:b.type}}};
 window.__saved=[];const downloads={save:async r=>{let size=0;if(typeof r.data==='string')size=r.data.length;else size=r.data.size;window.__saved.push({filename:r.filename,size,text:typeof r.data==='string'?r.data:null,blob:r.data});return {status:'saved'}}};
 const user={id:async()=>'u_tester',isOwner:()=>true,canEdit:()=>true,can:()=>true};
 window.__store=store;window.__writes=()=>writes;window.__assetsBlobs=assetsBlobs;
 window.claude={use:async name=>{await new Promise(r=>setTimeout(r,30));return ({db,assets:window.__noAssets?null:assets,downloads,user})[name]??null}};
})();`;
// tiny server: serves the page and /_blob/<id> (asks the page for the bytes)
const html=fs.readFileSync('/home/user/hsse-site-audit.html','utf8');
const page_html=`<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style></head><body>${html}</body></html>`;
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(page_html)}).listen(8765);
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({...devices['iPhone 13']});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts.g|Failed to load resource/.test(m.text()))errs.push(m.text())});
 await p.addInitScript(MOCK);
 await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
 await p.route(/\/_blob\//,async r=>{const id=r.request().url().split('/_blob/')[1];const b64=await p.evaluate(async id=>{const b=window.__assetsBlobs.get(id);if(!b)return null;const buf=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=8192)s+=String.fromCharCode(...buf.subarray(i,i+8192));return btoa(s)},id);
   if(!b64)return r.fulfill({status:404});r.fulfill({body:Buffer.from(b64,'base64'),contentType:'image/jpeg'})});
 const noOverflow=async(tag)=>{const w=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(`No sideways scroll on phone: ${tag}`,w<=1,`extra ${w}px`)};
 const files=i=>[...Array(i)].map((_,k)=>path.join(QA,`big${k%6}.jpg`));
 const pick=async(sel,n)=>{const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click(sel)]);await fc.setFiles(files(n));};
 const sign=async(key)=>{const c=p.locator(`canvas[data-sig="${key}"]`);await c.evaluate(e=>e.scrollIntoView({block:"center"}));await p.waitForTimeout(100);const bb=await c.boundingBox();
   await p.mouse.move(bb.x+20,bb.y+bb.height/2);await p.mouse.down();for(let i=0;i<12;i++)await p.mouse.move(bb.x+20+i*20,bb.y+bb.height/2+(i%2?25:-25));await p.mouse.up();await p.click(`[data-sigsave="${key}"]`)};

 await p.goto('http://localhost:8765/');await p.waitForTimeout(400);
 ok('App opens with shared database (no "this device only" notice)',!(await p.isVisible('.notice')));
 await noOverflow('Site audits list');

 // ---------- SITE AUDIT ----------
 await p.click('[data-tab="list"]');await p.click('#btnNew');await p.waitForTimeout(200);
 await p.click('#btnSubmit');let modal=await p.textContent('#modal');
 ok('Empty audit cannot be submitted',/Complete the audit first/.test(modal));
 ok('Missing list names all required details',['Location site','Client','Work conducted','Audit by','Sharing photo','Name of Site Engineer','Team Contractor','Auditor signature','Choose Yes / No for 17 sections'].every(t=>modal.includes(t)),modal.slice(0,300));
 await p.click('#mOk');
 const XSS='<img src=x onerror="window.__xss=1">"\'&<b>';
 await p.fill('#f_site',`PS Bukit Ö ${XSS}`);await p.selectOption('#f_client','Shell');await p.fill('#f_work','Pasang lampu kanopi & tukar papan tanda – kerja tinggi '+'x'.repeat(300));
 await p.selectOption('#f_auditBy','Masitah');await p.selectOption('#f_engineer','Johan');await p.click('[data-con="S&F"]');await p.click('[data-con="J&H"]');await p.fill('#f_manpower','12');
 await pick('[data-addph="share"]',3);await p.waitForSelector('[data-pkey="share"] .ph:not(.loading) >> nth=2',{timeout:20000});
 ok('3 large phone photos (3000×2250) upload to sharing photo',(await p.locator('[data-pkey="share"] img').count())===3);
 await sign('sigAuditor');ok('Auditor signature saves',await p.isVisible('img[alt="Signature of auditor"]'));
 // sections: switch off 5, answer the rest; one No with comment, one No without (should block)
 const secs=await p.$$eval('[data-secon][data-val="1"]',b=>b.map(x=>x.dataset.secon));
 const off=['scf','crn','grn','wst','spb'];
 for(const s of secs){await p.click(`[data-secon="${s}"][data-val="${off.includes(s)?0:1}"]`)}
 const qids=await p.$$eval('[data-secbody]:not([hidden]) [data-q]',e=>e.map(x=>x.dataset.q));
 for(const [i,q] of qids.entries()){await p.click(`[data-q="${q}"] [data-ans="${i%7===3?'N':i%5===4?'NA':'Y'}"]`)}
 const nqs=qids.filter((_,i)=>i%7===3);
 await p.click('#btnSubmit');modal=await p.textContent('#modal');
 ok('No-without-comment blocks submit',modal.includes(`${nqs.length} Not comply item`),modal.slice(0,200));await p.click('#mOk');
 ok('No-without-comment boxes highlighted red',(await p.locator('textarea.c-missing').count())===nqs.length);
 for(const q of nqs)await p.fill(`#c_${q}`,`Temuan: ${XSS} – tindakan pembetulan diperlukan`);
 await pick(`[data-addph="q:${nqs[0]}"]`,2);await p.waitForTimeout(2500);
 await p.fill('#x_doc2','OM/JHA/PS003');await p.selectOption('#f_ackName','Haziq Sr');await sign('sigAck');
 await p.waitForTimeout(1200);
 const saved=await p.evaluate(()=>{const v=[...window.__store.entries()].find(([k])=>k.startsWith('audits/'));return v&&v[1]});
 ok('Draft auto-saves to shared database while typing',saved&&saved.site.startsWith('PS Bukit'));
 const docSize=await p.evaluate(()=>Math.max(...[...window.__store.entries()].filter(([k])=>k.startsWith('audits/')).map(([,v])=>JSON.stringify(v).length)));
 ok('Audit record stays well under the 256 KB database limit',docSize<200*1024,`${Math.round(docSize/1024)} KB`);
 const expY=qids.filter((_,i)=>!(i%7===3)&&!(i%5===4)).length,expN=nqs.length;
 const bar=await p.textContent('#scorebar');ok('Live score matches answers',bar.includes(`${expY} comply`)&&bar.includes(`${expN} not comply`),bar.replace(/\s+/g,' ').slice(0,140));
 await p.click('#btnSubmit');await p.waitForSelector('#mOk');modal=await p.textContent('#modal');
 ok('Complete audit offers Submit',/Submit and close/.test(modal),modal.slice(0,120));await p.click('#mOk');await p.waitForTimeout(600);
 ok('Submitted audit shows as report',await p.isVisible('#btnDl'));
 ok('Special characters shown as text, not run as code',!(await p.evaluate(()=>window.__xss))&&(await p.textContent('h1')).includes('<img'));
 await noOverflow('Audit report');
 const tPdf=Date.now();await p.click('#btnDl');await p.waitForFunction(()=>window.__saved.some(s=>s.filename.endsWith('.pdf')),null,{timeout:90000});
 let pdf=await p.evaluate(()=>window.__saved.at(-1));ok('Audit PDF with 5 photos + 2 signatures downloads',pdf.size>50000,`${pdf.filename}, ${Math.round(pdf.size/1024)} KB, ${((Date.now()-tPdf)/1000).toFixed(1)} s`);
 const pdfBytes=await p.evaluate(async()=>{const b=window.__saved.at(-1).blob;const u=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)});
 fs.writeFileSync(QA+'/audit.pdf',Buffer.from(pdfBytes,'base64'));
 // reopen + list
 await p.click('#btnHome');await p.waitForTimeout(300);
 ok('Audit list shows the closed audit with NC count',(await p.textContent('.list')).includes(`${expN} NC`));
 await p.fill('#fq','bukit');await p.waitForTimeout(100);ok('Search finds audit',(await p.locator('.row').count())===1);
 await p.fill('#fq','zzzz');ok('Search with no match shows message',(await p.textContent('.list')).includes('No audits match'));await p.fill('#fq','');
 await p.click('#btnCsv');await p.waitForTimeout(200);const csv=await p.evaluate(()=>window.__saved.at(-1));
 ok('Audit CSV export',csv.filename.endsWith('.csv')&&csv.text.includes('Not comply – Temuan'),csv.filename);

 // ---------- TASKS ----------
 await p.click('[data-tab="tasks"]');await noOverflow('Task list');
 await p.click('#btnNew');await p.click('#t_save');ok('Empty task cannot be saved',(await p.textContent('#modal')).includes('Date to complete'));await p.click('#mOk');
 const mk=async(title,who,pr,due,time,pct)=>{if(!(await p.isVisible('#t_title'))){await p.click('#btnNew')}await p.fill('#t_title',title);await p.selectOption('#t_who',who);await p.click(`[data-tpr="${pr}"]`);await p.fill('#t_due',due);await p.fill('#t_dueTime',time);if(pct!=null)await p.fill('#t_pctN',String(pct));await p.click('#t_save');await p.waitForTimeout(250)};
 const d=o=>{const x=new Date(Date.now()+o*864e5);return x.toISOString().slice(0,10)};
 await mk('Overdue high task','Ridzuan','H',d(-3),'09:00',20);
 await mk('Due tomorrow medium','Masitah','M',d(1),'17:00',0);
 await mk('Low later '+XSS,'Shaiful Syazwan','L',d(10),'17:00',100);
 const txt=await p.textContent('.list');
 ok('Overdue task flagged "Overdue by"',/Overdue by 3 days/.test(txt)||/Overdue by 2 days/.test(txt));
 ok('100% sets task to Complete (hidden from Open filter)',!txt.includes('Low later'));
 ok('High priority sorted first',(await p.locator('.task .tk-title').first().textContent())==='Overdue high task');
 const tiles=await p.$$eval('.tile .v',e=>e.map(x=>x.textContent));ok('Task counters (Pending 1, On going 1, Complete 1, Overdue 1)',tiles.join(',')==='1,1,1,1',tiles.join(','));
 await p.click('.task >> nth=0');await p.click('[data-tst="C"]');ok('Complete sets 100%',(await p.inputValue('#t_pctN'))==='100');
 await p.fill('#t_note','Barricade installed');await p.click('#t_save');await p.waitForTimeout(250);
 await p.click('[data-tf="C"]');await p.click('.task >> nth=0');ok('Update history keeps every change',(await p.locator('.rq').count())>=2);await p.click('#t_cancel');
 await p.click('[data-tf="all"]');await p.selectOption('#tpr','H');ok('Priority filter',(await p.locator('.task').count())===1);await p.selectOption('#tpr','');
 // double-tap save
 await p.click('#btnNew');await p.fill('#t_title','Double tap');await p.selectOption('#t_who','Ridzuan');await p.fill('#t_due',d(2));
 await p.dblclick('#t_save');await p.waitForTimeout(400);
 const dbl=await p.evaluate(()=>[...window.__store.values()].filter(v=>v.title==='Double tap').length);ok('Double-tapping Save creates only one task',dbl===1,`${dbl} created`);

 // ---------- TOOLBOX ----------
 await p.click('[data-tab="tb"]');await noOverflow('Toolbox list');
 await p.click('#btnNew');await p.click('#tb_save');ok('Empty toolbox cannot be saved',(await p.textContent('#modal')).includes('add at least 1 point'));await p.click('#mOk');
 await p.fill('#tb_by','Encik Ahmad '+XSS);await p.fill('#tb_loc','Kilang – bay 3');
 await p.fill('[data-pt="0"]','Grinding – flying particles');await p.press('[data-pt="0"]','Enter');await p.keyboard.type('Forklift traffic at loading bay');
 await p.click('#tb_addpt');await p.click('#tb_addpt');await p.keyboard.type('Hot work permit');
 await pick('#tb_add',4);await p.waitForSelector('#tb_ph .ph:not(.loading) >> nth=3',{timeout:20000});
 await p.click('#tb_save');await p.waitForTimeout(400);
 const pts=await p.$$eval('.pts-view li',e=>e.map(x=>x.textContent));ok('Blank points are dropped, 3 points saved',pts.length===3,pts.join(' | '));
 await p.click('#tbPdf');await p.waitForFunction(()=>window.__saved.at(-1).filename.startsWith('Toolbox'),null,{timeout:60000});
 pdf=await p.evaluate(()=>window.__saved.at(-1));ok('Toolbox PDF with 4 photos downloads',pdf.size>30000,`${Math.round(pdf.size/1024)} KB`);
 ok('No script errors during full walkthrough',errs.length===0,errs.slice(0,3).join(' | '));

 // ---------- PHOTO FALLBACK (no asset upload permission) ----------
 await p.evaluate(()=>{window.__noAssets=true;assets=null});
 await p.click('#tbEdit');await pick('#tb_add',2);await p.waitForTimeout(3000);await p.click('#tb_save');await p.waitForTimeout(500);
 const ph=await p.evaluate(()=>[...window.__store.keys()].filter(k=>k.startsWith('photos/')).length);ok('Photos still save when asset upload is not allowed',ph===2,`${ph} stored as compressed copies`);
 await p.evaluate(()=>{assets={upload:async()=>{throw {code:'x'}}}});

 // ---------- STRESS ----------
 await p.evaluate(()=>{const now=Date.now();const st=window.__store;
   for(let i=0;i<400;i++){const id='s'+i;st.set('audits/'+id,{id,formId:'x',status:i%3?'closed':'draft',site:'Stress site '+i,client:'Petronas',conductedOn:new Date(now-i*864e5).toISOString().slice(0,10),work:'Work '+i,auditBy:'Ridzuan',answers:{wah1:{v:'Y'},trf3:{v:'N',c:'c'}},secOn:{wah:true,trf:true},pct:50+i%50,nc:i%4,sharingPhotos:[],sectionPhotos:{}})}
   for(let i=0;i<800;i++){const id='t'+i;st.set('tasks/'+id,{id,title:'Stress task '+i,assignee:['Ridzuan','Masitah','Shaiful Syazwan'][i%3],priority:'HML'[i%3],status:'POC'[i%3],pct:[0,50,100][i%3],due:new Date(now+(i-400)*36e5).toISOString().slice(0,10),dueTime:'17:00',log:[]})}
   for(let i=0;i<400;i++){const id='b'+i;st.set('toolbox/'+id,{id,briefBy:'P'+i,date:new Date(now-i*864e5).toISOString().slice(0,10),time:'08:00',location:'Bay '+i,points:['Point a','Point b'],photos:[]})}});
 const reload=async()=>{await p.evaluate(async()=>{const db=await window.claude.use('db');await db.collection('audits').doc('s0').set(window.__store.get('audits/s0'));await db.collection('tasks').doc('t0').set(window.__store.get('tasks/t0'));await db.collection('toolbox').doc('b0').set(window.__store.get('toolbox/b0'))});await p.waitForTimeout(800)};
 await reload();let t0=Date.now();await p.click('[data-tab="list"]');await p.waitForSelector('.row');ok('400 audits: list opens fast',Date.now()-t0<1500,`${Date.now()-t0} ms`);
 t0=Date.now();await p.type('#fq','Stress site 39',{delay:0});ok('400 audits: search while typing stays responsive',Date.now()-t0<3000,`${Date.now()-t0} ms for 14 keystrokes`);
 ok('Search typing keeps focus in the box',await p.evaluate(()=>document.activeElement.id==='fq'));
 t0=Date.now();await p.click('[data-tab="tasks"]');await p.waitForSelector('.task');ok('800 tasks: list opens fast',Date.now()-t0<2000,`${Date.now()-t0} ms`);
 t0=Date.now();await p.click('[data-tf="all"]');ok('800 tasks: show all',Date.now()-t0<2000,`${Date.now()-t0} ms, ${await p.locator('.task').count()} cards`);
 t0=Date.now();await p.click('[data-tab="tb"]');await p.waitForSelector('.tbrow');ok('400 toolbox meetings: list opens fast',Date.now()-t0<1500,`${Date.now()-t0} ms`);
 // slow network: 1.5 s per write while typing fast in audit
 await p.evaluate(()=>window.__lat=1500);await p.click('[data-tab="list"]');await p.click('#btnNew');
 const w0=await p.evaluate(()=>window.__writes());await p.type('#f_site','Slow network test site name',{delay:30});await p.waitForTimeout(6000);
 const w1=await p.evaluate(()=>window.__writes());const last=await p.evaluate(()=>[...window.__store.values()].find(v=>v.site&&v.site.startsWith('Slow'))?.site);
 ok('Slow network: fast typing is batched, last text saved',last==='Slow network test site name'&&w1-w0<=4,`${w1-w0} writes, saved "${last}"`);
 await p.evaluate(()=>window.__lat=40);

 // ---------- DESKTOP + DARK ----------
 const dctx=await b.newContext({viewport:{width:1366,height:900},colorScheme:'dark'});const dp=await dctx.newPage();const derrs=[];dp.on('pageerror',e=>derrs.push(e.message));
 await dp.addInitScript(MOCK);await dp.goto('http://localhost:8765/');await dp.waitForTimeout(400);await dp.click('[data-tab="list"]');await dp.click('#btnNew');await dp.click('[data-secon="wah"][data-val="1"]');await dp.click('[data-q="wah1"] [data-ans="N"]');
 await dp.screenshot({path:QA+'/desktop-dark.png'});
 const contrast=await dp.evaluate(()=>{const l=document.querySelector('.fld label');return getComputedStyle(l).color});ok('Dark mode labels use light blue (readable)',contrast.includes('154, 168, 255'),contrast);
 ok('Desktop: no script errors',derrs.length===0,derrs.join('|'));
 await p.screenshot({path:QA+'/phone-toolbox.png'});
 fs.writeFileSync(QA+'/results.json',JSON.stringify(results,null,1));
 console.log(`\n${results.filter(r=>r.pass).length}/${results.length} passed`);
 await b.close();srv.close();
})().catch(e=>{console.error('CRASH',e);fs.writeFileSync(QA+'/results.json',JSON.stringify(results,null,1));process.exit(1)});
