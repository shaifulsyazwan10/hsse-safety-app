// Firebase mode test against the local Firebase emulator (auth + firestore with the real security rules).
const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname,SP=path.resolve(QA,'..'),NM=SP+'/node_modules/firebase/';
const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const index=fs.readFileSync('/home/user/hsse-safety-app/docs/index.html');
const cfg=`window.HSSE_FIREBASE={apiKey:"demo",authDomain:"localhost",projectId:"demo-hsse",sdk:"/sdk/",emulator:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",port:8080}};`;
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/sdk/')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(fs.readFileSync(NM+q.url.slice(5)))}
  if(q.url.startsWith('/firebase-config.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(cfg)}
  r.writeHead(200,{'content-type':'text/html'});r.end(index)}).listen(8767);
(async()=>{const b=await chromium.launch();
 const open=async()=>{const c=await b.newContext({...devices['iPhone 13'],acceptDownloads:true});const p=await c.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
   await p.route(/cdnjs/,r=>r.fulfill({path:SP+'/node_modules/'+(r.request().url().includes('jspdf')?'jspdf/dist/jspdf.umd.min.js':'html2canvas/dist/html2canvas.min.js'),contentType:'text/javascript'}));
   await p.goto('http://localhost:8767/');await p.waitForSelector('#li_email',{timeout:20000});return {c,p}};
 const login=async(p,em,pw='Test12345')=>{await p.fill('#li_email',em);await p.fill('#li_pw',pw);await p.click('#li_go')};
 const A=await open();
 ok('Sign-in screen shows first, app hidden',await A.p.isVisible('#li_email')&&!(await A.p.isVisible('.tabs')));
 await login(A.p,'shaifulsyazwan@octagonmaju.com.my','wrong');await A.p.waitForTimeout(1200);
 ok('Wrong password shows a clear message',(await A.p.textContent('#li_msg')).includes('not correct'));
 await login(A.p,'shaifulsyazwan@octagonmaju.com.my');await A.p.waitForSelector('.tabs:not([hidden])',{timeout:15000});await A.p.waitForTimeout(800);
 ok('Team member signs in and sees the app',await A.p.isVisible('#btnOut'));
 // A creates a task
 await A.p.click('[data-tab="tasks"]');await A.p.click('#btnNew');await A.p.fill('#t_title','Inspect fire extinguishers');await A.p.selectOption('#t_who','Masitah');
 await A.p.click('[data-tpr="H"]');await A.p.fill('#t_due','2026-12-05');await A.p.click('#t_save');await A.p.waitForTimeout(800);
 // B signs in on another phone and sees it
 const B=await open();await login(B.p,'hsse7@octagonmaju.com.my');await B.p.waitForSelector('.tabs:not([hidden])',{timeout:15000});
 await B.p.click('[data-tab="tasks"]');await B.p.waitForTimeout(1200);
 ok('Second team member sees the task (shared data)',(await B.p.textContent('.list')).includes('Inspect fire extinguishers'));
 // B updates, A sees live
 await B.p.click('.task');await B.p.fill('#t_pctN','60');await B.p.fill('#t_note','3 of 5 checked');await B.p.click('#t_save');await B.p.waitForTimeout(1500);
 ok('Update by one person appears live on the other phone',(await A.p.textContent('.list')).includes('60%'));
 // toolbox with photos -> photos collection
 await A.p.click('[data-tab="tb"]');await A.p.click('#btnNew');await A.p.fill('#tb_by','Ridzuan');await A.p.fill('#tb_loc','Bay 2');await A.p.fill('[data-pt="0"]','Hot work');
 const [fc]=await Promise.all([A.p.waitForEvent('filechooser'),A.p.click('#tb_add')]);await fc.setFiles([0,1,2].map(i=>QA+`/big${i}.jpg`));await A.p.waitForTimeout(6000);
 await A.p.click('#tb_save');await A.p.waitForTimeout(1500);
 await B.p.click('[data-tab="tb"]');await B.p.waitForTimeout(1000);await B.p.click('.tbrow');await B.p.waitForTimeout(2500);
 ok('Photos taken on one phone show on the other',await B.p.evaluate(()=>[...document.querySelectorAll('.tbbig img')].filter(i=>i.naturalWidth>0).length)===3);
 // audit autosave + shared
 await A.p.click('[data-tab="list"]');await A.p.click('#btnNew');await A.p.fill('#f_site','PS Karak');await A.p.waitForTimeout(2500);
 await B.p.click('[data-tab="list"]');await B.p.waitForTimeout(1200);ok('Audit draft is shared',(await B.p.textContent('.list')).includes('PS Karak'));
 // PDF download in Firebase mode
 await B.p.click('[data-tab="tb"]');await B.p.click('.tbrow');await B.p.waitForTimeout(1500);
 const [dl]=await Promise.all([B.p.waitForEvent('download',{timeout:60000}),B.p.click('#tbPdf')]);ok('PDF downloads',dl.suggestedFilename().endsWith('.pdf'));
 // offline then online
 await A.c.setOffline(true);await A.p.click('[data-tab="tasks"]');await A.p.click('#btnNew');await A.p.fill('#t_title','Written with no signal');await A.p.selectOption('#t_who','Ridzuan');await A.p.fill('#t_due','2026-12-09');
 await A.p.click('#t_save');await A.p.waitForTimeout(5000);
 ok('No signal: task still saves on the phone and screen does not freeze',(await A.p.textContent('.list')).includes('Written with no signal'));
 await A.c.setOffline(false);await A.p.waitForTimeout(6000);await B.p.click('[data-tab="tasks"]');await B.p.waitForTimeout(1500);
 ok('When signal returns it uploads for the team',(await B.p.textContent('.list')).includes('Written with no signal'));
 // outsider
 const C=await open();await login(C.p,'outsider@example.com');await C.p.waitForTimeout(4500);await C.p.waitForSelector('#li_email');await C.p.waitForFunction(()=>window.firebase&&firebase.apps.length);
 ok('Account not on the team list is blocked',(await C.p.textContent('#app')).includes('does not have access'));
 // direct database attack from outsider session
 const X=await (await b.newContext()).newPage();await X.goto('http://localhost:8767/sdk/firebase-app-compat.js');
 for(const f of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-firestore-compat.js'])await X.addScriptTag({url:'http://localhost:8767/sdk/'+f});
 await X.evaluate(()=>{firebase.initializeApp({apiKey:"demo",projectId:"demo-hsse"});firebase.auth().useEmulator("http://127.0.0.1:9099");firebase.firestore().useEmulator("127.0.0.1",8080)});
 const leaked=await X.evaluate(async()=>{try{await firebase.auth().signInWithEmailAndPassword('outsider@example.com','Test12345');const s=await firebase.firestore().collection('tasks').get();return s.size}catch(e){return e.code}});
 ok('Outsider cannot read the database directly',leaked==='permission-denied',String(leaked));
 const anon=await X.evaluate(async()=>{await firebase.auth().signOut();try{await firebase.firestore().collection('audits').doc('x').set({a:1});return 'written'}catch(e){return e.code}});
 ok('Signed-out visitor cannot write',anon==='permission-denied',anon);
 // sign out
 await A.p.click('#btnOut');await A.p.click('#mOk');await A.p.waitForSelector('#li_email',{timeout:15000});ok('Sign out returns to the sign-in screen',true);
 ok('No script errors',[...A.p.errs,...B.p.errs].length===0,[...A.p.errs,...B.p.errs].slice(0,3).join(' | '));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
