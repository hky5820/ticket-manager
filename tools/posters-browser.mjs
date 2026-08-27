/* 예매처 사이트를 진짜 브라우저(Playwright Chromium, headless)로 열어 공식 포스터를 가져온다.
   curl로는 빈 껍데기인 JS 렌더링 사이트용. 검증 결과(2026-08-27):
     멜론티켓 ✓  search/index.htm?q=  → 상품 페이지 og:image (700px)
     세종문화회관 ✓  통합검색 → 상품 페이지 가장 큰 세로 이미지 (950px, 끝난 공연도 남아 있음)
     LG아트센터 ✓  home/ko/search?s=  → 검색 결과 세로 배너(690px)
     NOL 인터파크 ✓  검색 페이지(CDN large)
     샤롯데씨어터 △  현재 공연 목록에서 이름 매칭
     티켓링크 ✗ "비정상적인 활동 감지" 경고 / YES24 ✗ 봇 차단 페이지 / 클립서비스 ✗ 사이트에 검색 없음
   사용:
     node tools/posters-browser.mjs            poster 없는 티켓만
     node tools/posters-browser.mjs --all      전부: 티켓의 예매처 사이트에서 찾으면 교체, 못 찾으면 기존 유지
     node tools/posters-browser.mjs --dry      쓰지 않고 결과만
     node tools/posters-browser.mjs --probe 멜론티켓 "엘리자벳"   한 사이트 후보 덤프
   그 다음 python tools/posters.py 로 인터파크·네이버 단계 보강(브라우저 없이 되는 것들). */
import { createRequire } from 'module';
const require = createRequire('C:/Users/Hong/Desktop/ticket-bots/node_modules/');
const { chromium } = require('playwright-core');

