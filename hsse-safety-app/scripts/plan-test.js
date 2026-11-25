const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname,SP=path.resolve(QA,'..');const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const GAS='http://127.0.0.1:8790/';const DOCS='/home/user/hsse-safety-app/docs';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
  if(u==='/drive-config.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end('window.HSSE_DRIVE_URL="'+GAS+'";')}
  const f=path.join(DOCS,u==='/'?'index.html':u);if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'content-type':f.endsWith('.pdf')?'application/pdf':f.endsWith('.json')?'application/json':'text/html'});return r.end(fs.readFileSync(f))}
  r.writeHead(404);r.end()}).listen(8777);
(async()=>{await fetch(GAS+'admin?email=shaifulsyazwan%40octagonmaju.com.my&v=Start1234');await fetch(GAS+'admin?email=hsse7%40octagonmaju.com.my&v=Masitah123');
 const b=await chromium.launch();const errs=[];
 const dev=async(opt,em,pw)=>{const c=await b.newContext({...opt,acceptDownloads:true});await c.addInitScript(()=>{window.HSSE_DRIVE_TEST=true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
   await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
   await p.goto('http://localhost:8777/');await p.waitForSelector('#li_email');await p.fill('#li_email',em);await p.fill('#li_pw',pw);await p.click('#li_go');await p.waitForTimeout(1500);
   if(await p.isVisible('#ac_old')){await p.fill('#ac_old',pw);await p.fill('#ac_new',pw+'X');await p.fill('#ac_new2',pw+'X');await p.click('#ac_go');await p.waitForTimeout(400)}
   return {c,p}};
 const idle=async p=>{for(let i=0;i<60;i++){const n=await p.evaluate(async()=>(await driveQueue()).length);if(!n)return;await p.waitForTimeout(400)}};
 const S=await dev({viewport:{width:1400,height:900}},'shaifulsyazwan@octagonmaju.com.my','Start1234');
 await S.p.click('[data-tab="plan"]');await S.p.waitForSelector('.pl',{timeout:10000});
 ok('HSSE Plan 2026 shows all 48 action plans from the PDF',(await S.p.locator('.pl tr.pl-r1').count())===48);
 ok('Title and 10 sections',(await S.p.textContent('h1')).includes('OM Annual HSSE Plan 2026')&&(await S.p.locator('.pl tr.pl-sec').count())===10);
 const row=t=>S.p.locator('.pl tr.pl-r1',{hasText:t});
 ok('HSSE Site Audit: Feb not done (red), other months done',await S.p.evaluate(()=>{const r=[...document.querySelectorAll('.pl tr.pl-r1')].find(x=>x.textContent.includes('HSSE Site Audit')).nextElementSibling;const c=r.querySelectorAll('td.pl-m');return c[1].classList.contains('pl-missed')&&c[0].classList.contains('pl-done')&&c[7].classList.contains('pl-done')}));
 ok('LEV test planned for September',await S.p.evaluate(()=>{const r=[...document.querySelectorAll('.pl tr.pl-r1')].find(x=>x.textContent.includes('Local Exhaust'));return r.querySelectorAll('td.pl-m')[8].classList.contains('pl-p')}));
 ok('Cell notes kept (ERP drill: BA8 & BA6 in July)',(await S.p.textContent('.pl')).includes('BA8 & BA6'));
 const href=await S.p.getAttribute('.pl-files a','href');const pr=await (await fetch('http://localhost:8777/'+href)).arrayBuffer();
 ok('Attachment: HSSE Plan 2026.pdf opens',(await S.p.textContent('.pl-files')).includes('HSSE Plan 2026.pdf')&&Buffer.from(pr).slice(0,4).toString()==='%PDF',href);
 ok('Overall achieved shown',/\d+\.\d%/.test(await S.p.textContent('.tiles')),(await S.p.locator('.tile').first().textContent()));
 // edit: Sep done for Updating HSSE Performance
 await S.p.evaluate(()=>{const r=[...document.querySelectorAll('.pl tr.pl-r1')].find(x=>x.textContent.includes('Updating HSSE Performance')).nextElementSibling;r.querySelectorAll('td.pl-m')[8].click()});
 await S.p.click('#plA [data-v="done"]');await S.p.fill('#plN','Sept report sent');await S.p.click('#mOk');await S.p.waitForTimeout(400);
 ok('Shaiful marks September as done',await S.p.evaluate(()=>{const r=[...document.querySelectorAll('.pl tr.pl-r1')].find(x=>x.textContent.includes('Updating HSSE Performance')).nextElementSibling;return r.querySelectorAll('td.pl-m')[8].classList.contains('pl-done')}));
 await row('Updating HSSE Performance').locator('[data-pli]').click();await S.p.fill('#plIp','75');await S.p.click('#mOk');await S.p.waitForTimeout(300);
 ok('Shaiful updates status %',(await row('Updating HSSE Performance').textContent()).includes('75%'));
 await S.p.click('[data-pladd="9"]');await S.p.fill('#plIa','Install safety signage at all bays');await S.p.fill('#plIf','YEARLY');await S.p.click('#mOk');await S.p.waitForTimeout(300);
 ok('Shaiful adds a new action plan',(await S.p.textContent('.pl')).includes('Install safety signage'));
 const [fc]=await Promise.all([S.p.waitForEvent('filechooser'),S.p.click('#plAttAdd')]);await fc.setFiles(DOCS+'/attachments/HSSE_Plan_2026.pdf');await S.p.waitForTimeout(2500);
 ok('Shaiful uploads another file',(await S.p.locator('.pl-files li').count())===2);
 const [pop]=await Promise.all([S.p.waitForEvent('popup',{timeout:8000}).catch(()=>null),S.p.click('[data-plopen]')]);ok('Uploaded file opens',!!pop);if(pop)await pop.close();
 const [dl]=await Promise.all([S.p.waitForEvent('download',{timeout:90000}),S.p.click('#plPdf')]);await dl.saveAs(QA+'/plan.pdf');ok('Download PDF',dl.suggestedFilename()==='HSSE-Plan-2026.pdf');
 ok('Desktop: all 12 months visible without scrolling',await S.p.evaluate(()=>{const s=document.querySelector('.pl-scroll');return s.scrollWidth<=s.clientWidth+1}));await S.p.screenshot({path:QA+'/plan-desk.png'});await idle(S.p);
 const M=await dev({...devices['iPhone 13']},'hsse7@octagonmaju.com.my','Masitah123');await M.p.evaluate(async()=>{await pullSync()});await M.p.waitForTimeout(500);
 await M.p.click('[data-tab="plan"]');await M.p.waitForSelector('.pl-cards');
 ok('Masitah sees Shaiful\'s changes on her phone (cards)',(await M.p.textContent('.pl-cards')).includes('Install safety signage')&&(await M.p.textContent('.pl-cards')).includes('75%')&&!(await M.p.isVisible('.pl-card')));
 ok('Masitah cannot edit or add files',(await M.p.locator('[data-plc],[data-pli],#plAttAdd').count())===0&&(await M.p.textContent('#app')).includes('Only the HSSE manager'));
 ok('Phone: no sideways scroll',(await M.p.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
 await M.p.screenshot({path:QA+'/plan-phone.png',fullPage:false});
 await M.p.evaluate(async()=>{const d=plans.get('2026');d.title='HACK';plans.set('2026',d);await IDB.set('hsse-plan',[...plans.values()]);driveSend('hsseplan','2026')});await M.p.waitForTimeout(2500);
 ok('Server refuses plan changes from others',(await M.p.textContent('#toast')).includes('Only the HSSE manager'));
 ok('No script errors',errs.length===0,errs.slice(0,2).join('|'));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
