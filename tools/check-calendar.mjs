import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/Hong/Desktop/blindtesting/blind-tasting-compact/node_modules/playwright-core/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const base=process.env.APP_URL||'http://127.0.0.1:8846';
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 await context.addInitScript(()=>{
  window.calendarMessages=[];
  window.nativeState={supported:true,enabled:false,permission:false,lastSync:0,count:0,durationMinutes:120};
  window.TicketCalendar={postMessage(raw){const m=JSON.parse(raw);window.calendarMessages.push(m);
   if(m.type==='enable'){window.nativeState.enabled=true;window.nativeState.permission=true;}
   if(m.type==='disable')window.nativeState.enabled=false;
   if(m.type==='duration')window.nativeState.durationMinutes=m.minutes;
   if(m.type==='sync'){window.nativeState.lastSync=Date.now();window.nativeState.count=m.tickets.length;}
   setTimeout(()=>window.dispatchEvent(new CustomEvent('ticket-calendar-status',{detail:{...window.nativeState}})),0);
  }};
  localStorage.setItem('tm_tickets_v1',JSON.stringify([{id:'stale',name:'오래된 캐시',qty:1,date:'2027-01-01',seats:[]}]));
 });
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base);
 await p.locator('#nav [data-scr="set"]').click();await p.locator('[data-set="calendar"]').click();
 await p.locator('[data-calendar="enable"]').click();await p.locator('[data-calendar="refresh"]').waitFor();
 assert.equal(await p.evaluate(()=>calendarMessages.filter(m=>m.type==='sync').length),0,'stale startup must not reconcile');
 await p.evaluate(async()=>{const D=await import('./data.js');await D.saveTicket({name:'새 공연',qty:1,date:'2027-01-02',time:'19:30',memo:'PRIVATE',price:999,seats:[]});});
 await p.waitForFunction(()=>calendarMessages.some(m=>m.type==='sync'));
 let m=await p.evaluate(()=>calendarMessages.filter(m=>m.type==='sync').at(-1));
 assert.equal(m.allowDelete,false);assert.equal(m.dirty,true);assert(!JSON.stringify(m).includes('PRIVATE'));assert(!JSON.stringify(m).includes('price'));
 await p.locator('#calendarDuration').selectOption('180');
 await p.waitForFunction(()=>nativeState.durationMinutes===180);
 await p.evaluate(async()=>{const D=await import('./data.js');await D.deleteTicket('stale');});
 await p.waitForFunction(()=>calendarMessages.some(m=>m.type==='sync'&&m.deleted.includes('stale')));
 await p.locator('[data-calendar="disable"]').click();await p.locator('[data-calendar="enable"]').waitFor();
 const count=await p.evaluate(()=>calendarMessages.filter(m=>m.type==='sync').length);
 await p.evaluate(async()=>{const D=await import('./data.js');await D.saveTicket({name:'연동 꺼짐',qty:1,date:'2027-01-03',seats:[]});});
 await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>calendarMessages.filter(m=>m.type==='sync').length),count);
 assert.deepEqual(errors,[]);console.log('PASS: calendar enable/disable, stale bootstrap guard, immediate local edits/deletion, redaction, duration');
}finally{await browser.close();}