const BASE='https://ydqabdlwzseommowiupw.supabase.co/rest/v1', KEY='sb_publishable_t5MlvS1Ea8ftD7IkfzqaiA_BCrzU80J';
const H={apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'};
const args=process.argv.slice(2), ALL=args.includes('--all'), DRY=args.includes('--dry');
const probeI=args.indexOf('--probe'); const onlyI=args.indexOf('--only'); const ONLY=onlyI>=0?args[onlyI+1]:null;
const enc=encodeURIComponent;

/* 예매처 → 검색 URL + 상품 페이지에서 큰 그림을 어떻게 고르나 */
const SITES={
  '멜론티켓':   {url:k=>`https://ticket.melon.com/search/index.htm?q=${enc(k)}`, detail:true},
  '세종문화회관': {url:k=>`https://www.sejongpac.or.kr/portal/search/search/list.do?searchAllWord=${enc(k)}&menuNo=200174`, detail:true},
  'LG아트센터':  {url:k=>`https://www.lgart.com/home/ko/search?s=${enc(k)}`, detail:false},
  'NOL 인터파크': {url:k=>`https://tickets.interpark.com/contents/search?keyword=${enc(k)}`, detail:false},
  '샤롯데씨어터': {url:()=>`https://charlotte.co.kr/performence/current.asp`, detail:true},
};
const ORDER=['멜론티켓','세종문화회관','LG아트센터','NOL 인터파크','샤롯데씨어터'];

const STOP=new Set(['뮤지컬','콘서트','연극','초연','내한','공연','the','musical','썸네일','이미지','한국']);   // JS 정규식 \b는 한글에 안 먹혀 토큰으로 거름
const norm=s=>(s||'').replace(/<\/?[a-zA-Z][^>]*>/g,'').replace(/[〈〉<>\[\]()（）:：\-–—·,&『』「」]/g,' ').toLowerCase().split(/\s+/).filter(x=>x&&!STOP.has(x)).join(' ').trim();
const core=n=>{ const x=norm(n).replace(/\b20\d\d\b/g,'').trim(); return (x.split(' ')[0]||n).slice(0,20); };
const genre=n=>['뮤지컬','콘서트','연극'].find(g=>n.includes(g))||'';
const region=s=>{ const m=/[-–—－]\s*([가-힣]{2,3})\s*$/.exec((s||'').replace(/<[^>]+>/g,'').trim()); return m?m[1]:''; };
function sim(a,b){ const bg=s=>{ const t=norm(s).replace(/\s/g,''); const o=new Set(); for(let i=0;i<t.length-1;i++)o.add(t.slice(i,2+i)); return o; }; const A=bg(a),B=bg(b); if(!A.size||!B.size)return 0; let c=0; for(const x of A)if(B.has(x))c++; return 2*c/(A.size+B.size); }
function score(t,it){
  const tn=norm(t.name), itn=norm(it.text); const toks=tn.split(' ').filter(x=>x.length>1);
  let s=Math.max(sim(t.name,it.text), toks.length<2 ? (toks[0]&&itn.startsWith(toks[0])?0.9:0) : toks.filter(x=>itn.includes(x)).length/toks.length*0.9);
  const tr=region(t.name), ir=region(it.text); if(tr&&ir&&tr!==ir)s-=0.3; if(!tr&&ir)s-=0.15;
  const g=genre(t.name); if(g&&!it.text.includes(g))s-=0.3;
  if(/\b20(1\d|2[0-4])\b/.test(it.text)&&!/\b20(1\d|2[0-4])\b/.test(t.name))s-=0.1;  // 옛 회차보다 최근 것
  s+=0.05*sim(t.name,it.text);   // 동점이면 이름이 더 비슷한 쪽(부가 상품 '자막 안경 대여' 같은 것 제침)
  return s;
}
/* 결과 페이지에서 "세로 이미지 + 주변 텍스트 + 링크" 후보 (사이트별 셀렉터 없이) */
async function candidates(page){
  for(let k=0;k<3;k++){ try{ return await page.evaluate(()=>{
    const out=[], seen=new Set();
    for(const img of document.images){
      const r=img.getBoundingClientRect(); const w=r.width||img.naturalWidth, h=r.height||img.naturalHeight;
      if(!(w>=60&&h/w>=1.15&&h/w<=1.9))continue;
      const src=img.currentSrc||img.src||img.dataset.src||''; if(!/^https?:/.test(src)||seen.has(src))continue;
      let box=img, text=(img.alt||'').replace(/<\/?[a-zA-Z][^>]*>/g,'').trim(), href=''; const a0=img.closest('a[href]'); if(a0)href=a0.href;
      const named=img.closest('[data-prd-name],[data-name],[title]'); if(text.length<2&&named)text=(named.dataset.prdName||named.dataset.name||named.title||'').trim();   // 인터파크: 이름이 data-prd-name 속성에만 있음
      for(let i=0;i<7&&box;i++){ box=box.parentElement; if(!box)break; const a=box.querySelector('a[href]'); if(!href&&a)href=a.href; if(text.length<2){ const tx=(box.innerText||'').replace(/\s+/g,' ').trim(); if(tx.length>=4&&tx.length<=90)text=tx; } if(text.length>=2&&href)break; }   // alt 우선, 없으면 가장 가까운 짧은 텍스트(목록 전체 잡히지 않게)
      seen.add(src); out.push({src, text, href, w:Math.round(w), h:Math.round(h)});
    }
    return out.slice(0,80);
  }); }catch(e){ await page.waitForTimeout(1200); } }
  return [];
}
async function bigPoster(page){
  return page.evaluate(()=>{
    const og=document.querySelector('meta[property="og:image"]'); const ogu=og&&og.content;
    let best=null; for(const img of document.images){ const w=img.naturalWidth,h=img.naturalHeight; if(w>=250&&h/w>=1.15&&h/w<=1.9&&(!best||w>best.w))best={w,src:img.currentSrc||img.src}; }
    if(ogu&&/^https?:.*\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(ogu))return ogu;
    return (best&&best.src)||ogu||null;
  });
}
async function open(page,url){ try{ await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000}); await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{}); await page.waitForTimeout(2200); const tx=await page.evaluate(()=>document.body&&document.body.innerText.slice(0,400)).catch(()=>''); return !/비정상|접속 차단|Restricted access/.test(tx); }catch(e){ return false; } }
async function findOn(page,site,t){
  const cfg=SITES[site]; if(!cfg)return null;
  if(!await open(page,cfg.url(core(t.name))))return null;
  let cands=await candidates(page); if(!cands.length){ await page.waitForTimeout(3000); if(await open(page,cfg.url(core(t.name))))cands=await candidates(page); }   // 빈 결과면 한 번 다시 연다(연속 접속 시 간헐적으로 빈 페이지)
  let best=null; for(const c of cands){ const s=score(t,c); if(!best||s>best.s)best={s,c}; }
  if(ONLY)console.log('   ',site,'cands',cands.length,'best',best&&best.s.toFixed(2),best&&best.c.text.slice(0,40));
  if(!best||best.s<0.5)return null;
  let poster=best.c.src;
  if(cfg.detail&&best.c.href&&best.c.href!==page.url()&&await open(page,best.c.href)){ const big=await bigPoster(page); if(big)poster=big; }
  return {poster, via:`${site}: ${best.c.text.slice(0,44)} (${best.s.toFixed(2)})`};
}

