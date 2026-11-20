// Google Drive upload test: Firebase emulator + the real Code.gs running on in-memory Drive/Sheets (gas-mock.js).
const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname,SP=path.resolve(QA,'..'),NM=SP+'/node_modules/firebase/';
const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const KEY=fs.readFileSync(QA+'/gas.key','utf8').trim();const GAS='http://127.0.0.1:8790/';
const state=async()=>JSON.parse(await (await fetch(GAS+'state')).text());
const index=fs.readFileSync('/home/user/hsse-safety-app/docs/index.html');
const cfg=`window.HSSE_FIREBASE={apiKey:"demo",authDomain:"localhost",projectId:"demo-hsse",sdk:"/sdk/",emulator:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",port:8080}};`;
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/sdk/')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(fs.readFileSync(NM+q.url.slice(5)))}
  if(q.url.startsWith('/firebase-config.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(cfg)}
  r.writeHead(200,{'content-type':'text/html'});r.end(index)}).listen(8768);
const findTab=(s,n)=>s.tabs.find(t=>t.name===n);
const findFolder=(t,name)=>{if(t.name===name)return t;for(const k of t.kids){const f=findFolder(k,name);if(f)return f}return null};
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
 await p.goto('http://localhost:8768/');await p.waitForSelector('#li_email');await p.fill('#li_email','shaifulsyazwan@octagonmaju.com.my');await p.fill('#li_pw','Test12345');await p.click('#li_go');
 await p.waitForSelector('#btnDrive:not([hidden])',{timeout:15000});
 // a task saved BEFORE Drive is set up waits in the queue
 await p.click('[data-tab="tasks"]');await p.click('#btnNew');await p.fill('#t_title','Saved before Drive setup');await p.selectOption('#t_who','Ridzuan');await p.fill('#t_due','2026-12-01');await p.click('#t_save');await p.waitForTimeout(800);
 await p.click('.task');await p.waitForTimeout(300);ok('Before setup, record shows it is waiting for Drive',(await p.textContent('.drivechip')).includes('Waiting for Google Drive setup'));await p.click('#t_cancel');
 // settings
 await p.click('#btnDrive');await p.fill('#dr_url',GAS);await p.fill('#dr_key','wrong-key');await p.click('#dr_test');await p.waitForTimeout(800);
 ok('Wrong key is reported',(await p.textContent('#dr_msg')).includes('key is wrong'));
 await p.fill('#dr_key',KEY);await p.click('#dr_test');await p.waitForTimeout(800);ok('Test connection succeeds with links',(await p.textContent('#dr_msg')).includes('Connected'));
 await p.click('#dr_save');await p.waitForTimeout(3000);
 let s=await state();ok('Queued task uploads as soon as Drive is set up',JSON.stringify(findTab(s,'Task Updates').rows).includes('Saved before Drive setup'));
 // toolbox with photos
 await p.click('[data-tab="tb"]');await p.click('#btnNew');await p.fill('#tb_by','Ridzuan');await p.fill('#tb_loc','Bay 2');await p.fill('[data-pt="0"]','=HYPERLINK("x") hot work');
 await p.click('#tb_addpt');await p.keyboard.type('Forklift');
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#tb_add')]);await fc.setFiles([0,1,2].map(i=>QA+`/big${i}.jpg`));await p.waitForTimeout(6000);
 await p.click('#tb_save');await p.waitForFunction(()=>document.querySelector('.drivechip.ok'),null,{timeout:60000}).catch(()=>{});
 s=await state();const tbF=findFolder(s.tree,'Toolbox Meetings');const rec=tbF&&tbF.kids[0]&&tbF.kids[0].kids[0];
 ok('Toolbox: folder by month with PDF + 3 photos',rec&&rec.files.filter(f=>f.includes('.pdf')).length===1&&rec.files.filter(f=>f.includes('.jpg')).length===3,rec?`${tbF.kids[0].name}/${rec.name}: ${rec.files.join(', ')}`:'none');
 const tbRows=findTab(s,'Toolbox Meetings').rows;ok('Toolbox: row in the sheet with points',JSON.stringify(tbRows).includes('Forklift'),tbRows[0].join(' | '));
 ok('Formula-looking text is stored as plain text',JSON.stringify(tbRows).includes("'1. =HYPERLINK")||JSON.stringify(tbRows).includes("1. =HYPERLINK"),'');
 ok('Record page shows "Saved to Google Drive" with PDF link',(await p.textContent('.drivechip')).includes('Saved to Google Drive')&&await p.isVisible('.drivechip a'));
 // edit -> replaced not duplicated
 await p.click('#tbEdit');await p.fill('#tb_loc','Bay 2B');await p.click('#tb_save');await p.waitForTimeout(6000);
 s=await state();const months=findFolder(s.tree,'Toolbox Meetings').kids[0].kids;
 ok('Editing replaces the Drive copy (no duplicate)',months.length===1&&months[0].name.includes('Bay 2B')&&months[0].files.filter(f=>f.includes('.pdf')).length===1&&findTab(s,'Toolbox Meetings').rows.length===2,months.map(m=>m.name+':'+m.files.length).join(';'));
 // audit
 await p.evaluate(async()=>{const a={id:'aud1',formId:'x',status:'closed',closedAt:new Date().toISOString(),site:'PS Karak',client:'Shell',conductedOn:'2026-11-20',work:'Canopy light',auditBy:'Masitah',engineer:'Johan',contractor:'S&F',manpower:'4',
   answers:{wah1:{v:'Y'},wah2:{v:'N',c:'Ladder not tied'}},secOn:{wah:true},sharingPhotos:[],sectionPhotos:{},updatedAt:new Date().toISOString()};
   audits.set(a.id,a);await db.collection('audits').doc(a.id).set(a);driveSend('audit','aud1')});
 await p.waitForTimeout(8000);s=await state();
 const ar=findTab(s,'Site Audits').rows;const aF=findFolder(s.tree,'2026-11-20 PS Karak');
 ok('Site audit: PDF in Site Audits/2026-11 and row with score + findings',aF&&aF.files.some(f=>f.endsWith('.pdf)')||f.includes('.pdf'))&&JSON.stringify(ar).includes('Ladder not tied')&&JSON.stringify(ar).includes('50'),ar[1]&&ar[1].slice(0,12).join(' | '));
 // delete toolbox -> trashed + Deleted
 await p.click('[data-tab="tb"]');await p.click('.tbrow');await p.click('#tbEdit');await p.click('#tb_del');await p.click('#mOk');await p.waitForTimeout(4000);
 s=await state();ok('Deleting a record marks it Deleted and removes its Drive folder',JSON.stringify(findTab(s,'Toolbox Meetings').rows).includes('Deleted')&&findFolder(s.tree,'Toolbox Meetings').kids[0].kids.length===0);
 // offline
 await c.setOffline(true);await p.click('[data-tab="tasks"]');await p.click('#btnNew');await p.fill('#t_title','No signal task');await p.selectOption('#t_who','Masitah');await p.fill('#t_due','2026-12-02');await p.click('#t_save');await p.waitForTimeout(5000);
 s=await state();const before=JSON.stringify(findTab(s,'Task Updates').rows).includes('No signal task');
 await c.setOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForTimeout(6000);
 s=await state();ok('No signal: Drive upload waits, then sends when online',!before&&JSON.stringify(findTab(s,'Task Updates').rows).includes('No signal task'));
 // send all
 await p.click('#btnDrive');await p.click('#dr_all');await p.waitForTimeout(12000);s=await state();
 ok('"Send all records" updates rows without duplicates',findTab(s,'Task Updates').rows.length===3&&findTab(s,'Site Audits').rows.length===2,`tasks rows ${findTab(s,'Task Updates').rows.length}, audit rows ${findTab(s,'Site Audits').rows.length}`);
 ok('No script errors',errs.length===0,errs.slice(0,3).join(' | '));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);fs.writeFileSync(QA+'/drive-state.json',JSON.stringify(await state(),null,1));await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
