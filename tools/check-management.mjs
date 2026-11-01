import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
// Set PLAYWRIGHT_MODULE to an installed playwright-core entry point when needed.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/Hong/Desktop/blindtesting/blind-tasting-compact/node_modules/playwright-core/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const base=process.env.APP_URL||'http://127.0.0.1:8846';
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base?route.continue():route.fulfill({status:200,body:'',contentType:'application/javascript'});});
const fixtures=[
 {id:'partial',name:'뮤지컬 알라딘',poster:'assets/posters/26007416.gif',vendor:'NOL 인터파크',date:'2026-11-07',time:'14:00',qty:2,price:280000,venue:'샤롯데씨어터',seats:[{grade:'R',floor:'1',zone:'B',row:'5',no:'12'},{grade:'R',no:'13',t:true,tp:150000}]},
 {id:'canceled',name:'모두 취소한 공연',vendor:'NOL 인터파크',date:'2026-11-08',qty:1,price:100000,seats:[{grade:'R',x:true}]},
 {id:'sold',name:'전체 양도한 공연',vendor:'NOL 인터파크',date:'2026-11-09',qty:1,price:100000,seats:[],transfer:{done:true,price:110000}},
 {id:'past',name:'지난 공연',vendor:'티켓링크',date:'2026-10-12',qty:1,price:50000,seats:[]},
 {id:'undated',name:'날짜를 아직 정하지 않은 공연',vendor:'멜론티켓',date:'',qty:1,price:30000,seats:[]},
 {id:'normal',name:'아주 긴 공연 제목이 있는 티켓 — 줄바꿈 확인',vendor:'티켓링크',date:'2026-12-14',time:'19:00',qty:1,price:140000,seats:[]}
];
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-01T12:00:00+09:00'));
await page.addInitScript(data=>{if(!localStorage.getItem('qa-seeded')){localStorage.setItem('tm_tickets_v1',JSON.stringify(data));localStorage.setItem('qa-seeded','1')}},fixtures);
async function selectVendor(value){
 await page.locator('#homeBody [data-mg-vendor]').click();
 assert.equal(await page.locator('#sub').getAttribute('role'),'dialog');
 await page.locator(`[data-vendor-choice="${value}"]`).click();
 await page.waitForFunction(()=>!document.querySelector('#sub').classList.contains('on'));
 assert(!await page.locator('#scr-home').evaluate(e=>e.inert));
}
try{
 await page.goto(base);await page.locator('#homeBody .mg-ticket').first().waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;await document.fonts.ready});
 await page.waitForTimeout(500);
 assert(await page.locator('.mg-next .mg-poster').evaluate(i=>i.complete&&i.naturalWidth>0));
 assert(await page.evaluate(async()=>{
   const {posterFor}=await import('./poster-catalog.js');
   const t={name:'뮤지컬 <겨울왕국>',venue:'샤롯데씨어터',date:'2026-11-28'};
   return posterFor(t).includes('26007416')&&!posterFor({...t,date:'2025-11-28'})&&!posterFor({...t,venue:'다른 공연장'})&&posterFor({...t,poster:'custom.jpg'})==='custom.jpg';
 }));

 assert.equal(await page.locator('#homeBody .mg-ticket').count(),3);assert.equal(await page.locator('#homeBody .mg-next .mg-ticket').count(),1);assert.equal(await page.locator('#homeBody .mg-date-group [data-id=partial]').count(),0);
 assert.match(await page.locator('#hdSum').innerText(),/3건 · 3매/);
 assert.match(await page.locator('#homeBody [data-id="partial"]').innerText(),/보유 1매 · 양도 1매/);
 assert.equal(await page.locator('#homeBody [data-id="canceled"]').count(),0);
 await selectVendor('티켓링크');assert.equal(await page.locator('#homeBody .mg-ticket').count(),1);
 await selectVendor('');
 await page.locator('#homeBody [data-mg-view="calendar"]').click();await page.locator('#homeBody [data-mg-day="2026-11-07"]').click();assert.equal(await page.locator('#homeBody .mg-ticket').count(),1);
 await page.locator('[data-mg-month="1"]').click();assert.match(await page.locator('.mg-month').innerText(),/12월/);assert.equal(await page.locator('#homeBody [data-id="normal"]').count(),1);
 await page.locator('#homeBody [data-mg-view="list"]').click();
 assert.equal(await page.locator('#nav [data-scr]').count(),4);await selectVendor('NOL 인터파크');await page.locator('#homeBody [data-mg-status="all"]').click();assert.equal(await page.locator('#homeBody .mg-ticket').count(),3);
 await page.locator('#homeBody [data-mg-status="transfer"]').click();assert.equal(await page.locator('#homeBody .mg-ticket').count(),2);
 await page.locator('#homeBody [data-mg-status="cancel"]').click();assert.equal(await page.locator('#homeBody .mg-ticket').count(),1);
 await page.locator('#homeBody [data-mg-status="held"]').click();await page.locator('#homeBody [data-id="partial"]').click();
 await page.locator('#dAct [data-a="edit"]').click();await page.locator('[data-f="name"]').fill('수정한 알라딘');await page.locator('#dAct [data-a="save"]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tm_tickets_v1')).some(t=>t.name==='수정한 알라딘'));
 await page.locator('#dClose').click();assert.match(await page.locator('#homeBody .mg-ticket').innerText(),/수정한 알라딘/);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tm_tickets_v1')));assert.equal(saved.length,6);assert.equal(saved.find(t=>t.id==='partial').seats[1].tp,150000);
 for(const tab of ['vault','money','set']){await page.locator(`#nav [data-scr="${tab}"]`).click();assert(await page.locator(`#scr-${tab}`).isVisible())}
 await page.locator('[data-set="bulk"]').click();assert.equal(await page.locator('#homeBody .mg-ticket').count(),6);await page.locator('#homeBody [data-id="canceled"]').click();assert.match(await page.locator('#selectBar').innerText(),/1장 선택/);assert(!await page.locator('#dsheet').evaluate(e=>e.classList.contains('on')));await page.locator('[data-sel="cancel"]').click();
 await page.locator('#homeBody [data-mg-status="held"]').click();await page.locator('[data-mg-add]').first().click();assert(await page.locator('#sub').evaluate(e=>e.classList.contains('on')));await page.locator('#subF [data-s="cancel"]').click();
 await page.waitForFunction(()=>!document.querySelector('#sub').classList.contains('on'));await page.waitForTimeout(450);await page.locator('#homeBody').evaluate(e=>{e.scrollTop=0});
 await page.locator('[data-mg-vendor]').click();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('[data-mg-vendor]').getAttribute('aria-expanded'),'false');
 await page.locator('[data-mg-vendor]').click();
 await page.evaluate(()=>history.back());
 await page.waitForFunction(()=>!document.querySelector('#sub').classList.contains('on'));
 assert(!await page.locator('#nav').evaluate(e=>e.inert));
 await mkdir('design/implementation',{recursive:true});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert(!await page.locator('#homeBody').evaluate(e=>e.scrollWidth>e.clientWidth));await page.screenshot({path:`design/implementation/suit-${width}.png`});}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-mg-vendor]').click();await page.waitForTimeout(400);await page.screenshot({path:'design/implementation/vendor-picker.png'});await page.locator('.vendor-close').click();
 const client=await context.newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');const {root}=await client.send('DOM.getDocument');const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.mg-ticket h3'});const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId});assert(fonts.some(f=>f.isCustomFont&&f.familyName.includes('SUIT')));
 assert((await page.evaluate(()=>caches.keys())).includes('tm-shell-v49'));
 await context.setOffline(true);await page.reload();await page.locator('#homeBody .mg-ticket').first().waitFor();assert.equal(await page.locator('#homeBody .mg-ticket').count(),3);assert.equal(await page.evaluate(()=>document.fonts.load('16px SUIT').then(f=>f.length)),1);
 await context.setOffline(false);
 const empty=await context.newPage();await empty.goto(base);await empty.evaluate(()=>{localStorage.setItem('tm_tickets_v1','[]')});await empty.reload();assert.equal(await empty.locator('#homeBody .mg-ticket').count(),0);assert.match(await empty.locator('#homeBody').innerText(),/첫 티켓/);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['held seat counts','partial transfer','full cancellation','vendor/status filters','calendar and month navigation','edit persistence without duplicates','legacy tabs','bulk selection','add entry','empty state','320/390/1280 layout','SUIT actual glyphs','offline shell/font'],fonts},null,2));
}finally{await browser.close()}
