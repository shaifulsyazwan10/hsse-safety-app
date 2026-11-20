// Sign-in + Google Drive test (GitHub address): the real Code.gs running on in-memory Drive/Sheets (gas-mock.js on :8790).
const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname,SP=path.resolve(QA,'..');
const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const GAS='http://127.0.0.1:8790/';
const state=async()=>JSON.parse(await (await fetch(GAS+'state')).text());
const admin=(email,v,col)=>fetch(`${GAS}admin?email=${encodeURIComponent(email)}&v=${encodeURIComponent(v)}${col?'&col='+encodeURIComponent(col):''}`);
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/drive-config.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end('window.HSSE_DRIVE_URL="";')}
  r.writeHead(200,{'content-type':'text/html'});r.end(fs.readFileSync('/home/user/hsse-safety-app/docs/index.html'))}).listen(8768);
const tab=(s,n)=>s.tabs.find(t=>t.name===n);const rows=(s,n)=>JSON.stringify(tab(s,n).rows);
const findFolder=(t,name)=>{if(t.name===name)return t;for(const k of t.kids){const f=findFolder(k,name);if(f)return f}return null};
(async()=>{const b=await chromium.launch();const errs=[];
 const phone=async()=>{const c=await b.newContext({...devices['iPhone 13']});await c.addInitScript(()=>{window.HSSE_DRIVE_TEST=true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
   await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
   await p.goto('http://localhost:8768/');await p.waitForSelector('#li_email',{timeout:15000});return {c,p}};
 const signIn=async(p,em,pw,url=true)=>{await p.fill('#li_email',em);await p.fill('#li_pw',pw);if(url&&await p.isVisible('#li_url'))await p.fill('#li_url',GAS);await p.click('#li_go');await p.waitForTimeout(1200)};
 await admin('shaifulsyazwan@octagonmaju.com.my','Start1234');await admin('hsse7@octagonmaju.com.my','Masitah123');
 const {c,p}=await phone();
 ok('App opens on the sign-in screen (records hidden)',await p.isVisible('#li_email')&&!(await p.isVisible('.tabs')));
 await signIn(p,'shaifulsyazwan@octagonmaju.com.my','nope');ok('Wrong password is refused',(await p.textContent('#li_msg')).includes('not correct'));
 await signIn(p,'ShaifulSyazwan@octagonmaju.com.my','Start1234');
 ok('First sign-in with starting password asks to change it',(await p.textContent('h1'))==='Account'&&(await p.textContent('#ac_msg')).includes('change the starting password'));
 await p.fill('#ac_old','Start1234');await p.fill('#ac_new','short');await p.fill('#ac_new2','short');await p.click('#ac_go');ok('Short new password is refused',(await p.textContent('#ac_msg')).includes('at least 8'));
 await p.fill('#ac_new','Safety2026!');await p.fill('#ac_new2','Safety2026!');await p.click('#ac_go');await p.waitForTimeout(800);ok('Password changed',(await p.textContent('#toast')).includes('Password changed'));
 let s=await state();ok('Users sheet keeps only a secure hash, not the password',!rows(s,'Users').includes('Start1234')&&!rows(s,'Users').includes('Safety2026'));
 // task
 await p.click('[data-tab="tasks"]');await p.click('#btnNew');await p.fill('#t_title','Inspect extinguishers');await p.selectOption('#t_who','Ridzuan');await p.fill('#t_due','2026-12-01');await p.click('#t_save');await p.waitForTimeout(2500);
 s=await state();ok('Task copied to the Sheet with "Saved by" name',rows(s,'Task Updates').includes('Inspect extinguishers')&&rows(s,'Task Updates').includes('Shaiful Syazwan'));
 // toolbox with photos
 await p.click('[data-tab="tb"]');await p.click('#btnNew');await p.fill('#tb_by','Ridzuan');await p.fill('#tb_loc','Bay 2');await p.fill('[data-pt="0"]','=HYPERLINK("x") hot work');
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#tb_add')]);await fc.setFiles([0,1,2].map(i=>QA+`/big${i}.jpg`));await p.waitForTimeout(6000);
 await p.click('#tb_save');await p.waitForFunction(()=>document.querySelector('.drivechip.ok'),null,{timeout:60000}).catch(()=>{});
 s=await state();let tbF=findFolder(s.tree,'Toolbox Meetings');let rec=tbF.kids[0]&&tbF.kids[0].kids[0];
 ok('Toolbox: PDF + 3 photos filed by month',rec&&rec.files.filter(f=>f.includes('.pdf')).length===1&&rec.files.filter(f=>f.includes('.jpg')).length===3,rec&&`${tbF.kids[0].name}/${rec.name}`);
 ok('Hazard points saved to the Sheet as plain numbered text',rows(s,'Toolbox Meetings').includes('1. =HYPERLINK'));
 ok('Record shows "Saved to Google Drive · Open PDF"',(await p.textContent('.drivechip')).includes('Saved to Google Drive')&&await p.isVisible('.drivechip a'));
 await p.click('#tbEdit');await p.fill('#tb_loc','Bay 2B');await p.click('#tb_save');await p.waitForTimeout(6000);
 s=await state();const ms=findFolder(s.tree,'Toolbox Meetings').kids[0].kids;ok('Editing replaces the Drive copy (no duplicate)',ms.length===1&&ms[0].name.includes('Bay 2B')&&tab(s,'Toolbox Meetings').rows.length===2);
 // audit
 await p.evaluate(async()=>{const a={id:'aud1',status:'closed',closedAt:new Date().toISOString(),site:'PS Karak',client:'Shell',conductedOn:'2026-11-20',work:'Canopy light',auditBy:'Masitah',engineer:'Johan',contractor:'S&F',manpower:'4',
   answers:{wah1:{v:'Y'},wah2:{v:'N',c:'Ladder not tied'}},secOn:{wah:true},sharingPhotos:[],sectionPhotos:{},updatedAt:new Date().toISOString()};audits.set(a.id,a);await IDB.set('hsse-audits',[...audits.values()]);driveSend('audit','aud1')});
 await p.waitForTimeout(8000);s=await state();ok('Site audit: PDF folder + Sheet row with score and finding',!!findFolder(s.tree,'2026-11-20 PS Karak')&&rows(s,'Site Audits').includes('Ladder not tied'));
 await p.evaluate(async()=>{const marks={};PA_ITEMS.forEach((q,i)=>marks[q.id]={v:i===3?2:4,c:i===3?'Cable loose':''});const r={id:'pa1',status:'closed',closedAt:new Date().toISOString(),supervisor:'Haziq Sr',area:'Line 2',date:'2026-11-20',activity:'Welding',auditBy:'Masitah',marks,updatedAt:new Date().toISOString()};
   pas.set(r.id,r);await IDB.set('hsse-production',[...pas.values()]);driveSend('production','pa1')});
 await p.waitForTimeout(8000);s=await state();ok('Production audit: PDF in Production Audits folder + Sheet row with total and low marks',!!findFolder(s.tree,'2026-11-20 Line 2')&&!!tab(s,'Production Audits')&&rows(s,'Production Audits').includes('Cable loose')&&rows(s,'Production Audits').includes('62'));
 // delete
 await p.click('[data-tab="tb"]');await p.click('.tbrow');await p.click('#tbEdit');await p.click('#tb_del');await p.click('#mOk');await p.waitForTimeout(4000);
 s=await state();ok('Delete marks the row Deleted and removes the folder',rows(s,'Toolbox Meetings').includes('Deleted')&&findFolder(s.tree,'Toolbox Meetings').kids[0].kids.length===0);
 // offline
 await c.setOffline(true);await p.click('[data-tab="tasks"]');await p.click('#btnNew');await p.fill('#t_title','No signal task');await p.selectOption('#t_who','Masitah');await p.fill('#t_due','2026-12-02');await p.click('#t_save');await p.waitForTimeout(3000);
 const offOk=(await p.textContent('.list')).includes('No signal task');s=await state();const before=rows(s,'Task Updates').includes('No signal task');
 await c.setOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForTimeout(5000);s=await state();
 ok('No signal: saved on phone, uploads when signal returns',offOk&&!before&&rows(s,'Task Updates').includes('No signal task'));
 // stays signed in
 await p.reload();await p.waitForTimeout(1200);ok('Stays signed in after closing and reopening the app',await p.isVisible('.tabs')&&!(await p.isVisible('#li_email')));
 // second phone
 const P2=await phone();await signIn(P2.p,'hsse7@octagonmaju.com.my','Masitah123');await P2.p.click('[data-tab="tasks"]');await P2.p.click('#btnNew');
 await P2.p.fill('#t_title','From Masitah phone');await P2.p.selectOption('#t_who','Masitah');await P2.p.fill('#t_due','2026-12-03');await P2.p.click('#t_save');await P2.p.waitForTimeout(3000);
 s=await state();ok('Second member uploads to the same Sheet under her name',rows(s,'Task Updates').includes('From Masitah phone')&&rows(s,'Task Updates').includes('Masitah'));
 // blocked user
 await admin('hsse7@octagonmaju.com.my','No','Active');await P2.p.click('[data-tab="tasks"]');await P2.p.click('.task');await P2.p.fill('#t_pctN','50');await P2.p.click('#t_save');await P2.p.waitForTimeout(3000);
 ok('Blocked member (Active = No) is signed out on next upload',await P2.p.isVisible('#li_email')&&(await P2.p.textContent('#li_msg')).includes('sign in again'));
 await signIn(P2.p,'hsse7@octagonmaju.com.my','Masitah123');ok('Blocked member cannot sign in',(await P2.p.textContent('#li_msg')).includes('not correct'));
 for(let i=0;i<5;i++)await signIn(P2.p,'hsse7@octagonmaju.com.my','bad'+i,false);ok('Too many wrong tries are slowed down',(await P2.p.textContent('#li_msg')).includes('Too many'));
 // send all + sign out
 await p.click('#btnDrive');await p.click('#dr_all');await p.waitForTimeout(10000);s=await state();
 ok('"Send all records again" updates rows without duplicates',tab(s,'Task Updates').rows.length===4&&tab(s,'Site Audits').rows.length===2,`tasks ${tab(s,'Task Updates').rows.length} audits ${tab(s,'Site Audits').rows.length}`);
 await p.click('#ac_out');await p.click('#mOk');await p.waitForTimeout(500);ok('Sign out returns to sign-in; records kept on phone',await p.isVisible('#li_email')&&(await p.evaluate(async()=>((await IDB.get('hsse-tasks'))||[]).length))===2);
 ok('No script errors',errs.length===0,errs.slice(0,3).join(' | '));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