const j=async(r)=>{ if(!r.ok)throw new Error(r.status+' '+await r.text()); return r.status===204?null:r.json(); };
const blob=r=>{ let b=r.seats; if(typeof b==='string'){ try{b=JSON.parse(b)}catch{b={}} } if(Array.isArray(b))b={seats:b}; return b&&typeof b==='object'?b:{}; };

process.on('unhandledRejection',()=>{});
const browser=await chromium.launch(); const ctx=await browser.newContext({viewport:{width:1280,height:900},locale:'ko-KR',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'}); const page=await ctx.newPage();
page.on('dialog',d=>d.dismiss().catch(()=>{}));
try{
  if(probeI>=0){ const site=args[probeI+1], name=args[probeI+2]; console.log('open',await open(page,SITES[site].url(core(name))),page.url()); const cs=await candidates(page); for(const c of cs)console.log(score({name},c).toFixed(2),c.w+'x'+c.h,'|',c.text.slice(0,60),'|',c.src.slice(0,90),'|',c.href.slice(0,70)); process.exit(0); }
  const rows=await j(await fetch(`${BASE}/tickets?select=id,name,vendor,memo,seats&order=show_date.asc`,{headers:H}));
  const cache=new Map(); let done=0;
  for(const r of rows){
    const b=blob(r); if(b.poster&&!ALL)continue; if(ONLY&&!r.name.includes(ONLY))continue;
    const t={name:r.name};
    const key=r.vendor+'|'+r.name; let hit=cache.get(key);
    if(hit===undefined){
      hit=null; const order=ALL&&b.poster ? (SITES[r.vendor]?[r.vendor]:[]) : [r.vendor,...ORDER.filter(s=>s!==r.vendor)];   // --all: 이미 있으면 제 예매처 것만 시도
      for(const site of order){ if(!SITES[site])continue; try{ hit=await findOn(page,site,t); }catch(e){ hit=null; } if(hit)break; await page.waitForTimeout(800); }
      cache.set(key,hit);
    }
    console.log(`${r.name.slice(0,34).padEnd(36)} [${r.vendor}] → ${hit?hit.via:'없음'}`);
    if(DRY||!hit||hit.poster===b.poster)continue;
    b.poster=hit.poster;
    await j(await fetch(`${BASE}/tickets?id=eq.${r.id}`,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify({seats:b})})); done++;
  }
  console.log(`업데이트 ${done}건`);
}finally{ await browser.close(); }
