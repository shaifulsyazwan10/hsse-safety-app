const {chromium,devices}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const QA=__dirname;const res=[];const ok=(n,c,i='')=>{res.push(!!c);console.log((c?'PASS ':'FAIL ')+n+(i?' — '+i:''))};
const GAS='http://127.0.0.1:8790/';
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/drive-config.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end('window.HSSE_DRIVE_URL="'+GAS+'";')}
  r.writeHead(200,{'content-type':'text/html'});r.end(fs.readFileSync('/home/user/hsse-safety-app/docs/index.html'))}).listen(8773);
(async()=>{await fetch(GAS+'admin?email=hsse10%40octagonmaju.com.my&v=Ridzuan123');
 const b=await chromium.launch();const errs=[];
 for(const [name,opt] of [['phone',{...devices['iPhone 13']}],['desktop',{viewport:{width:1366,height:900}}]]){
  const c=await b.newContext(opt);await c.addInitScript(()=>{window.HSSE_DRIVE_TEST=true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8773/');await p.waitForSelector('#li_email');await p.fill('#li_email','hsse10@octagonmaju.com.my');await p.fill('#li_pw',name==='phone'?'Ridzuan123':'Ridzuan2026');await p.click('#li_go');await p.waitForTimeout(1500);
  if(await p.isVisible('#ac_old')){await p.fill('#ac_old','Ridzuan123');await p.fill('#ac_new','Ridzuan2026');await p.fill('#ac_new2','Ridzuan2026');await p.click('#ac_go');await p.waitForTimeout(500);await p.click('[data-tab="dash"]')}
  await p.waitForSelector('.news li',{timeout:15000}).catch(()=>{});
  ok(`${name}: news section shows headlines`,(await p.locator('.news li').count())===6,String(await p.locator('.news li').count()));
  if(name==='phone'){
   ok('Headlines open in a new tab, safely',await p.getAttribute('.news a','target')==='_blank'&&(await p.getAttribute('.news a','rel')).includes('noopener'));
   ok('Entities decoded, source removed from title',(await p.textContent('.news')).includes('inspection drive & new guideline')&&!(await p.textContent('.news')).includes(' - Test Daily'));
   await p.click('[data-ncat="Accident"]');ok('Filter: Workplace accidents',(await p.locator('.news li').count())===2&&(await p.textContent('.news')).includes('Pekerja maut'));
   await p.click('[data-ncat="DOE"]');ok('Filter: DOE',(await p.locator('.news li').count())===1);
   await p.click('[data-ncat="all"]');await p.click('#news_ref');await p.waitForTimeout(1500);ok('Refresh works',(await p.locator('.news li').count())===6);
   const w=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok('No sideways scroll on phone',w<=1);
   await c.setOffline(true);await p.reload().catch(()=>{});
   await c.setOffline(false);
   const c2p=await c.newPage();await c2p.goto('http://localhost:8773/');await c2p.waitForTimeout(800);await c2p.evaluate(()=>{});
   await c.setOffline(true);await c2p.evaluate(()=>{news={items:[],updated:"",state:"idle",err:""};newsAsked=0;loadNews(true)});await c2p.waitForTimeout(1500);
   ok('No signal: last saved news still shown',(await c2p.locator('.news li').count())===6&&(await c2p.textContent('#newsCard')).includes('No internet'));
   await c.setOffline(false);
  } else await p.locator('#newsCard').screenshot({path:QA+'/news-card.png'});
 }
 ok('No script errors',errs.length===0,errs.slice(0,2).join('|'));
 console.log(`${res.filter(Boolean).length}/${res.length} passed`);await b.close();srv.close()})().catch(e=>{console.error('CRASH',e);process.exit(1)});
