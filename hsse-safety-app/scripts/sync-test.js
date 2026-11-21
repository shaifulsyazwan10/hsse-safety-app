// Two devices (computer + phone) syncing through the real Code.gs on in-memory Drive/Sheets.
const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname,SP=path.resolve(QA,'..');const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const GAS='http://127.0.0.1:8790/';
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/drive-config.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end('window.HSSE_DRIVE_URL="'+GAS+'";')}
  r.writeHead(200,{'content-type':'text/html'});r.end(fs.readFileSync('/home/user/hsse-safety-app/docs/index.html'))}).listen(8774);
(async()=>{await fetch(GAS+'admin?email=shaifulsyazwan%40octagonmaju.com.my&v=Start1234');await fetch(GAS+'admin?email=hsse7%40octagonmaju.com.my&v=Masitah123');
 const b=await chromium.launch();const errs=[];
 const dev=async(opt,em,pw)=>{const c=await b.newContext(opt);await c.addInitScript(()=>{window.HSSE_DRIVE_TEST=true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
   await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
   await p.goto('http://localhost:8774/');await p.waitForSelector('#li_email');
   // a task saved on this device BEFORE the sync update existed (only on this device)
   if(em.startsWith('shaiful'))await p.evaluate(async()=>{const t={id:'old1',title:'Old task from computer',assignee:'Ridzuan',priority:'H',status:'O',pct:40,start:'2026-11-01',due:'2026-11-30',dueTime:'17:00',log:[],createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'};await IDB.set('hsse-tasks',[t])});
   if(em.startsWith('shaiful')){await p.reload();await p.waitForSelector('#li_email')}
   await p.fill('#li_email',em);await p.fill('#li_pw',pw);await p.click('#li_go');await p.waitForTimeout(1500);
   if(await p.isVisible('#ac_old')){await p.fill('#ac_old',pw);await p.fill('#ac_new',pw+'X');await p.fill('#ac_new2',pw+'X');await p.click('#ac_go');await p.waitForTimeout(400);await p.click('[data-tab="dash"]')}
   return {c,p}};
 const sync=async p=>{await p.evaluate(async()=>{await pullSync()});await p.waitForTimeout(400)};
 const idle=async p=>{for(let i=0;i<60;i++){const n=await p.evaluate(async()=>(await driveQueue()).length);if(!n)return;await p.waitForTimeout(500)}};
 const PC=await dev({viewport:{width:1366,height:900}},'shaifulsyazwan@octagonmaju.com.my','Start1234');
 await PC.p.waitForTimeout(2500);await idle(PC.p);
 // computer: new task + toolbox with photos
 await PC.p.click('[data-tab="tasks"]');await PC.p.click('#btnNew');await PC.p.fill('#t_title','Check fire extinguishers');await PC.p.selectOption('#t_who','Masitah');await PC.p.fill('#t_due','2026-12-05');await PC.p.click('#t_save');await PC.p.waitForTimeout(500);
 await PC.p.click('[data-tab="tb"]');await PC.p.click('#btnNew');await PC.p.fill('#tb_by','Ridzuan');await PC.p.fill('#tb_loc','Bay 3');await PC.p.fill('[data-pt="0"]','Forklift traffic');
 const [fc]=await Promise.all([PC.p.waitForEvent('filechooser'),PC.p.click('#tb_add')]);await fc.setFiles([QA+'/big0.jpg',QA+'/big1.jpg']);await PC.p.waitForTimeout(4000);await PC.p.click('#tb_save');
 await PC.p.waitForTimeout(1000);await idle(PC.p);
 // phone signs in
 const PH=await dev({...devices['iPhone 13']},'hsse7@octagonmaju.com.my','Masitah123');await PH.p.waitForTimeout(2500);await sync(PH.p);
 await PH.p.click('[data-tab="tasks"]');await PH.p.click('[data-tf="all"]');const tl=await PH.p.textContent('.list');
 ok('Phone sees the task saved on the computer',tl.includes('Check fire extinguishers'));
 ok('Phone sees an older task that was only on the computer',tl.includes('Old task from computer'));
 await PH.p.click('[data-tab="tb"]');ok('Phone sees the toolbox meeting saved on the computer',(await PH.p.textContent('.list')).includes('Forklift traffic'));
 await PH.p.click('.tbrow');await PH.p.waitForTimeout(3000);ok('Photos taken on the computer load on the phone',await PH.p.evaluate(()=>[...document.querySelectorAll('.tbbig img')].filter(i=>i.naturalWidth>0).length)===2);
 // phone updates the task
 await PH.p.click('[data-tab="tasks"]');await PH.p.click('[data-tf="all"]');await PH.p.locator('.task',{hasText:'Check fire extinguishers'}).click();await PH.p.fill('#t_pctN','60');await PH.p.fill('#t_note','3 of 5 checked');await PH.p.click('#t_save');
 await PH.p.waitForTimeout(800);await idle(PH.p);
 await sync(PC.p);await PC.p.click('[data-tab="tasks"]');await PC.p.click('[data-tf="all"]');
 ok('Computer sees the update made on the phone',(await PC.p.locator('.task',{hasText:'Check fire extinguishers'}).textContent()).includes('60%'));
 // phone deletes the toolbox meeting
 await PH.p.click('[data-tab="tb"]');await PH.p.click('.tbrow');await PH.p.click('#tbEdit');await PH.p.click('#tb_del');await PH.p.click('#mOk');await PH.p.waitForTimeout(800);await idle(PH.p);
 await sync(PC.p);await PC.p.click('[data-tab="tb"]');ok('Delete on the phone removes it on the computer',!(await PC.p.textContent('.list')).includes('Forklift traffic'));
 // draft audit stays on its device; submitted audit syncs
 await PC.p.click('[data-tab="list"]');await PC.p.click('#btnNew');await PC.p.fill('#f_site','Draft only site');await PC.p.waitForTimeout(1500);
 await PC.p.evaluate(async()=>{const a={id:'sub1',status:'closed',closedAt:new Date().toISOString(),site:'PS Karak',client:'Shell',conductedOn:'2026-11-21',work:'x',auditBy:'Masitah',engineer:'Johan',contractor:'S&F',manpower:'4',answers:{wah1:{v:'Y'}},secOn:{wah:true},sharingPhotos:[],sectionPhotos:{},updatedAt:new Date().toISOString()};audits.set(a.id,a);await IDB.set('hsse-audits',[...audits.values()]);driveSend('audit','sub1')});
 await PC.p.waitForTimeout(1000);await idle(PC.p);
 await sync(PH.p);await PH.p.click('[data-tab="list"]');const al=await PH.p.textContent('.list');
 ok('Submitted site audit syncs; drafts stay on their own device',al.includes('PS Karak')&&!al.includes('Draft only site'));
 ok('Dashboard on the phone counts the synced records',await (async()=>{await PH.p.click('[data-tab="dash"]');await PH.p.waitForTimeout(400);return (await PH.p.textContent('.kpis')).includes('Open tasks')})());
 // local change still waiting to upload is not overwritten by an older server copy
 await PH.c.setOffline(true);await PH.p.click('[data-tab="tasks"]');await PH.p.click('[data-tf="all"]');await PH.p.locator('.task',{hasText:'Old task from computer'}).click();await PH.p.fill('#t_pctN','90');await PH.p.click('#t_save');await PH.p.waitForTimeout(500);
 await PH.c.setOffline(false);await PH.p.evaluate(async()=>{await pullSync()});
 ok('An offline change is not lost when syncing',(await PH.p.locator('.task',{hasText:'Old task from computer'}).textContent()).includes('90%'));
 await idle(PH.p);await sync(PC.p);await PC.p.click('[data-tab="tasks"]');await PC.p.click('[data-tf="all"]');ok('…and reaches the computer once uploaded',(await PC.p.locator('.task',{hasText:'Old task from computer'}).textContent()).includes('90%'));
 ok('No script errors',errs.length===0,errs.slice(0,2).join('|'));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
