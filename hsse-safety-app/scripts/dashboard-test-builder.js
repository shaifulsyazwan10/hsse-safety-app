const fs=require('fs');const src=fs.readFileSync(__dirname+'/run.js','utf8');
const head=src.split('// ---------- SITE AUDIT ----------')[0].replace("await p.goto('http://localhost:8765/');await p.waitForTimeout(400);","");
const body=`
 const seed=()=>{const st=window.__store;const now=new Date();const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
  const sites=['PS RNR Bentong','PS Karak','PS Genting Sempah','PS Bukit Tinggi','PS Lanchang','PS Temerloh'];const cl=['Petronas','Shell','BHP','Petron','Caltex'];
  const who=['Shaiful Syazwan','Ridzuan','Masitah'];const sec=['wah','trf','erp','sky','ppe','hk','doc','mat','elc'];
  for(let i=0;i<46;i++){const d=new Date(now-rnd(0,330)*864e5);const ans={},on={};sec.forEach(s=>{on[s]=true;for(let q=1;q<=3;q++)ans[s+q]={v:Math.random()<.12?'N':Math.random()<.15?'NA':'Y',c:'x'}});
   st.set('audits/a'+i,{id:'a'+i,status:i%9?'closed':'draft',site:sites[i%6],client:cl[i%5],conductedOn:d.toISOString().slice(0,10),auditBy:who[i%3],answers:ans,secOn:on,sharingPhotos:[],sectionPhotos:{}})}
  for(let i=0;i<70;i++){const d=new Date(now.getTime()+rnd(-200,40)*864e5);const stt='POC'[i%3];st.set('tasks/t'+i,{id:'t'+i,title:'Task '+i,assignee:who[rnd(0,2)],priority:'HMML'[i%4],status:stt,pct:stt==='C'?100:stt==='O'?50:0,due:d.toISOString().slice(0,10),dueTime:'17:00',log:[]})}
  for(let i=0;i<60;i++){const d=new Date(now-rnd(0,300)*864e5);st.set('toolbox/b'+i,{id:'b'+i,briefBy:who[i%3],date:d.toISOString().slice(0,10),time:'08:00',location:'Bay '+(i%4),points:['a','b','c'],photos:[]})}};
 await p.addInitScript('('+seed.toString()+')()'.replace('',''));
 await p.addInitScript(()=>{const t=setInterval(()=>{if(window.__store){clearInterval(t)}},5)});
 await p.goto('http://localhost:8765/');await p.evaluate('('+seed.toString()+')()');
 await p.evaluate(async()=>{const db=await window.claude.use('db');for(const c of ['audits','tasks','toolbox']){const k=[...window.__store.keys()].find(x=>x.startsWith(c+'/'));await db.collection(c).doc(k.split('/')[1]).set(window.__store.get(k))}});
 await p.waitForTimeout(800);await p.evaluate(()=>{dashF.range='365';renderDash()});await p.waitForTimeout(300);
 await p.screenshot({path:QA+'/dash-phone.png',fullPage:true});
 const n=await p.locator('.viz svg').count();ok('Dashboard renders 5 charts',n===5,String(n));
 await noOverflow('Dashboard');
 const box=await p.locator('#c_prio .viz-hit').first().boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.waitForTimeout(150);
 ok('Hover shows tooltip',await p.isVisible('#c_prio .viz-tip'));
 await p.locator('#c_prio .viz-hit').first().click();await p.waitForTimeout(300);ok('Tap on priority segment opens filtered tasks',await p.isVisible('.task')||await p.isVisible('.list'));
 await p.click('[data-tab="dash"]');await p.click('#c_lead [data-tbl]');ok('Table view toggles',await p.isVisible('#c_lead .viz-table'));
 const d=await b.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1});const dp=await d.newPage();await dp.addInitScript(MOCK);await dp.goto('http://localhost:8765/');await dp.evaluate('('+seed.toString()+')()');
 await dp.evaluate(async()=>{const db=await window.claude.use('db');for(const c of ['audits','tasks','toolbox']){const k=[...window.__store.keys()].find(x=>x.startsWith(c+'/'));await db.collection(c).doc(k.split('/')[1]).set(window.__store.get(k))}});
 await dp.waitForTimeout(800);await dp.evaluate(()=>{dashF.range='365';renderDash()});await dp.waitForTimeout(300);await dp.screenshot({path:QA+'/dash-desk.png',fullPage:true});
 const dk=await b.newContext({viewport:{width:1366,height:900},colorScheme:'dark'});const kp=await dk.newPage();await kp.addInitScript(MOCK);await kp.goto('http://localhost:8765/');await kp.evaluate('('+seed.toString()+')()');
 await kp.evaluate(async()=>{const db=await window.claude.use('db');for(const c of ['audits','tasks','toolbox']){const k=[...window.__store.keys()].find(x=>x.startsWith(c+'/'));await db.collection(c).doc(k.split('/')[1]).set(window.__store.get(k))}});
 await kp.waitForTimeout(800);await kp.evaluate(()=>{dashF.range='365';renderDash()});await kp.waitForTimeout(300);await kp.screenshot({path:QA+'/dash-dark.png'});
 ok('No script errors',errs.length===0,errs.join('|'));
 await b.close();srv.close();
})().catch(e=>{console.error('CRASH',e);process.exit(1)});`;
fs.writeFileSync(__dirname+'/dash_run.js',head+body);
