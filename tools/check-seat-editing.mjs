import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/Hong/Desktop/blindtesting/blind-tasting-compact/node_modules/playwright-core/index.mjs');
const base=process.env.APP_URL||'http://127.0.0.1:8846';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 await context.addInitScript(()=>{
  if(localStorage.getItem('qa-seat-seeded'))return;
  const seat=(no,pp)=>({grade:'VIP',floor:'1',zone:'B',row:'2',no,pp});
  localStorage.setItem('tm_tickets_v1',JSON.stringify([
   {id:'editable',name:'좌석 삭제 검증',vendor:'티켓링크',date:'2026-12-25',time:'19:00',qty:3,price:600,perSeat:true,seats:[seat('1',100),seat('2',200),{...seat('3',300),t:true,tp:350,tto:'테스트',tvia:'지인'}]},
   {id:'transferred',name:'전체 양도 좌석 삭제 검증',vendor:'티켓링크',date:'2026-12-25',time:'19:00',qty:2,price:230,perSeat:true,seats:[seat('4',110),seat('5',120)],transfer:{done:true,price:270,to:'테스트',platform:'지인'}}
  ]));localStorage.setItem('qa-seat-seeded','1');
 });
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-08T12:00:00+09:00'));await p.goto(base);
 const rows=p.locator('#dBody .seat3');
 const saved=id=>p.evaluate(id=>JSON.parse(localStorage.getItem('tm_tickets_v1')).find(t=>t.id===id),id);
 async function edit(id){await p.locator(`#homeBody [data-id="${id}"]`).click();await p.locator('#dAct [data-a="edit"]').click();}
 await edit('editable');
 assert.equal(await rows.locator('[data-act="delseat"]').count(),3,'each seat needs a visible delete button without opening its status menu');
 await p.locator('[data-act="addseat"]').click();assert.equal(await rows.count(),4);
 await rows.nth(3).locator('[data-act="delseat"]').click();assert.equal(await rows.count(),3,'a newly added seat must be removable before saving');
 await rows.nth(2).locator('[data-act="xopen"]').click();
 await rows.nth(1).locator('[data-act="editseat"]').click();
 await rows.nth(0).locator('[data-act="delseat"]').click();
 assert.equal(await rows.count(),2);
 assert.equal(await rows.nth(0).locator('[data-sf="no"]').inputValue(),'2','seat editor must stay on the same seat after removing an earlier row');
 assert.equal(await rows.nth(1).locator('[data-sf="tp"]').inputValue(),'350','transfer editor must stay on the same seat');
 await p.locator('#dAct [data-a="save"]').click();await p.locator('#dAct [data-a="edit"]').waitFor();
 let t=await saved('editable');assert.equal(t.qty,2);assert.equal(t.price,500);assert.deepEqual(t.seats.map(s=>s.no),['2','3']);assert.equal(t.seats[1].tp,350);
 await p.reload();await edit('editable');assert.equal(await rows.count(),2);
 for(const width of [320,390]){
  await p.setViewportSize({width,height:844});
  for(const button of await rows.locator('[data-act="delseat"]').all()){
   assert(await button.isVisible());assert(await button.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth}));
  }
  assert(!await p.locator('#dBody').evaluate(e=>e.scrollWidth>e.clientWidth));
 }
 await mkdir('design/implementation',{recursive:true});await p.screenshot({path:'design/implementation/seat-delete-v52.png'});
 await rows.nth(0).locator('[data-act="delseat"]').click();await rows.nth(0).locator('[data-act="delseat"]').click();
 assert.equal(await rows.count(),0);assert.equal(await p.locator('[data-f="qty"]').inputValue(),'0','deleting the last seat must not revive the original quantity');
 await p.locator('#dAct [data-a="save"]').click();await p.locator('#dAct [data-a="edit"]').waitFor();
 t=await saved('editable');assert.equal(t.qty,0);assert.equal(t.price,0);assert.deepEqual(t.seats,[]);
 await p.locator('#dClose').click();await edit('transferred');
 assert.equal(await rows.locator('[data-act="delseat"]').count(),2,'whole-transfer seats must also be removable');
 await rows.nth(0).locator('[data-act="delseat"]').click();await p.locator('#dAct [data-a="save"]').click();await p.locator('#dAct [data-a="edit"]').waitFor();
 t=await saved('transferred');assert.equal(t.qty,1);assert.equal(t.price,120);assert.equal(t.seats[0].no,'5');assert.equal(t.transfer.price,270);assert.equal(t.transfer.done,true);
 assert.deepEqual(errors,[]);
 console.log('PASS: visible seat deletion, editor indexes, saved quantity/prices, reload persistence, last-seat removal, full-transfer editing, 320/390px touch targets');
}finally{await browser.close()}
