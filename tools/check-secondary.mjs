import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/Hong/Desktop/blindtesting/blind-tasting-compact/node_modules/playwright-core/index.mjs');
const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const c=await b.newContext({viewport:{width:390,height:844}}),base=process.env.APP_URL||'http://127.0.0.1:8846';
 await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 await c.addInitScript(()=>localStorage.setItem('tm_tickets_v1',JSON.stringify([{id:'one',name:'뮤지컬 겨울왕국 한국 초연 FROZEN The Musical',vendor:'클립서비스',date:'2026-11-28',time:'14:00',venue:'샤롯데씨어터',qty:2,price:300000,seats:[{grade:'VIP',no:'1'},{grade:'VIP',no:'2',t:true,tp:160000}]}])));
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-01T12:00:00+09:00'));await p.goto(base);await p.locator('.mg-next').waitFor();await p.waitForTimeout(600);
 await p.locator('#nav [data-scr="money"]').click();await p.waitForTimeout(900);
 const upcoming=p.locator('#moneyBody .bigs .tile').last();assert.match(await upcoming.innerText(),/150,000/);assert.match(await upcoming.innerText(),/1건 · 1매/);
 for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(!await p.locator('#moneyBody').evaluate(e=>e.scrollWidth>e.clientWidth));await p.screenshot({path:`design/implementation/money-${width}.png`});}
 for(const tab of ['spend','month','xfer']){await p.locator(`[data-mt="${tab}"]`).click();assert(!await p.locator('#moneyBody').evaluate(e=>e.scrollWidth>e.clientWidth));}
 await p.locator('#moneyBody [data-id="one"]').click();await p.locator('#dsheet.on').waitFor();await p.waitForTimeout(450);await p.locator('#dClose').click();await p.waitForTimeout(450);
 await p.locator('#nav [data-scr="vault"]').click();await p.waitForTimeout(700);
 assert(await p.locator('.card.front .art img').evaluate(i=>i.complete&&i.naturalWidth>0));
 const geometry=await p.locator('.card.front').evaluate(e=>({info:e.querySelector('.info').getBoundingClientRect().bottom,footer:e.querySelector('.bt').getBoundingClientRect().top}));assert(geometry.info<=geometry.footer,JSON.stringify(geometry));
 await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:'design/implementation/vault-flow.png'});
 await p.locator('#modeBtn').click();await p.waitForTimeout(650);await p.screenshot({path:'design/implementation/vault-grid.png'});assert(await p.locator('#app').evaluate(e=>e.classList.contains('m-grid')));
 await p.locator('#modeBtn').click();await p.waitForTimeout(650);await p.screenshot({path:'design/implementation/vault-shows.png'});assert.equal(await p.locator('#shows .sg').count(),1);
 await p.locator('#shows .sg').click();await p.waitForTimeout(600);assert(!await p.locator('#app').evaluate(e=>e.classList.contains('m-shows')));
 assert.deepEqual(errors,[]);console.log('PASS: settlement seat accounting, tabs, detail, responsive layout, archive posters and three modes');
}finally{await b.close()}
