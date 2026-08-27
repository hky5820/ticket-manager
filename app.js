/* 티켓 보관함 — 뷰 레이어 (ES module). 데이터는 data.js만 통해 접근.
   구조: 홈(다음 공연 + 목록) · 보관함(포스터 스택 타임라인 + 월 묶음 독) · 결산 · 설정 · 상세/수정 시트 */
import * as D from './data.js';
const {esc,won,signMoney,colorFor,vendorShort,fmtDate,ddayN,dday,isPast,isSold,seatLine,seatLabel,ticketAcct,normGrade,WD}=D;

const BUILD='v34 · 2026-08-27';
const $=id=>document.getElementById(id);
const app=$('app'), stage=$('stage');

/* ===== 테마 · 설정값 ===== */
let dark=localStorage.getItem('tm_theme')==='dark';
function applyDark(v){ dark=v; localStorage.setItem('tm_theme',v?'dark':'light'); app.classList.toggle('dark',v); document.documentElement.setAttribute('data-theme',v?'dark':'light'); const m=$('metaTheme'); if(m)m.content=v?'#000000':'#ffffff'; const cs=$('metaScheme'); if(cs)cs.content=v?'dark':'only light'; }
let imm=localStorage.getItem('tm_imm')||'vignette';
function applyImm(v){ imm=v; localStorage.setItem('tm_imm',v); app.classList.remove('imm-dark','imm-ambient','imm-vignette'); if(v!=='off')app.classList.add('imm-'+v); $('bgBtn').classList.toggle('on',v==='ambient'); }
let homeAmb=localStorage.getItem('tm_homeamb')==='1';
let homeView=localStorage.getItem('tm_homeview')||'list';

/* ===== 토스트 · 햅틱 ===== */
let toastT; function toast(m){ const el=$('toast'); el.textContent=m; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),2200); }
function hap(ms){ try{ navigator.vibrate&&navigator.vibrate(ms); }catch(e){} }

/* ===== 파생 헬퍼 ===== */
const short=n=>(n||'').replace(/뮤지컬 |〈|〉|\[.*?\]|현대카드 슈퍼콘서트 \d+ /g,'').replace(/^\d{4} /,'').trim()||n||'';
function holdInfo(t){ const a=ticketAcct(t); if(isSold(t))return {kept:0,sold:a.held,total:a.held,partial:false,label:'양도완료'}; const partial=a.xfer>0; return {kept:a.kept,sold:a.xfer,total:a.held,partial,label:partial?`관람 ${a.kept} · 양도 ${a.xfer}`:`${a.held}매`}; }
function itemProfit(t){ const a=ticketAcct(t); return a.hasXfer?Math.round(a.profit):null; }
const profitTxt=t=>{ const pr=itemProfit(t); return pr===null?'':`<span class="ptxt${pr<0?' neg':''}">${pr>=0?'+':'−'}${won(Math.abs(pr))}</span>`; };
function soldCost(t){ const a=ticketAcct(t); return Math.round(a.recv-a.profit); }
function ddCls(t){ const d=ddayN(t.date); return isSold(t)?'ok':(d!==null&&d<=9)?'soon':'dday'; }
function posterStyle(t){ return t.poster?'':`background:linear-gradient(160deg,${colorFor(t.vendor)}66,#111 90%)`; }
function posterImg(t,cls){ return t.poster?`<img class="${cls||''}" src="${esc(t.poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:`<div class="${cls||''} noposter" style="${posterStyle(t)}"><span>${esc(short(t.name).slice(0,12))}</span></div>`; }

/* ===== 데이터 → 화면 시퀀스 ===== */
let T=[], UP=[], ITEMS=[], HOME=0, TODAY_I=0, groups=[], showGroups={};
function rebuildData(){
  T=D.getState().tickets.slice().sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:(a.date||'9999')>(b.date||'9999')?1:(a.time||'')<(b.time||'')?-1:1);
  UP=T.filter(t=>!isPast(t)&&!isSold(t));
  showGroups={}; UP.forEach(t=>{ (showGroups[t.name]=showGroups[t.name]||[]).push(t); });
  T.forEach(t=>{ const g=showGroups[t.name]; t.k=g?g.indexOf(t)+1:0; t.n=g?g.length:0; });
  ITEMS=[]; const past=T.filter(isPast), up=T.filter(t=>!isPast(t));
  const pastProfit=past.reduce((a,t)=>a+(itemProfit(t)||0),0);
  ITEMS.push({gate:'past', n:past.length, profit:pastProfit});
  past.forEach(t=>ITEMS.push(t));
  ITEMS.push({gate:'today'}); TODAY_I=ITEMS.length-1;
  let pm=''; HOME=ITEMS.length;
  up.forEach((t,i)=>{ const ym=(t.date||'').slice(0,7), m=+(t.date||'').slice(5,7); if(ym!==pm){ ITEMS.push({gate:'month', month:m, ym, year:+(t.date||'').slice(0,4), tickets:up.filter(x=>(x.date||'').slice(0,7)===ym)}); pm=ym; } if(i===0)HOME=ITEMS.length; ITEMS.push(t); });
  if(HOME>=ITEMS.length)HOME=Math.max(0,ITEMS.length-1);
}
const monthOf=i=>{ for(let k=i;k>=0;k--) if(ITEMS[k]&&ITEMS[k].gate==='month') return ITEMS[k].ym; return ''; };

/* ===== 화면 전환 ===== */
let screen='home';
function showScreen(k){ screen=k; closeDetail(); ['home','vault','money','set'].forEach(x=>{ $('scr-'+x).hidden=(x!==k); }); document.querySelectorAll('#nav [data-scr]').forEach(d=>d.classList.toggle('on',d.dataset.scr===k)); app.classList.toggle('on-vault',k==='vault');
  if(k==='vault'){ requestAnimationFrame(()=>{ anim=null; target=null; vel=0; tilt=0; pos=clampI(Math.round(pos)); render(); }); enter(stage); enter(document.querySelector('.dock')); }
  if(k==='home')renderHome(); if(k==='money')renderMoney(); if(k==='set')renderSet();
  const sc=$('scr-'+k).querySelector('.scroll'); if(sc){ sc.scrollTop=0; enter(sc,true); } }
/* 화면 진입 모션: 자식들을 순서대로 떠오르게(스태거). 25초 새로고침엔 안 걸리고 탭 전환·보기 전환에만 */
const _enterT=new WeakMap();
function enter(el,stagger){ if(!el)return; if(stagger)[...el.children].forEach((c,i)=>c.style.setProperty('--i',Math.min(i,9))); el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); clearTimeout(_enterT.get(el)); _enterT.set(el,setTimeout(()=>el.classList.remove('enter'),900)); }
/* 목록 끝에서 더 당기면 내용이 20px까지 따라오다 스프링으로 돌아온다 (cardInfo 홈의 탄성 오버스크롤) */
function elastic(el){ const MAX=20; let y0=0, pull=0, raf=0, on=false;
  const apply=()=>{ el.style.transform=pull?`translateY(${pull.toFixed(2)}px)`:''; };
  el.addEventListener('touchstart',e=>{ cancelAnimationFrame(raf); y0=e.touches[0].clientY; on=true; },{passive:true});
  el.addEventListener('touchmove',e=>{ if(!on)return; const y=e.touches[0].clientY, dy=y-y0; y0=y;
    const atTop=el.scrollTop<=0, atBot=el.scrollTop+el.clientHeight>=el.scrollHeight-1;
    if(!((dy>0&&atTop)||(dy<0&&atBot)||pull))return;
    const remaining=1-Math.min(.82,Math.abs(pull)/MAX); pull=Math.max(-MAX,Math.min(MAX,pull+dy*0.10*remaining));
    if((pull>0&&!atTop)||(pull<0&&!atBot))pull=0; apply(); },{passive:true});
  const settle=()=>{ on=false; if(!pull)return; let v=0; const step=()=>{ v+=-pull*0.2; v*=0.6; pull+=v; if(Math.abs(pull)<0.25&&Math.abs(v)<0.25){ pull=0; apply(); return; } apply(); raf=requestAnimationFrame(step); }; raf=requestAnimationFrame(step); };
  el.addEventListener('touchend',settle,{passive:true}); el.addEventListener('touchcancel',settle,{passive:true}); }
['homeBody','moneyBody','setBody','dBody','shows'].forEach(id=>{ const el=$(id); if(el)elastic(el); });
$('nav').addEventListener('click',e=>{ const d=e.target.closest('[data-scr]'); if(d){ hap(8); showScreen(d.dataset.scr); } });
function goVault(i){ showScreen('vault'); if(mode!=='flow')setMode('flow'); anim=null; pos=i; render(); }

/* ===== 홈 ===== */
function applyHomeAmb(v){ homeAmb=v; localStorage.setItem('tm_homeamb',v?'1':'0'); app.classList.toggle('home-amb',v); $('homeBgBtn').classList.toggle('on',v); const nx=UP[0]; const ha=$('homeamb'); if(ha&&nx) ha.style.background=`radial-gradient(80% 60% at 50% 30%, ${colorFor(nx.vendor)} 0%, ${colorFor(nx.vendor)}00 100%)`; }
$('homeBgBtn').addEventListener('click',()=>applyHomeAmb(!homeAmb));
function setHomeView(v){ homeView=v; localStorage.setItem('tm_homeview',v); renderHome(); enter($('homeBody'),true); }
function renderPendBanner(){
  const el=$('pendBanner'); const ps=D.getState().pendings; if(!ps.length){ el.hidden=true; return; }
  const pend=ps.filter(p=>p.status==='pending').length, errs=ps.filter(p=>p.status==='error').length;
  el.hidden=false; el.innerHTML=`<span class="dot ${pend?'spin':''}"></span><b>${pend?`AI 인식 중 ${pend}장`:''}${pend&&errs?' · ':''}${errs?`실패 ${errs}장`:''}</b><span class="mng">관리 ›</span>`;
}
$('pendBanner').addEventListener('click',()=>openPendManage());
let _homeSig=null;
function renderHome(){
  const st=D.getState(); $('hdSum').textContent=`${UP.length}장 · ${UP.reduce((a,t)=>a+(ticketAcct(t).held),0)}매 · 공연 ${new Set(UP.map(t=>t.name)).size}`;
  $('syncPill').textContent=st.mode==='cloud'?'동기화 됨':'오프라인'; $('syncPill').classList.toggle('off',st.mode!=='cloud');
  renderPendBanner();
  const body=$('homeBody');
  if(!UP.length){ body.innerHTML=`<div class="homeamb" id="homeamb"></div><div class="empty"><b>아직 다가오는 티켓이 없어요</b><span>오른쪽 위 ＋ 로 캡처를 올리면 AI가 인식해서 채워줘요</span></div>`; _homeSig='empty'; return; }
  const nx=UP[0], nxI=ITEMS.indexOf(nx);
  const rest=T.filter(t=>!isPast(t));   /* 다음 공연(히어로)도 목록에 그대로 — 빼면 같은 공연 다른 날짜가 '날짜 틀린 것'처럼 보인다 */
  const byM={}; rest.forEach(t=>{ const k=(t.date||'').slice(0,7)||'미정'; (byM[k]=byM[k]||[]).push(t); }); const mk=Object.keys(byM).sort();
  const row=t=>{ const h=holdInfo(t), pr=itemProfit(t);
    const l3 = isSold(t) ? `양도완료 · 구매 ${won(t.price)}${pr!==null?' '+profitTxt(t):''}` : h.partial ? `<em>${h.sold}/${h.total}매 양도</em> · 구매 ${won(soldCost(t))}${pr!==null?' '+profitTxt(t):''}` : `${h.total}매 · ${won(t.price)}`;
    return `<div class="res ${isSold(t)?'sold':''}${t===nx?' isnext':''}" data-id="${esc(t.id)}">${posterImg(t)}<div class="tx"><div class="r1"><div class="nm">${esc(short(t.name))}</div><span class="bdg ${ddCls(t)}">${isSold(t)?'양도':dday(t.date)}</span></div><div class="l2">${fmtDate(t.date,t.time)}${seatLine(t)?' · '+esc(seatLine(t)):''}</div><div class="l3">${l3}</div></div></div>`; };
  let list='';
  if(homeView==='list'){
    list=mk.map(k=>`<div class="hsec"><h2>${k==='미정'?'날짜 미정':(+k.slice(5))+'월'}${k!=='미정'&&k.slice(0,4)!==String(new Date().getFullYear())?` <small>${k.slice(0,4)}</small>`:''}</h2><small>${byM[k].filter(t=>!isSold(t)).length}장 · ${byM[k].reduce((a,t)=>a+(isSold(t)?0:ticketAcct(t).held),0)}매 · ${won(byM[k].reduce((a,t)=>a+(isSold(t)?0:Number(t.price)||0),0))}</small></div><div class="tile" style="padding:6px 14px">${byM[k].map(row).join('')}</div>`).join('');
  } else if(homeView==='shows'){
    const gs=Object.entries(showGroups).sort((a,b)=>(a[1][0].date||'')<(b[1][0].date||'')?-1:1);
    list=`<div class="tile" style="padding:2px 14px">${gs.map(([name,g])=>{ const f=g[0],q=g.reduce((a,t)=>a+ticketAcct(t).held,0),sum=g.reduce((a,t)=>a+(Number(t.price)||0),0); const gp=g.reduce((a,t)=>a+(itemProfit(t)||0),0), anyP=g.some(t=>itemProfit(t)!==null);
      return `<div class="sg" data-id="${esc(f.id)}"><div class="st">${g.length>2?'<div class="b2"></div>':''}${g.length>1?'<div class="b1"></div>':''}${posterImg(f)}<div class="n">${g.length}</div></div><div><h3>${esc(short(name))}</h3><div class="m">${esc(f.venue||f.vendor||'')}</div><div class="ds">${g.map(t=>`<span class="${(ddayN(t.date)!==null&&ddayN(t.date)<=9)?'soon':''}${isSold(t)?' xf':''}">${t.date?(+t.date.slice(5,7))+'.'+(+t.date.slice(8,10)):'미정'}${holdInfo(t).partial?' <i style="font-style:normal;opacity:.8">½</i>':''}</span>`).join('')}</div><div class="sum">${g.length}장 · ${q}매 · ${won(sum)}${anyP?` · <span class="ptxt${gp<0?' neg':''}">${gp>=0?'+':'−'}${won(Math.abs(gp))}</span>`:''}</div></div></div>`; }).join('')}</div>`;
  } else {
    list=`<div class="pgrid" style="margin-top:0">${rest.map(t=>`<div class="pg" data-id="${esc(t.id)}"><div class="im">${posterImg(t)}<span class="dd ${ddCls(t)}">${isSold(t)?'양도완료':dday(t.date)}</span>${holdInfo(t).partial?`<span class="mini" style="position:absolute;left:8px;bottom:8px;background:rgba(162,28,175,.9);color:#fff">양도 ${holdInfo(t).sold}/${holdInfo(t).total}</span>`:''}${t.n>1?`<span class="n">${t.k}/${t.n}</span>`:''}</div><b>${esc(short(t.name))}</b><span>${fmtDate(t.date,t.time)} · ${won(t.price)}${itemProfit(t)!==null?' '+profitTxt(t):''}</span></div>`).join('')}</div>`;
  }
  const ico={list:'<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',shows:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11"/></svg>',grid:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'};
  const hi=holdInfo(nx);
  const html=`<div class="homeamb" id="homeamb"></div><div class="eb" style="position:relative">다음 공연</div>
    <div class="tile hero2" style="cursor:pointer;margin-top:6px" data-id="${esc(nx.id)}">${posterImg(nx,'pst')}<div class="hx"><div class="when">${fmtDate(nx.date,nx.time)}</div><div class="nm">${esc(nx.name)}</div><div class="ven">${esc(nx.venue||'')}${nx.venue&&nx.vendor?' · ':''}${esc(nx.vendor||'')}</div><div class="ddg">${dday(nx.date)}</div></div>
      <div class="pills" style="grid-column:1/-1;flex-direction:column;gap:6px"><span><small>좌석</small>${esc(seatLine(nx)||'좌석 미입력')}</span><span style="display:grid;grid-template-columns:auto 1fr;gap:0 18px;background:rgba(127,127,127,.1)"><span style="background:none;padding:0"><small>보유</small>${hi.label}</span><span class="pay" style="background:none;padding:0"><small>결제</small>${won(nx.price)}${itemProfit(nx)!==null?profitTxt(nx):''}</span></span></div></div>
    <div class="hsec"><h2>다가오는 <small>${rest.filter(t=>!isSold(t)).length}장</small></h2><div class="vt">${['list','shows','grid'].map(k=>`<div data-hv="${k}" class="${homeView===k?'on':''}">${ico[k]}</div>`).join('')}</div></div>
    ${list}`;
  if(html!==_homeSig){ body.innerHTML=html; _homeSig=html; } // 시그니처 dedup — 25초 새로고침 때 깜빡임 방지
  applyHomeAmb(homeAmb);
}
$('homeBody').addEventListener('click',e=>{ const hv=e.target.closest('[data-hv]'); if(hv){ setHomeView(hv.dataset.hv); return; } const it=e.target.closest('[data-id]'); if(it){ const i=ITEMS.findIndex(x=>String(x.id)===String(it.dataset.id)); if(i>=0)openDetail(i); } });

/* ===== 보관함: 카드 스택 ===== */
let els=[], mode='flow', pos=0, vel=0, target=null, dragging=false, lastY=0, lastT=0, raf, moved=0, ovScroll=0, ovVel=0, tilt=0;
const N=()=>ITEMS.length;
let _vaultSig=null;
function buildVault(){
  const sig=JSON.stringify(ITEMS.map(it=>it.gate?it.gate+(it.ym||''):[it.id,it.name,it.date,it.time,it.price,it.qty,it.poster,it.vendor,JSON.stringify(it.seats),JSON.stringify(it.transfer)]));
  if(sig===_vaultSig)return; _vaultSig=sig;
  const curId=ITEMS[Math.round(pos)]&&ITEMS[Math.round(pos)].id;
  stage.innerHTML=''; els=ITEMS.map((it,i)=>{
    const el=document.createElement('div'); el.dataset.i=i;
    if(it.gate){
      el.className='gate '+(it.gate==='today'?'today':it.gate==='past'?'pastg':'');
      if(it.gate==='month'){ const q=it.tickets.reduce((a,t)=>a+ticketAcct(t).held,0); el.innerHTML=`<b>${it.year!==new Date().getFullYear()?it.year+' · ':''}${it.month}월</b><span>${it.tickets.length}장 · ${q}매 · ${won(it.tickets.reduce((a,t)=>a+(Number(t.price)||0),0))}</span>`; }
      else if(it.gate==='today'){ const n=new Date(); el.innerHTML=`<b>오늘</b><span>${n.getMonth()+1}.${n.getDate()} ${WD[n.getDay()]}${UP[0]?` · 다음 공연 ${dday(UP[0].date)}`:''}</span>`; }
      else { el.innerHTML=`<b>지난 ${it.n}건</b><span>양도차익 <i style="font-style:normal;color:var(--good)">${signMoney(it.profit)}</i></span>`; }
    }else{
      const t=it, dd=dday(t.date), past=isPast(t), soon=(ddayN(t.date)!==null&&ddayN(t.date)<=9&&ddayN(t.date)>=0);
      el.className='card mid'+(past?' isPast':''); el.style.setProperty('--tone',colorFor(t.vendor));
      const chip = isSold(t) ? `<span class="chip xf">양도</span>` : past ? `<span class="chip past">관람</span>` : `<span class="chip ${soon?'dd':''}">${dd}</span>`;
      const hi=holdInfo(t);
      el.innerHTML = `${t.n>1?'<div class="fan f2"></div><div class="fan f1"></div>':''}
        <div class="art"${t.poster?'':` style="${posterStyle(t)}"`}>${t.poster?`<img src="${esc(t.poster)}" alt="" onerror="this.remove()">`:''}<div class="fx"></div><div class="dim"></div><div class="sheen"></div></div>
        <div class="info"><div class="r1">${chip}<span class="ttl">${esc(t.name)}</span></div><div class="when">${fmtDate(t.date,t.time)}</div><div class="seat">${esc(seatLine(t)||'좌석 미입력')}</div>${(hi.partial||isSold(t))?`<div class="hold">${hi.label}</div>`:''}</div>
        <div class="ask"><span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>상세 보기</span></div>
        <div class="bt"><span class="chip"><i style="--c:${colorFor(t.vendor)}"></i>${esc(vendorShort(t.vendor))}</span><span class="btr"><b>${won(t.price)}</b>${itemProfit(t)!==null?' '+profitTxt(t):''}</span></div>`;
    }
    stage.appendChild(el); return el;
  });
  const keep=curId!=null?ITEMS.findIndex(x=>String(x.id)===String(curId)):-1;
  if(keep>=0)pos=keep; else if(pos>=N())pos=HOME;
  buildDock(); renderBar();
}

/* 독 */
const tl=$('tl'), trk=$('trk'), fillEl=$('fill'), mkEl=$('mk'), progEl=$('prog'), msum=$('msum');
const TH_W=32, TH_GAP=5; let W=[];
function buildDock(){
  tl.innerHTML=''; trk.innerHTML=''; progEl.querySelectorAll('.tk').forEach(x=>x.remove());
  groups=[]; const past=T.filter(isPast);
  groups.push({key:'past',label:`지난 ${past.length}`,from:0,to:TODAY_I,items:past,jump:1});
  groups.push({key:'today',label:'오늘',from:TODAY_I,to:TODAY_I+1,items:[],jump:HOME});
  const gates=ITEMS.map((it,i)=>it.gate==='month'?i:-1).filter(i=>i>=0);
  gates.forEach((gi,k)=>{ const g=ITEMS[gi], to=k+1<gates.length?gates[k+1]:N(); groups.push({key:'m'+g.ym,label:g.month+'월',year:g.year,from:gi,to,items:ITEMS.slice(gi+1,to),jump:gi+1}); });
  groups.forEach(g=>{ const el=document.createElement('div'); g.el=el;
    if(g.key==='today'){ el.className='grp today'; el.innerHTML='<div class="dot"></div><small>오늘</small>'; }
    else{ el.className='grp'; el.style.width='44px';
      const shown=g.key==='past'?g.items.slice(-3):g.items;
      el.innerHTML=`${g.year&&g.year!==new Date().getFullYear()?`<span class="yr">${g.year}</span>`:''}<div class="stk">${shown.map(t=>`<div class="th" data-i="${ITEMS.indexOf(t)}">${posterImg(t)}${isSold(t)?'<div class="x">양도</div>':''}</div>`).join('')}<span class="n">${g.items.length}</span></div><small>${g.label}</small>`;
      g.thumbs=[...el.querySelectorAll('.th')]; }
    el.addEventListener('click',e=>{ if(mode!=='flow')setMode('flow'); const th=e.target.closest('.th'); snapTo((th&&g.el.classList.contains('exp'))?+th.dataset.i:(g.key==='today'?HOME:g.jump)); });
    tl.appendChild(el); });
  W=[]; { let x=0; for(let i=0;i<N();i++){ W[i]=x; x+= i<TODAY_I?0.35:1; } W[N()]=x; }
  groups.forEach((g,k)=>{ if(g.key==='today')return; const sg=document.createElement('div'); sg.className='seg'+(k%2?' alt':''); sg.style.left=(fracOf(g.from)*100)+'%'; sg.style.width=((fracOf(g.to)-fracOf(g.from))*100)+'%'; trk.appendChild(sg); });
  groups.forEach(g=>{ if(g.key==='past')return; const t=document.createElement('div'); t.className='tk'; t.style.left=(fracOf(g.from)*100)+'%'; progEl.appendChild(t); });
}
const fracOf=q=>{ const n=N(); if(n<2)return 0; const i=Math.floor(q), f=q-i; const a=W[Math.max(0,Math.min(n,i))], b=W[Math.max(0,Math.min(n,i+1))]; return (a+(b-a)*f)/(W[n-1]||1); };
const posOf=fr=>{ const n=N(); const x=fr*(W[n-1]||0); for(let i=0;i<n-1;i++){ if(x<=W[i+1]) return i+(x-W[i])/((W[i+1]-W[i])||1); } return n-1; };
let scrub=null;
progEl.addEventListener('pointerdown',e=>{ progEl.setPointerCapture(e.pointerId); scrub=true; anim=null; target=null; vel=0; scrubTo(e); });
progEl.addEventListener('pointermove',e=>{ if(scrub)scrubTo(e); });
progEl.addEventListener('pointerup',()=>{ scrub=null; glide(Math.round(pos),0); });
function scrubTo(e){ const r=progEl.getBoundingClientRect(); const fr=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); pos=posOf(fr); render(); }
function renderDock(){
  const cur=Math.max(0,Math.min(N()-1,Math.round(pos)));
  groups.forEach(g=>{
    const on=cur>=g.from&&cur<g.to;
    if(g.key==='today'){ g.el.classList.toggle('exp',on); return; }
    const exp=on&&g.key!=='past'; g.el.classList.toggle('exp',exp);
    const n=g.thumbs.length; g.el.style.width=(exp? Math.max(44,n*TH_W+(n-1)*TH_GAP) : 44)+'px';
    g.thumbs.forEach((th,k)=>{ th.style.transform=exp?`translateX(${k*(TH_W+TH_GAP)}px)`:`translate(${(n-1-k)*3}px,${-(n-1-k)*3}px)`; th.style.zIndex=exp?'1':String(k); th.classList.toggle('on',exp&&+th.dataset.i===cur); });
  });
  { const exp=groups.find(g=>g.el.classList.contains('exp'))||groups[0]; if(exp){ const railW=tl.parentElement.clientWidth; let total=0; groups.forEach(g=>total+=g.el.offsetWidth+14); total-=14; let x=exp.el.offsetLeft-(railW-exp.el.offsetWidth)/2; x=Math.max(0,Math.min(Math.max(0,total-railW),x)); tl.style.transform=`translateX(${-x}px)`; } }
  const f=fracOf(Math.max(0,Math.min(N()-1,pos))); fillEl.style.width=(f*100)+'%'; mkEl.style.left=(f*100)+'%';
  const it=ITEMS[cur]; if(!it)return;
  const pastG=groups[0];
  if(cur<TODAY_I){ const a=pastG.items.reduce((s,t)=>{ const x=ticketAcct(t); s.kept+=x.kept; s.sold+=x.xfer; s.profit+=x.hasXfer?x.profit:0; return s; },{kept:0,sold:0,profit:0}); msum.innerHTML=`<b>지난 ${pastG.items.length}건</b><span class="r">관람 ${a.kept} · 양도 ${a.sold}석 · 차익 <span class="g">${signMoney(a.profit)}</span></span>`; }
  else if(it.gate==='today'){ msum.innerHTML=`<b>오늘</b><span class="r">다가오는 <em>${UP.length}장 · ${UP.reduce((s,t)=>s+ticketAcct(t).held,0)}매</em> · 공연 ${new Set(UP.map(t=>t.name)).size}${UP[0]?` · 다음 공연 ${dday(UP[0].date)}`:''}</span>`; }
  else { const g=groups.find(x=>x.key==='m'+monthOf(cur)); if(!g)return; const q=g.items.reduce((a,t)=>a+ticketAcct(t).held,0), sum=g.items.reduce((a,t)=>a+(Number(t.price)||0),0);
    const cnt={}; g.items.forEach(t=>{ cnt[t.name]=(cnt[t.name]||0)+1; });
    const gp=g.items.reduce((a,t)=>a+(itemProfit(t)||0),0), gn=g.items.filter(t=>itemProfit(t)!==null).length;
    msum.innerHTML=`<b>${g.label} · ${g.items.length}장 ${q}매</b><span class="r">${Object.entries(cnt).map(([k,v])=>`<em>${esc(short(k).slice(0,8))}</em> ${v}`).join(' · ')}<br>결제 ${won(sum)}${gn?` · 양도 ${gn} <span class="ptxt${gp<0?' neg':''}">${gp>=0?'+':'−'}${won(Math.abs(gp))}</span>`:''}</span>`; }
}

/* 모드 · 그리드 */
const MODES=['flow','grid','shows'], MODE_LABEL={flow:'타임라인',grid:'월별',shows:'공연별'};
function renderBar(){ $('modeLbl').textContent=MODE_LABEL[mode]; }
$('modeBtn').addEventListener('click',()=>setMode(MODES[(MODES.indexOf(mode)+1)%MODES.length]));
$('bgBtn').addEventListener('click',()=>applyImm(imm==='ambient'?'vignette':'ambient'));
const OV={s:.44, pitch:150, colX:[-62,62], labelH:60}; let ovPos=[];
function buildOv(){ ovPos=[]; let y=0, col=0; ITEMS.forEach((it,i)=>{ if(it.gate){ if(col===1){ y+=OV.pitch; col=0; } ovPos[i]={x:0,y,label:true}; y+=OV.labelH; } else { ovPos[i]={x:OV.colX[col],y}; col=(col+1)%2; if(col===0)y+=OV.pitch; } }); if(col===1)y+=OV.pitch; OV.total=y; }
function renderShows(){
  const gs=Object.entries(showGroups).sort((a,b)=>(a[1][0].date||'')<(b[1][0].date||'')?-1:1);
  $('shows').innerHTML=gs.length?gs.map(([name,g])=>{ const f=g[0],q=g.reduce((a,t)=>a+ticketAcct(t).held,0),sum=g.reduce((a,t)=>a+(Number(t.price)||0),0); const pastN=T.filter(t=>t.name===name&&isPast(t)), profit=pastN.reduce((a,t)=>a+(itemProfit(t)||0),0);
    return `<div class="sg" data-i="${ITEMS.indexOf(f)}"><div class="st">${g.length>2?'<div class="b2"></div>':''}${g.length>1?'<div class="b1"></div>':''}${posterImg(f)}<div class="n">${g.length}</div></div><div><h3>${esc(short(name))}</h3><div class="m">${esc(f.venue||f.vendor||'')}</div><div class="ds">${g.map(t=>`<span class="${(ddayN(t.date)!==null&&ddayN(t.date)<=9)?'soon':''}">${t.date?(+t.date.slice(5,7))+'.'+(+t.date.slice(8,10)):'미정'}</span>`).join('')}</div><div class="sum">${g.length}장 · ${q}매 · ${won(sum)}${pastN.length?` · 지난 ${pastN.length}건 <b>${signMoney(profit)}</b>`:''}</div></div></div>`; }).join(''):`<div class="empty"><b>다가오는 티켓이 없어요</b></div>`;
}
$('shows').addEventListener('click',e=>{ const g=e.target.closest('.sg'); if(!g)return; setMode('flow'); snapTo(+g.dataset.i); });
function setMode(m){ mode=m; app.classList.remove('m-grid','m-shows'); if(m!=='flow')app.classList.add('m-'+m); stage.classList.add('anim'); setTimeout(()=>stage.classList.remove('anim'),600); if(m==='grid'){ buildOv(); const i=Math.round(pos); ovScroll=Math.max(0,Math.min(Math.max(0,OV.total-380),(ovPos[i]||{y:0}).y-80)); ovVel=0; } if(m==='shows')renderShows(); renderBar(); anim=null; target=null; vel=0; kick(); }

/* 물리 — 손을 뗀 뒤엔 "어디에 얼마 만에 멈출지"를 먼저 정하고 감속 곡선(에르미트) 하나로 간다.
   스프링으로 목표를 끌어당기던 방식은 손 뗀 직후 오히려 빨라져서 부자연스러웠다.
   PITCH(카드 한 장 = 손가락 이동 px)는 앞으로 빠지는 카드의 이동 거리와 맞춰 둔다 — 어긋나면 천천히 끌어도 카드만 확 내려간다. */
const PITCH=185, FLING=20;            /* 손 뗀 속도 × FLING = 그대로 굴러갈 거리(카드 수) */
const clampI=i=>Math.max(0,Math.min(N()-1,i));
let anim=null, lastIdx=-1, lastMoveAt=0, wasMoving=false;

function render(){
  tilt+=(Math.max(-5,Math.min(5,-vel*32))-tilt)*0.22;
  if(mode!=='grid'){ const ci=clampI(Math.round(pos)); if(ci!==lastIdx){ if(lastIdx>=0)hap(7); lastIdx=ci; } }
  const H=stage.clientHeight, n=N();
  for(let i=0;i<n;i++){
    const d=i-pos, el=els[i], it=ITEMS[i], a=Math.abs(d); if(!el)continue;
    if(mode==='grid'){ const p=ovPos[i]||{x:0,y:0}, y=p.y-ovScroll; const natTop=H/2-(it.gate?24:163); const ty=(y+16)-natTop; el.style.display=(y<-360||y>H+60)?'none':''; el.style.transform=`translate3d(${p.x}px,${ty}px,-140px) rotateX(5deg) scale(${p.label?0.92:OV.s})`; el.style.opacity=1; el.style.filter=''; el.style.zIndex=String(it.gate?900:500+i); if(!it.gate){ el.querySelector('.dim').style.opacity=0; el.querySelector('.sheen').style.opacity=0; } continue; }
    if(d>3.4||d<-1.2){ el.style.display='none'; continue; }
    el.style.display='';
    let z,y,op,dim,blur;
    if(d>=0){ const S=34*(1-Math.pow(0.78,d))/(1-0.78); z=-d*70; y=-S; op=Math.max(0,1-d*0.28); dim=Math.min(.7,d*0.3); blur=Math.max(0,Math.min(1.2,(d-1)*0.6)); el.style.zIndex=String(1000-Math.round(d*10)); }
    /* 앞으로 빠지는 카드: 정면(d=0)에서 뒤 스택과 기울기를 맞춘 뒤 가속해 떨어진다.
       예전엔 y=q*300이라 정면을 지나는 순간 속도가 8배로 튀어 뚝 끊겨 보였다. */
    else{ const q=-d; z=q*30; y=38*q+165*Math.pow(q,1.5); op=Math.max(0,1-(0.28*q+0.72*q*q)); dim=0; blur=0; el.style.zIndex='1200'; }
    el.classList.toggle('front',a<0.5);
    el.style.setProperty('--glow', d>=0&&d<1.6 ? (d<1 ? (1-d*0.45).toFixed(2) : (0.55*(1.6-d)/0.6).toFixed(2)) : 0);
    const tl=it.gate?0:tilt*(1-Math.min(1,a*0.6));
    el.style.transform=`translate3d(0,${y}px,${z}px) rotateX(${tl}deg)${d<0?` scale(${1+(-d)*0.04})`:''}`;
    el.style.opacity=op; el.style.filter=blur>0.05?`blur(${blur}px)`:'';
    if(!it.gate){ el.querySelector('.dim').style.opacity=dim; el.querySelector('.sheen').style.opacity=Math.max(0,1-a*2)*0.9; }
  }
  if(mode!=='grid')renderDock();
  const cur=clampI(Math.round(pos)); const t=ITEMS[cur]; if(t&&!t.gate&&imm==='ambient'){ $('ambient').style.backgroundImage=`radial-gradient(90% 55% at 50% 22%, ${colorFor(t.vendor)} 0%, ${colorFor(t.vendor)}00 100%)`; }
}
/* to번 카드까지 감속 곡선으로 이동. v0(카드/프레임)를 이어받아 시작하므로 손을 뗀 순간 속도가 끊기지 않는다.
   T=1.5·거리/속도 로 잡으면 속도가 v0·(1−s²)로 단조 감소한다 — 중간에 빨라지는 구간이 없다. */
function glide(to,v0){
  to=clampI(to); anim=null; const d=to-pos;
  if(Math.abs(d)<0.0005){ pos=to; vel=0; tilt=0; target=null; render(); return; }
  const v=(v0&&Math.sign(d)===Math.sign(v0))?v0:0;
  const T=Math.max(11,Math.min(42, v?Math.min(1.5*Math.abs(d)/Math.abs(v),14+Math.abs(d)*8):14+Math.abs(d)*3));   /* 살짝 밀고 뗀 경우엔 늘어지지 않게 상한 */
  anim={p0:pos,d,v0:v,T,t:0}; target=to; kick();
}
const snapTo=i=>glide(i,0);
function tick(){
  if(dragging)return;                 /* 드래그 중엔 pointermove가 직접 그린다 */
  if(mode==='grid'){
    ovScroll+=ovVel; ovVel*=0.93; const max=Math.max(0,OV.total-380);
    if(ovScroll<0)ovScroll+=(0-ovScroll)*0.25; if(ovScroll>max)ovScroll+=(max-ovScroll)*0.25;
    if(Math.abs(ovVel)<0.05&&ovScroll>=0&&ovScroll<=max){ render(); return; }
  } else if(anim){
    const a=anim, s=Math.min(1,++a.t/a.T), s2=s*s, s3=s2*s;
    pos=a.p0+a.d*(3*s2-2*s3)+a.v0*a.T*(s-2*s2+s3);
    vel=(a.d*(6*s-6*s2)+a.v0*a.T*(1-4*s+3*s2))/a.T;
    if(s>=1){ pos=a.p0+a.d; vel=0; anim=null; target=null; tilt=0; render(); return; }
  } else { vel=0; render(); return; }
  render(); raf=requestAnimationFrame(tick);
}
function kick(){ cancelAnimationFrame(raf); raf=requestAnimationFrame(tick); }
stage.addEventListener('pointerdown',e=>{ if(e.target.closest('.ask span'))return;
  wasMoving=!!anim; anim=null; target=null; dragging=true; vel=0; ovVel=0;
  lastY=e.clientY; lastT=lastMoveAt=performance.now(); stage.setPointerCapture(e.pointerId); moved=0; });
stage.addEventListener('pointermove',e=>{ if(!dragging)return; const dy=e.clientY-lastY, now=performance.now(), dt=Math.max(1,now-lastT);
  if(mode==='grid'){ ovScroll-=dy; ovVel=-dy*(16/dt); }
  else { let step=dy/PITCH;                                          /* 아래로 끌면 다음 카드 */
    const over=pos<0?-pos:(pos>N()-1?pos-(N()-1):0); if(over>0)step/=1+over*6;   /* 가장자리로 갈수록 고무줄 저항 */
    pos+=step;
    const v=(dy/PITCH)*(16/dt); vel=vel*0.55+v*0.45;                 /* 마지막 이벤트 하나만 쓰면 뗄 때 값이 널뛴다 */
  }
  lastY=e.clientY; lastT=lastMoveAt=now; moved+=Math.abs(dy); render(); });
stage.addEventListener('pointerup',e=>{ dragging=false;
  if(moved<6){
    if(wasMoving&&mode!=='grid'){ glide(Math.round(pos),0); return; }   /* 굴러가는 중 탭 = 그 자리에서 멈추기 */
    const hit=document.elementFromPoint(e.clientX,e.clientY); const c=hit&&hit.closest('.card,.gate'); const onAsk=hit&&hit.closest('.ask span');
    if(c){ const i=+c.dataset.i; if(mode==='grid'){ setMode('flow'); pos=i; render(); return; }
      if(i===Math.round(pos)){ if(!ITEMS[i].gate){ const wasAsk=c.classList.contains('ask'); els.forEach(x=>x.classList.remove('ask')); if(wasAsk||onAsk)openDetail(i); else { c.classList.add('ask'); c._askT=performance.now(); } } }
      else { els.forEach(x=>x.classList.remove('ask')); glide(i,0); } }
    else if(mode!=='grid')glide(Math.round(pos),0);
    return; }
  if(mode==='grid'){ ovVel=Math.max(-40,Math.min(40,ovVel)); kick(); return; }
  if(performance.now()-lastMoveAt>90)vel=0;                          /* 떼기 전에 손가락이 멈췄으면 관성 없음 */
  vel=Math.max(-0.6,Math.min(0.6,vel));
  glide(Math.round(pos+vel*FLING),vel); });
stage.addEventListener('pointercancel',()=>{ dragging=false; if(mode!=='grid')glide(Math.round(pos),0); });
stage.addEventListener('wheel',e=>{ e.preventDefault();
  if(mode==='grid'){ ovScroll=Math.max(0,Math.min(Math.max(0,OV.total-380),ovScroll+e.deltaY*0.8)); render(); return; }
  const v=Math.max(-0.6,Math.min(0.6,(anim?vel:0)+e.deltaY/PITCH*0.08));
  glide(Math.round(pos+v*FLING),v); },{passive:false});

/* ===== 결산 ===== */
let moneyTab='xfer';
function renderMoney(){
  const all=T, a=all.map(t=>({t,a:ticketAcct(t)}));
  const spend=a.reduce((s,x)=>s+x.a.spend,0), profit=a.reduce((s,x)=>s+(x.a.hasXfer?x.a.profit:0),0), qty=a.reduce((s,x)=>s+(Number(x.t.qty)||0),0), kept=a.reduce((s,x)=>s+x.a.kept,0), sold=a.reduce((s,x)=>s+x.a.xfer,0), canceled=a.reduce((s,x)=>s+x.a.canceled,0), recv=a.reduce((s,x)=>s+x.a.recv,0);
  const upPay=UP.reduce((s,t)=>s+(Number(t.price)||0),0);
  let body='';
  if(moneyTab==='xfer'){ const xs=a.filter(x=>x.a.hasXfer).sort((p,q)=>(p.t.date||'')<(q.t.date||'')?1:-1);
    body=`<div class="hsec"><h2>티켓별 산출</h2><small>양도 ${xs.length}건</small></div><div class="tile" style="padding:4px 14px"><div class="ledger">${xs.map(({t,a})=>`<div data-id="${esc(t.id)}"><span class="d">${t.date?(+t.date.slice(5,7))+'.'+(+t.date.slice(8,10)):'—'}</span><div><b>${esc(short(t.name))}</b><span>${a.xfer}석 원가 ${won(Math.round(a.recv-a.profit))} · 수령 ${won(a.recv)}</span></div><em class="${a.profit>=0?'g':'r'}">${signMoney(a.profit)}</em></div>`).join('')||'<div class="empty"><b>양도 내역이 없어요</b></div>'}</div></div>`; }
  else if(moneyTab==='spend'){ const xs=a.filter(x=>x.a.kept>0).sort((p,q)=>(p.t.date||'')<(q.t.date||'')?1:-1);
    body=`<div class="hsec"><h2>관람 좌석 원가</h2><small>${xs.length}건</small></div><div class="tile" style="padding:4px 14px"><div class="ledger">${xs.map(({t,a})=>`<div data-id="${esc(t.id)}"><span class="d">${t.date?(+t.date.slice(5,7))+'.'+(+t.date.slice(8,10)):'—'}</span><div><b>${esc(short(t.name))}</b><span>관람 ${a.kept}석 × ${won(Math.round(a.spend/a.kept))}</span></div><em>${won(Math.round(a.spend))}</em></div>`).join('')}</div></div>`; }
  else { const byM={}; a.forEach(x=>{ const k=(x.t.date||'').slice(0,7)||'미정'; const m=byM[k]=byM[k]||{pay:0,spend:0,profit:0,n:0}; m.pay+=Number(x.t.price)||0; m.spend+=x.a.spend; m.profit+=x.a.hasXfer?x.a.profit:0; m.n++; }); const ks=Object.keys(byM).sort().reverse(); const mx=Math.max(1,...ks.map(k=>byM[k].pay));
    body=`<div class="hsec"><h2>월별</h2><small>결제 기준</small></div><div class="tile"><div class="mb">${ks.map(k=>`<div><span>${k==='미정'?'미정':(+k.slice(5))+'월'}</span><div class="b"><i style="width:${byM[k].pay/mx*100}%"></i></div><em>${byM[k].n}</em></div><div style="grid-template-columns:34px 1fr;margin:-4px 0 6px"><span></span><small style="font-size:11px;color:var(--ink-3);font-weight:600">결제 ${won(byM[k].pay)} · 실지출 ${won(Math.round(byM[k].spend))}${byM[k].profit?` · 차익 <span class="ptxt${byM[k].profit<0?' neg':''}">${signMoney(byM[k].profit)}</span>`:''}</small></div>`).join('')}</div></div>`; }
  $('moneyBody').innerHTML=`
    <div class="bigs"><div class="tile" style="grid-column:1/-1"><small>실지출 · 관람 좌석 원가</small><b>${won(Math.round(spend))}</b><div class="subl">매수 ${qty}매 · 관람 ${kept}석 · 양도 ${sold}석${canceled?` · 취소 ${canceled}석`:''}</div></div>
      <div class="tile"><small>양도차익</small><b style="color:${profit>=0?'var(--good)':'#e5484d'}">${signMoney(profit)}</b><div class="subl">수령 ${won(recv)} − 원가 ${won(Math.round(recv-profit))}</div></div>
      <div class="tile"><small>보유 티켓 결제액</small><b>${won(upPay)}</b><div class="subl">관람 예정 ${UP.length}장 · ${UP.reduce((s,t)=>s+ticketAcct(t).held,0)}매</div></div></div>
    <div class="seg2">${[['xfer','양도'],['spend','실지출'],['month','월별']].map(([k,n])=>`<div data-mt="${k}" class="${moneyTab===k?'on':''}">${n}</div>`).join('')}</div>${body}`;
}
$('moneyBody').addEventListener('click',e=>{ const s=e.target.closest('[data-mt]'); if(s){ moneyTab=s.dataset.mt; renderMoney(); return; } const r=e.target.closest('[data-id]'); if(r){ const i=ITEMS.findIndex(x=>String(x.id)===String(r.dataset.id)); if(i>=0)openDetail(i); } });

/* ===== 설정 ===== */
function renderSet(){
  const st=D.getState(), dirty=D.dirtyCount();
  $('setBody').innerHTML=`
    <div class="hsec"><h2>보관함 배경</h2><small>포스터 뒤</small></div>
    <div class="immseg">${[['vignette','비네트'],['ambient','포스터 색'],['off','없음'],['dark','어둡게']].map(([k,n])=>`<div data-imm="${k}" class="${k===imm?'on':''}">${n}</div>`).join('')}</div>
    <div class="tile" style="padding:2px 14px">
      <div class="srow" id="darkRow"><div><b>다크 모드</b><small>전체 화면 어둡게</small></div><div class="sw ${dark?'':'off'}"></div></div>
      <div class="srow" data-set="vcolor"><div><b>예매처 색 관리</b><small>${D.allVendors().slice(0,5).map(esc).join(' · ')}</small></div><span class="v">${D.allVendors().length} ›</span></div>
      <div class="srow" data-set="pend"><div><b>AI 캡처 대기열</b><small>인식 대기 중인 캡처</small></div><span class="v">${st.pendings.length}장 ›</span></div>
      <div class="srow" data-set="sync"><div><b>동기화</b><small>${st.mode==='cloud'?'Supabase · 25초마다 자동':'오프라인 · 이 기기에 임시 저장'}${dirty?` · 미전송 ${dirty}건`:''}</small></div><span class="v" style="color:${st.mode==='cloud'?'var(--good)':'#e5484d'}">● ${st.mode==='cloud'?'연결됨':'끊김'}</span></div>
      <div class="srow" data-set="export"><div><b>백업 내보내기</b><small>JSON 파일로 저장</small></div><span class="v">›</span></div>
      <div class="srow" data-set="import"><div><b>백업 불러오기</b><small>같은 id는 건너뜀</small></div><span class="v">›</span></div>
      <div class="srow" data-set="bulk"><div><b>여러 장 삭제</b><small>홈 목록에서 선택</small></div><span class="v">›</span></div>
      <div class="srow" data-set="update"><div><b>버전</b><small>새 버전 확인 · 탭하면 지금 가져옴</small></div><span class="v">${BUILD}${navigator.serviceWorker&&navigator.serviceWorker.controller?'':' · sw 없음'} ›</span></div>
    </div>`;
  $('darkRow').addEventListener('click',()=>{ applyDark(!dark); renderSet(); });
  $('setBody').querySelectorAll('[data-imm]').forEach(el=>el.addEventListener('click',()=>{ applyImm(el.dataset.imm); renderSet(); }));
  $('setBody').querySelectorAll('[data-set]').forEach(el=>el.addEventListener('click',()=>{ const k=el.dataset.set;
    if(k==='vcolor')openVColorMgr(); if(k==='pend')openPendManage(); if(k==='sync')openSync();
    if(k==='update'){ toast('새 버전 확인 중…'); navigator.serviceWorker&&navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).finally(()=>setTimeout(()=>location.reload(),600)); }
    if(k==='export'){ D.exportBackup(); toast('백업 저장됨'); } if(k==='import')$('importFile').click(); if(k==='bulk'){ selectMode=true; showScreen('home'); renderSelectBar(); } }));
}
$('importFile').addEventListener('change',async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f)return; try{ const d=D.parseBackup(await f.text()); if(!confirm('백업을 현재 데이터에 합칠까요?'))return; const r=await D.importBackup(d); toast(`불러오기 완료 · ${r.added}건 추가`); }catch(err){ toast(err.message||'올바른 백업 파일이 아니에요'); } });

/* 여러 장 삭제 (홈 목록 선택 모드) */
let selectMode=false, selected=new Set();
function renderSelectBar(){ const bar=$('selectBar'); if(!selectMode){ bar.hidden=true; app.classList.remove('selecting'); return; } bar.hidden=false; app.classList.add('selecting'); bar.innerHTML=`<span>${selected.size}장 선택</span><div><span class="b" data-sel="cancel">취소</span><span class="b danger" data-sel="del">삭제</span></div>`; }
$('selectBar').addEventListener('click',async e=>{ const b=e.target.closest('[data-sel]'); if(!b)return; if(b.dataset.sel==='cancel'){ selectMode=false; selected.clear(); renderSelectBar(); document.querySelectorAll('.res.sel').forEach(x=>x.classList.remove('sel')); return; } if(!selected.size){ toast('선택된 티켓이 없어요'); return; } if(!confirm(`${selected.size}장을 삭제할까요?`))return; try{ await D.deleteTickets([...selected]); toast('삭제됨'); }catch(err){ toast('삭제 실패: '+(err.message||err)); } selectMode=false; selected.clear(); renderSelectBar(); });
$('homeBody').addEventListener('click',e=>{ if(!selectMode)return; const r=e.target.closest('.res'); if(!r)return; e.stopImmediatePropagation(); const id=r.dataset.id; if(selected.has(id)){ selected.delete(id); r.classList.remove('sel'); } else { selected.add(id); r.classList.add('sel'); } renderSelectBar(); },true);

/* ===== 오버레이 스택 (뒤로가기 = 최상단 닫기) ===== */
/* 프로그램적으로 닫을 때는 history.back()을 부르지 않는다 — 다음 pushState와 경쟁해 새 시트가 바로 닫히는 문제. 남는 항목은 뒤로가기 한 번을 조용히 삼킨다 */
const ovStack=[];
function pushOv(id,closeFn){ ovStack.push({id,closeFn}); history.pushState({ov:id},''); }
function popOv(id){ const i=ovStack.findIndex(o=>o.id===id); if(i<0)return; ovStack.splice(i,1); }
window.addEventListener('popstate',()=>{ const top=ovStack.pop(); if(top){ top.closeFn(true); } });
const isSheetOpen=()=>ovStack.length>0;

/* ===== 상세 / 수정 시트 ===== */
const dsheet=$('dsheet'), dBody=$('dBody'), dAct=$('dAct'), dFoot=$('dFoot'), scrim=$('scrim');
const sub=$('sub'), subscrim=$('subscrim'), subT=$('subT'), subB=$('subB'), subF=$('subF');
let dIdx=-1, dEdit=false, form=null, dOpenT=0, dTicket=null; // dTicket: 새 티켓(id 없음)일 때
function curTicket(){ return dTicket||ITEMS[dIdx]; }
function openDetail(i,edit){ dOpenT=performance.now(); dIdx=i; dTicket=null; dEdit=!!edit; form=null; renderDetail(); dsheet.classList.add('on'); scrim.classList.add('on'); pushOv('detail',()=>{ dsheet.classList.remove('on'); scrim.classList.remove('on'); closeSub(true); }); }
function openNew(){ dOpenT=performance.now(); dIdx=-1; dTicket={name:'',vendor:D.allVendors()[0]||'',date:'',time:'',qty:2,price:'',memo:'',venue:'',poster:'',seats:[],transfer:{done:false},hasImg:false}; dEdit=true; form=null; renderDetail(); dsheet.classList.add('on'); scrim.classList.add('on'); pushOv('detail',()=>{ dsheet.classList.remove('on'); scrim.classList.remove('on'); closeSub(true); }); }
function closeDetail(){ if(!dsheet.classList.contains('on'))return; dsheet.classList.remove('on'); scrim.classList.remove('on'); closeSub(); popOv('detail'); }
$('dClose').addEventListener('click',()=>{ if(dEdit&&dIdx>=0){ dEdit=false; form=null; renderDetail(); } else closeDetail(); });
scrim.addEventListener('click',()=>{ if(performance.now()-dOpenT<500)return; closeDetail(); });
function renderDetail(){ const t=curTicket(); if(!t||t.gate)return; dEdit?renderEdit(t):renderView(t); }
const PLATFORMS=()=>D.allPlatforms();
const pchips=(cur,attr)=>`<div class="pchips">${PLATFORMS().map(n=>`<span data-${attr}="${esc(n)}" class="${cur===n?'on':''}">${esc(n)}</span>`).join('')}<span data-${attr}="+">＋</span></div>`;
function renderView(t){
  const seats=t.seats||[], a=ticketAcct(t), past=isPast(t), hi=holdInfo(t);
  dAct.innerHTML=`<span class="ic ghost" data-a="menu">⋯</span><span class="pri" data-a="edit">수정</span>`;
  dBody.innerHTML=`
    <div class="dtop">${posterImg(t)}<div><div class="nm">${esc(t.name)}</div><div class="ven">${esc(t.venue||'')}${t.venue&&t.vendor?' · ':''}${esc(t.vendor||'')}</div><div class="when">${fmtDate(t.date,t.time)} · ${isSold(t)?'양도완료':dday(t.date)}</div></div></div>
    <div class="dsec"><h3>좌석 ${seats.length} <span>보유 ${a.held} · 관람 ${a.kept}${a.xfer?` · 양도 ${a.xfer}`:''}</span></h3><div class="dcard">${seats.length?seats.map(x=>`<div class="seat"><div class="r1"><span class="nm ${x.x?'x':''}">${esc(seatLabel(x))}</span>${x.x?'<span class="st x">취소</span>':x.t?`<span class="st t">양도 ${signMoney((Number(x.tp)||0)-D.unitOf(t,x))}</span>`:isSold(t)?'<span class="st t">양도</span>':past?'<span class="st k">관람</span>':'<span class="st">보유</span>'}</div>${(t.perSeat||x.t)?`<div style="font-size:12px;color:var(--ink-3);font-weight:600">${t.perSeat?'구매 '+won(D.unitOf(t,x)):''}${x.t?`${t.perSeat?' · ':''}수령 ${won(x.tp||0)}${x.tvia?' · '+esc(x.tvia):''}${x.tto?' · '+esc(x.tto):''}`:''}</div>`:''}</div>`).join(''):`<div class="seat"><span style="color:var(--ink-3);font-size:13px">좌석 정보 없음 · ${t.qty||0}매</span></div>`}</div></div>
    ${isSold(t)?`<div class="dsec"><h3>전체 양도</h3><div class="dcard"><div class="drow"><span class="l">수령액</span><span class="v">${won(t.transfer.price)}</span></div><div class="drow"><span class="l">경로 · 대상</span><span class="v">${esc(t.transfer.platform||'—')}${t.transfer.to?' · '+esc(t.transfer.to):''}</span></div></div></div>`:''}
    <div class="dsec"><h3>금액</h3><div class="money2"><div><small>결제 (총액)</small><b>${won(t.price)}</b></div><div><small>${t.perSeat?'장당 평균':'장당'} (${t.qty||0}매)</small><b>${won(Math.round((Number(t.price)||0)/Math.max(1,Number(t.qty)||1)))}</b></div>${a.hasXfer?`<div><small>양도 수령</small><b>${won(a.recv)}</b></div><div><small>양도차익 (수령 − 원가)</small><b style="color:${a.profit>=0?'var(--good)':'#e5484d'}">${signMoney(a.profit)}</b></div>`:`<div><small>실지출 (관람 ${a.kept}석)</small><b>${won(Math.round(a.spend))}</b></div>`}</div></div>
    <div class="dsec"><h3>정보</h3><div class="dcard"><div class="drow"><span class="l">예매처</span><span class="v">${esc(t.vendor||'—')}</span></div><div class="drow"><span class="l">공연장</span><span class="v">${esc(t.venue||'—')}</span></div><div class="drow"><span class="l">매수</span><span class="v">${t.qty||0}매</span></div><div class="drow"><span class="l">메모</span><span class="v" style="font-weight:600;color:var(--ink-2)">${esc(t.memo||'—')}</span></div></div></div>
    <div class="dsec"><h3>예매내역 사진</h3><div class="dcard ph" style="padding:12px 14px"><div class="photo"><div class="th"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/></svg></div><div><b style="font-size:13.5px">${t.hasImg?'캡처 1장':'사진 없음'}</b><small>${t.hasImg?'AI 인식 원본':'수정에서 등록'}</small></div></div>${t.hasImg?`<span class="zoom" data-a="zoom"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>`:''}</div></div>`;
  dFoot.innerHTML=''; dFoot.style.display='none'; loadThumb(t);
}
async function loadThumb(t){ if(!t||!t.hasImg||!t.id)return; try{ const b64=t._img||(t._img=await D.fetchTicketImage(t.id)); if(curTicket()!==t||!b64)return; dBody.querySelectorAll('.photo .th').forEach(th=>{ th.innerHTML=`<img src="data:image/jpeg;base64,${b64}" alt="">`; }); }catch(e){} }
function formFrom(t){ return {name:t.name||'',vendor:t.vendor||'',date:t.date||'',time:t.time||'',qty:t.qty||'',price:t.price||'',perSeat:!!t.perSeat,memo:t.memo||'',venue:t.venue||'',poster:t.poster||'',seats:(t.seats||[]).map(x=>({...x})),xferAll:isSold(t)?{price:t.transfer.price||'',via:t.transfer.platform||'',to:t.transfer.to||''}:null,openSeg:-1,editSeat:-1,xOpen:-1}; }
function formAcct(f){ return ticketAcct({qty:f.seats.length||Number(f.qty)||0,price:Number(f.price)||0,perSeat:f.perSeat,seats:f.seats,transfer:f.xferAll?{done:true,price:f.xferAll.price}:{done:false}}); }
function renderEdit(t){
  form=form||formFrom(t); const f=form, seats=f.seats, a=formAcct(f), hasPartial=seats.some(x=>x.t), ft={qty:seats.length||Number(f.qty)||0,price:Number(f.price)||0,perSeat:f.perSeat,seats};
  dAct.innerHTML=`${dIdx>=0?'<span class="ic ghost" data-a="menu">⋯</span>':''}<span class="pri" data-a="save">저장</span>`;
  const seatRow=(x,k)=>{ const unit=D.unitOf(ft,x); const chip = x.x?'<span class="st x stbtn">취소</span>':x.t?`<span class="st t stbtn">양도 ${signMoney((Number(x.tp)||0)-unit)}</span>`:f.xferAll?'<span class="st t">양도</span>':'<span class="st stbtn">보유</span>';
    const seg=`<span class="segin"><span data-v="k" class="${!x.x&&!x.t?'on':''}">보유</span><span data-v="x" class="${x.x?'on':''}">취소</span><span data-v="t" class="${x.t?'on':''}">양도</span></span>`;
    return `<div class="seat3" data-k="${k}"><div class="r1"><span class="nm ${x.x?'x':''}" data-act="editseat">${esc(seatLabel(x)||'좌석 입력')}</span>${f.openSeg===k?seg:chip}${f.openSeg===k?'<span class="del" data-act="delseat">삭제</span>':''}</div>
      ${f.editSeat===k?`<div class="fields">${[["grade","등급",x.grade],["floor","층",x.floor],["zone","구역",x.zone],["row","열",x.row],["no","번",x.no]].map(([kf,lb,vv])=>`<div><small class="flab">${lb}</small><input data-sf="${kf}" value="${esc(vv||'')}"></div>`).join('')}</div>`:''}
      ${f.perSeat?`<div class="pprow"><small>구매가</small><input type="number" class="inl num" data-sf="pp" value="${x.pp!==undefined&&x.pp!==''?x.pp:Math.round((Number(f.price)||0)/Math.max(1,seats.length))}" style="width:110px"></div>`:''}
      ${x.t&&f.xOpen===k?`<div class="xfr"><div class="row2"><div><small>수령액</small><input type="number" data-sf="tp" value="${x.tp||''}" placeholder="0"></div><div><small>대상</small><input data-sf="tto" value="${esc(x.tto||'')}" placeholder="구매자"></div></div><div><small>경로</small>${pchips(x.tvia,'pvia')}</div><div style="display:flex;justify-content:flex-end;margin-top:8px"><span class="xdone" data-act="xdone">완료</span></div></div>`:x.t?`<div class="xsum" data-act="xopen">수령 ${won(x.tp||0)}${x.tvia?' · '+esc(x.tvia):''}${x.tto?' · '+esc(x.tto):''} <b>수정</b></div>`:''}</div>`; };
  dBody.innerHTML=`<div class="ed">
    <div class="dtop">${posterImg(t)}<div style="min-width:0"><input class="inl big" data-f="name" value="${esc(f.name)}" placeholder="공연명"><div class="ven"><input class="inl" data-f="venue" value="${esc(f.venue)}" placeholder="공연장" style="text-align:left;width:100%;padding:2px 6px;margin-left:-6px;font-weight:600;color:var(--ink-3)"></div><div class="when" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="dtbtn" data-act="pickdate"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>${f.date?fmtDate(f.date,''):'날짜'}</span><span class="dtbtn" data-act="picktime"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${f.time||'시간'}</span></div></div></div>
    <div class="dsec"><h3>좌석 ${seats.length} <span style="font-weight:700">보유 ${a.held} · 관람 ${a.kept}${a.xfer?` · 양도 ${a.xfer}`:''}</span></h3><div class="dcard">${seats.length?seats.map(seatRow).join(''):`<div class="seat"><span style="color:var(--ink-3);font-size:13px">좌석을 추가하면 매수가 좌석 수로 잡혀요</span></div>`}</div><div class="addbtn" data-act="addseat">＋ 좌석 추가</div></div>
    <div class="dsec"><h3>전체 양도 <span class="sw2 ${f.xferAll?'on':''}" data-act="xferall" style="${hasPartial?'opacity:.35;pointer-events:none':''}"></span></h3>${f.xferAll?`<div class="dcard" style="padding:10px 14px"><div class="xall" style="grid-template-columns:1.2fr 1fr"><div><small>수령액</small><input type="number" data-xa="price" value="${f.xferAll.price||''}"></div><div><small>대상</small><input data-xa="to" value="${esc(f.xferAll.to||'')}" placeholder="구매자"></div></div><div style="padding:4px 0 6px"><small style="display:block;font-size:10.5px;font-weight:700;color:var(--ink-3);margin-bottom:6px">경로</small>${pchips(f.xferAll.via,'pviaall')}</div></div>`:`<div class="hint2">${hasPartial?'좌석별 양도가 있어 잠김.':'표 전체를 넘겼을 때 켜기.'}</div>`}</div>
    <div class="dsec"><h3>금액</h3><div class="sw3" style="margin:-4px 0 8px"><div class="nudge" style="margin:0">좌석마다 가격이 다르면 켜기</div><span class="sw2 ${f.perSeat?'on':''}" data-act="perseat" style="transform:scale(.85)"></span></div><div class="money2" id="dMoney">${f.perSeat?`<div><small>결제 (합계)</small><b>${won(seats.reduce((s,x)=>s+(Number(x.pp)||0),0))}</b></div><div><small>장당 평균 (${seats.length}매)</small><b>${won(Math.round(seats.reduce((s,x)=>s+(Number(x.pp)||0),0)/Math.max(1,seats.length)))}</b></div>`:`<div><small>결제 (총액)</small><input type="number" class="inl num" data-f="price" value="${f.price}"></div><div><small>장당 (${seats.length||f.qty||0}매)</small><input type="number" class="inl num" data-f="unitp" value="${Math.round((Number(f.price)||0)/Math.max(1,seats.length||Number(f.qty)||1))}"></div>`}</div></div>
    <div class="dsec"><h3>정보</h3><div class="dcard"><div class="drow"><span class="l">예매처</span><span class="v"><span class="vch">${D.allVendors().map(n=>`<span data-vendor="${esc(n)}" class="${f.vendor===n?'on':''}" style="--c:${colorFor(n)}"><i></i>${esc(vendorShort(n))}</span>`).join('')}<span data-vendor="+">＋</span></span></span></div>${seats.length?'':`<div class="drow"><span class="l">매수</span><span class="v"><input type="number" class="inl num" data-f="qty" value="${f.qty}" style="width:64px"> 매</span></div>`}<div class="drow"><span class="l">포스터</span><span class="v"><input class="inl" data-f="poster" value="${esc(f.poster)}" placeholder="이미지 주소 붙여넣기" style="width:100%;text-align:left"></span></div><div class="drow"><span class="l">메모</span><span class="v left"><textarea class="memo" data-f="memo" rows="2" placeholder="예매번호, 동행, 특이사항" style="background:rgba(127,127,127,.09);border-radius:9px;padding:8px 10px">${esc(f.memo)}</textarea></span></div></div><div class="hint2" style="margin-top:6px">포스터: 비워두면 인식 루틴이 NOL(인터파크) 검색으로 자동으로 채워요. 직접 넣으려면 이미지 주소를 붙여넣기.</div></div>
    ${dIdx>=0?`<div class="dsec"><h3>예매내역 사진 <span data-act="photo" style="font-size:12px;font-weight:800;color:var(--ink-2);cursor:pointer">${t.hasImg?'교체 ›':'등록 ›'}</span></h3><div class="dcard ph" style="padding:12px 14px"><div class="photo"><div class="th"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/></svg></div><div><b style="font-size:13.5px">${t.hasImg?'캡처 1장':'사진 없음'}</b><small>${t.hasImg?'교체 · 삭제':'등록'}</small></div></div>${t.hasImg?`<span class="zoom" data-a="zoom"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>`:''}</div></div>`:''}
    <div style="height:8px"></div></div>`;
  dFoot.innerHTML=''; dFoot.style.display='none'; loadThumb(t);
}
function refreshEditMoney(){ const f=form; if(!f)return; const seats=f.seats, ft={qty:seats.length||Number(f.qty)||0,price:Number(f.price)||0,perSeat:f.perSeat,seats}; dBody.querySelectorAll('.seat3 .st.t').forEach(c=>{ const k=+c.closest('.seat3').dataset.k, x=seats[k]; if(x&&x.t)c.textContent='양도 '+signMoney((Number(x.tp)||0)-D.unitOf(ft,x)); }); const m=$('dMoney'); if(m&&f.perSeat){ const bs=m.querySelectorAll('b'); const sum=seats.reduce((s,x)=>s+(Number(x.pp)||0),0); if(bs[0])bs[0].textContent=won(sum); if(bs[1])bs[1].textContent=won(Math.round(sum/Math.max(1,seats.length))); } }
dsheet.addEventListener('click',async e=>{
  const t=curTicket(); const a=e.target.closest('[data-a],[data-act]'); const v=e.target.closest('[data-vendor]'); const sg=e.target.closest('.segin span'); const stb=e.target.closest('.stbtn');
  const pv=e.target.closest('[data-pvia]'); if(pv&&form){ const k=+pv.closest('.seat3').dataset.k; let val=pv.dataset.pvia; if(val==='+'){ val=prompt('경로 이름')||''; if(val)D.addPlatform(val); } form.seats[k].tvia=val; renderEdit(t); return; }
  const pa=e.target.closest('[data-pviaall]'); if(pa&&form){ let val=pa.dataset.pviaall; if(val==='+'){ val=prompt('경로 이름')||''; if(val)D.addPlatform(val); } form.xferAll.via=val; renderEdit(t); return; }
  if(v&&form){ let val=v.dataset.vendor; if(val==='+'){ val=(prompt('예매처 이름')||'').trim(); if(!val)return; D.addVendor(val); } form.vendor=val; renderEdit(t); return; }
  if(sg&&form){ const k=+sg.closest('.seat3').dataset.k, x=form.seats[k]; x.x=sg.dataset.v==='x'; x.t=sg.dataset.v==='t'; if(!x.t)delete x.tp; if(x.t){ form.xferAll=null; form.xOpen=k; } form.openSeg=-1; renderEdit(t); return; }
  if(stb&&form){ form.openSeg=+stb.closest('.seat3').dataset.k; form.editSeat=-1; renderEdit(t); return; }
  if(!a)return; const act=a.dataset.a||a.dataset.act;
  if(act==='edit'){ dEdit=true; form=null; renderDetail(); dBody.scrollTop=0; }
  else if(act==='save'){ await saveForm(); }
  else if(act==='del'){ if(dIdx<0)return; if(!confirm(`"${t.name||'이 티켓'}"을(를) 삭제할까요?`))return; try{ await D.deleteTicket(t.id); toast('삭제되었어요'); closeDetail(); }catch(err){ toast('삭제 실패: '+(err.message||err)); } }
  else if(act==='editseat'){ const k=+a.closest('.seat3').dataset.k; form.editSeat=form.editSeat===k?-1:k; form.openSeg=-1; renderEdit(t); }
  else if(act==='delseat'){ const k=+a.closest('.seat3').dataset.k; form.seats.splice(k,1); form.openSeg=-1; renderEdit(t); }
  else if(act==='addseat'){ const last=form.seats[form.seats.length-1]||{grade:'',floor:'',zone:'',row:''}; form.seats.push({grade:last.grade,floor:last.floor,zone:last.zone,row:last.row,no:''}); form.editSeat=form.seats.length-1; form.openSeg=-1; renderEdit(t); const fld=dBody.querySelector(`.seat3[data-k="${form.editSeat}"] [data-sf=no]`); if(fld){ fld.focus(); fld.scrollIntoView({block:'center'}); } }
  else if(act==='xferall'){ form.xferAll=form.xferAll?null:{price:form.price,via:PLATFORMS()[0]||'',to:''}; renderEdit(t); }
  else if(act==='xopen'){ form.xOpen=+a.closest('.seat3').dataset.k; renderEdit(t); }
  else if(act==='xdone'){ form.xOpen=-1; renderEdit(t); }
  else if(act==='perseat'){ form.perSeat=!form.perSeat; if(form.perSeat){ const u=Math.round((Number(form.price)||0)/Math.max(1,form.seats.length)); form.seats.forEach(x=>{ if(x.pp===undefined||x.pp==='')x.pp=u; }); } else { form.price=form.seats.reduce((s,x)=>s+(Number(x.pp)||0),0)||form.price; } renderEdit(t); }
  else if(act==='menu')openSub('menu');
  else if(act==='photo')openSub('photo');
  else if(act==='zoom')openViewer(t);
  else if(act==='pickdate')openPicker('date');
  else if(act==='picktime')openPicker('time');
});
dsheet.addEventListener('input',e=>{ const el=e.target; if(!form)return;
  if(el.dataset.f==='unitp'){ const n=form.seats.length||Number(form.qty)||1; form.price=Math.round((+el.value||0)*n); const pi=dBody.querySelector('[data-f=price]'); if(pi)pi.value=form.price; }
  else if(el.dataset.f==='price'){ form.price=+el.value||0; const ui=dBody.querySelector('[data-f=unitp]'); if(ui)ui.value=Math.round(form.price/Math.max(1,form.seats.length||Number(form.qty)||1)); }
  else if(el.dataset.f)form[el.dataset.f]=el.value;
  if(el.dataset.sf){ const k=+el.closest('.seat3').dataset.k; form.seats[k][el.dataset.sf]=el.dataset.sf==='grade'?normGrade(el.value):el.value; }
  if(el.dataset.xa)form.xferAll[el.dataset.xa]=el.value;
  refreshEditMoney(); });
dsheet.addEventListener('change',e=>{ if(!form)return; const el=e.target; if(el.dataset.sf&&['grade','floor','zone','row','no'].includes(el.dataset.sf)){ const k=+el.closest('.seat3').dataset.k; const nm=dBody.querySelector(`.seat3[data-k="${k}"] .nm`); if(nm)nm.textContent=seatLabel(form.seats[k])||'좌석 입력'; } });
async function saveForm(){
  const f=form; if(!f)return; if(!f.name.trim()){ toast('공연명을 입력해 주세요'); return; }
  const seats=f.seats.map(x=>{ const o={grade:normGrade(x.grade),floor:x.floor||'',zone:x.zone||'',row:x.row||'',no:x.no||''}; if(x.x)o.x=true; if(x.t){ o.t=true; o.tp=Number(x.tp)||0; if(x.tvia)o.tvia=x.tvia; if(x.tto)o.tto=x.tto; } if(f.perSeat&&x.pp!==undefined&&x.pp!=='')o.pp=Number(x.pp); return o; });
  const partial=seats.some(x=>x.t); const done=!partial&&!!f.xferAll;
  const price=f.perSeat?seats.reduce((s,x)=>s+(Number(x.pp)||0),0):(Number(f.price)||0);
  const t=curTicket();
  const data={vendor:f.vendor||'기타',name:f.name.trim(),date:f.date,time:f.time,qty:seats.length||Number(f.qty)||0,price,memo:(f.memo||'').trim(),venue:(f.venue||'').trim(),poster:(f.poster||'').trim(),perSeat:!!f.perSeat,seats,transfer:done?{done:true,price:Number(f.xferAll.price)||0,to:f.xferAll.to||'',platform:f.xferAll.via||''}:{done:false},hasImg:dIdx>=0?!!t.hasImg:false};
  try{ const saved=await D.saveTicket(data,dIdx>=0?t.id:null); toast(dIdx>=0?'수정되었어요':'추가되었어요'); dEdit=false; form=null; rebuildAll(); const i=ITEMS.findIndex(x=>String(x.id)===String(saved.id)); if(i>=0){ dIdx=i; dTicket=null; renderDetail(); } else closeDetail(); }
  catch(err){ toast('저장 실패: '+(err.message||err)); }
}
/* 미니 시트 */
function openSub(kind){
  const t=curTicket();
  if(kind==='menu'){ subT.innerHTML=`더보기`; subB.innerHTML=`<div class="menu" style="padding:0"><div data-s="share">공유하기</div><div data-s="dup">복제해서 새 티켓</div><div class="danger" data-s="del">티켓 삭제</div></div>`; subF.innerHTML=`<div data-s="cancel">닫기</div>`; }
  else if(kind==='photo'){ subT.innerHTML=`예매내역 사진`; subB.innerHTML=`<div class="menu" style="padding:0"><div data-s="photo-pick">${t.hasImg?'사진 교체':'사진 등록'}</div>${t.hasImg?'<div class="danger" data-s="photo-del">사진 삭제</div>':''}</div>`; subF.innerHTML=`<div data-s="cancel">닫기</div>`; }
  else if(kind==='add'){ subT.innerHTML=`티켓 추가`; subB.innerHTML=`<div class="menu" style="padding:0"><div data-s="ai">📷 캡처로 인식 (AI)</div><div data-s="manual">✏️ 직접 입력</div></div>`; subF.innerHTML=`<div data-s="cancel">닫기</div>`; }
  else if(kind==='share'){ subT.innerHTML=`공유`; subB.innerHTML=`<div class="menu" style="padding:0"><div data-s="share-txt">텍스트로 공유</div>${t.hasImg?'<div data-s="share-img">예매내역 사진 + 텍스트</div>':''}<div data-s="share-copy">텍스트 복사</div></div><pre class="sharePrev">${esc(D.ticketText(t))}</pre>`; subF.innerHTML=`<div data-s="cancel">닫기</div>`; }
  sub.classList.add('on'); subscrim.classList.add('on'); pushOv('sub',()=>{ sub.classList.remove('on'); subscrim.classList.remove('on'); });
}
function closeSub(fromPop){ if(!sub.classList.contains('on'))return; sub.classList.remove('on'); subscrim.classList.remove('on'); if(!fromPop)popOv('sub'); }
subscrim.addEventListener('click',()=>closeSub());
sub.addEventListener('click',async e=>{
  const c=e.target.closest('[data-cal]'); if(c){ pkM+= +c.dataset.cal; if(pkM<0){pkM=11;pkY--;} if(pkM>11){pkM=0;pkY++;} renderCal(); return; }
  const d=e.target.closest('[data-pick]'); if(d){ form.date=d.dataset.pick; closeSub(); renderEdit(curTicket()); return; }
  const hh=e.target.closest('[data-h]'); if(hh){ form.time=String(hh.dataset.h).padStart(2,'0')+':'+(form.time.split(':')[1]||'00'); renderClock(); return; }
  const mm=e.target.closest('[data-m]'); if(mm){ form.time=(form.time.split(':')[0]||'19')+':'+mm.dataset.m; renderClock(); return; }
  const b=e.target.closest('[data-s]'); if(!b)return; const act=b.dataset.s; const t=curTicket();
  if(act==='cancel'){ closeSub(); return; }
  if(act==='timeok'){ closeSub(); renderEdit(t); return; }
  closeSub();
  if(act==='del'){ if(confirm(`"${t.name||'이 티켓'}"을(를) 삭제할까요?`)){ try{ await D.deleteTicket(t.id); toast('삭제되었어요'); closeDetail(); }catch(err){ toast('삭제 실패: '+(err.message||err)); } } }
  else if(act==='share')openSub('share');
  else if(act==='share-txt'||act==='share-img'||act==='share-copy'){ try{ if(act==='share-copy'){ await navigator.clipboard.writeText(D.ticketText(t)); toast('텍스트 복사됨'); return; } let img=null; if(act==='share-img'){ toast('사진 불러오는 중…'); img=await D.fetchTicketImage(t.id); } const r=await D.shareTicket(t,{wantTxt:true,wantImg:!!img,imgB64:img}); if(r==='copied')toast('공유 미지원 · 텍스트 복사했어요'); if(r==='downloaded')toast('사진 저장 + 텍스트 복사'); }catch(err){ if(err&&err.name!=='AbortError')toast('공유 실패: '+(err.message||err)); } }
  else if(act==='dup'){ try{ const s=await D.duplicateTicket(t.id); toast('복제됨 · 내용을 고쳐 저장하세요'); rebuildAll(); const i=ITEMS.findIndex(x=>String(x.id)===String(s.id)); closeDetail(); setTimeout(()=>openDetail(i,true),50); }catch(err){ toast('복제 실패: '+(err.message||err)); } }
  else if(act==='photo-pick'){ $('imgFile').click(); }
  else if(act==='photo-del'){ if(confirm('예매내역 사진을 삭제할까요?')){ try{ await D.clearTicketImage(t.id); toast('사진이 삭제되었어요'); t.hasImg=false; t._img=null; renderDetail(); }catch(err){ toast('삭제 실패: '+(err.message||err)); } } }
  else if(act==='ai')$('aiFile').click();
  else if(act==='manual')openNew();
});
$('imgFile').addEventListener('change',async e=>{ const f=e.target.files[0]; e.target.value=''; const t=curTicket(); if(!f||!t||!t.id)return; try{ toast('사진 올리는 중…'); await D.setTicketImage(t.id,f); toast('예매내역 사진이 등록되었어요'); t.hasImg=true; t._img=null; renderDetail(); }catch(err){ toast('업로드 실패: '+(err.message||err)); } });
$('aiFile').addEventListener('change',async e=>{ const files=[...e.target.files]; e.target.value=''; if(!files.length)return; toast(`캡처 ${files.length}장 처리 중…`); try{ const r=await D.queueCaptures(files); toast(`${r.ok}장 접수됨${r.fail?` · ${r.fail}장 실패`:''} · AI가 곧 인식해요`); }catch(err){ toast(err.message||'업로드 실패'); } });
$('addBtn').addEventListener('click',()=>openSub('add'));
/* 피커 */
let pkY=0, pkM=0;
function openPicker(kind){ if(kind==='date'){ const d=form.date?new Date(form.date):new Date(); pkY=d.getFullYear(); pkM=d.getMonth(); subT.innerHTML='날짜'; renderCal(); subF.innerHTML='<div data-s="cancel">닫기</div>'; } else { if(!form.time)form.time='19:00'; subT.innerHTML='시간'; renderClock(); subF.innerHTML='<div data-s="cancel">닫기</div><div class="pri" data-s="timeok">완료</div>'; } sub.classList.add('on'); subscrim.classList.add('on'); pushOv('sub',()=>{ sub.classList.remove('on'); subscrim.classList.remove('on'); }); }
function renderCal(){ const first=new Date(pkY,pkM,1), off=first.getDay(), dim=new Date(pkY,pkM+1,0).getDate(), prevDim=new Date(pkY,pkM,0).getDate(); const today=D.ymd(new Date()); const cells=[]; for(let i=0;i<off;i++)cells.push(`<div class="d o">${prevDim-off+1+i}</div>`); for(let d=1;d<=dim;d++){ const ds=`${pkY}-${String(pkM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const has=T.some(x=>x.date===ds); cells.push(`<div class="d ${has?'has':''} ${ds===form.date?'sel':''} ${ds===today?'tod':''}" data-pick="${ds}">${d}</div>`); } subB.innerHTML=`<div class="pk"><div class="mh"><span data-cal="-1">‹</span><b>${pkY}년 ${pkM+1}월</b><span data-cal="1">›</span></div><div class="wk"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="days">${cells.join('')}</div></div>`; }
function renderClock(){ const [h,m]=form.time.split(':'); subB.innerHTML=`<div class="pk"><input class="big" id="timeIn" value="${form.time}" inputmode="numeric" placeholder="HH:MM" style="background:transparent;border:0;width:100%;text-align:center;padding:0;font-size:34px;font-weight:900;color:var(--accent);letter-spacing:-.04em"><div class="pkl">시</div><div class="hrs" style="grid-template-columns:repeat(6,1fr)">${Array.from({length:24},(_,x)=>`<span data-h="${x}" class="${+h===x?'on':''}">${x}</span>`).join('')}</div><div class="pkl">분</div><div class="mins">${['00','05','10','15','20','25','30','35','40','45','50','55'].map(x=>`<span data-m="${x}" class="${m===x?'on':''}">${x}</span>`).join('')}</div></div>`; subB.querySelector('#timeIn').addEventListener('input',e=>{ const v=e.target.value.replace(/[^0-9]/g,'').slice(0,4); if(v.length===4){ const hh=Math.min(23,+v.slice(0,2)), mm=Math.min(59,+v.slice(2)); form.time=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'); subB.querySelectorAll('[data-h]').forEach(x=>x.classList.toggle('on',+x.dataset.h===hh)); subB.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x.dataset.m===String(mm).padStart(2,'0'))); } }); }
/* 이미지 뷰어 */
async function openViewer(t){ const v=$('viewer'), box=v.querySelector('.img'); v.classList.add('on'); pushOv('viewer',()=>v.classList.remove('on'));
  const show=b64=>{ box.innerHTML=b64?`<img src="data:image/jpeg;base64,${b64}" alt="">`:'<div>사진을 불러올 수 없어요</div>'; };
  if(t._img){ show(t._img); return; } box.innerHTML='<div class="spinner"></div>';
  try{ t._img=await D.fetchTicketImage(t.id); show(t._img); }catch(e){ box.innerHTML='<div>불러오기 실패</div>'; } }
$('viewerX').addEventListener('click',()=>{ $('viewer').classList.remove('on'); popOv('viewer'); });

/* ===== 예매처 색 관리 · AI 대기열 · 동기화 (설정 하위 시트) ===== */
let colorTarget=null;
function openVColorMgr(){ subT.innerHTML='예매처 색'; subB.innerHTML=`<div class="menu" style="padding:0">${D.allVendors().concat(D.allPlatforms().filter(p=>!D.allVendors().includes(p))).map(v=>`<div data-vc="${esc(v)}"><i style="width:14px;height:14px;border-radius:50%;background:${colorFor(v)};display:inline-block;margin-right:6px"></i>${esc(v)}<span style="margin-left:auto;color:var(--ink-3)">›</span></div>`).join('')}</div>`; subF.innerHTML='<div data-s="cancel">닫기</div>'; subB.querySelectorAll('[data-vc]').forEach(el=>el.addEventListener('click',()=>openColorPick(el.dataset.vc))); sub.classList.add('on'); subscrim.classList.add('on'); pushOv('sub',()=>{ sub.classList.remove('on'); subscrim.classList.remove('on'); }); }
function openColorPick(v){ colorTarget=v; subT.innerHTML=`<span>${esc(v)}</span><small>색 선택</small>`; subB.innerHTML=`<div class="swatches">${D.PICK_PALETTE.map(h=>`<span data-hex="${h}" class="${h.toLowerCase()===colorFor(v).toLowerCase()?'on':''}" style="background:${h}"></span>`).join('')}</div><div style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="color" id="colorCustom" value="${colorFor(v)}" style="width:44px;height:36px;padding:0;border:0;background:none"><span style="font-size:12px;color:var(--ink-3)">직접 고르기</span><span data-hex="" style="margin-left:auto;font-size:12px;font-weight:700;color:var(--ink-2);cursor:pointer">기본색으로</span></div>`; subF.innerHTML='<div data-s="cancel">닫기</div>'; subB.querySelectorAll('[data-hex]').forEach(el=>el.addEventListener('click',()=>{ D.setVendorColor(v,el.dataset.hex||null); toast(el.dataset.hex?'색 변경됨':'기본색으로 되돌림'); rebuildAll(true); openVColorMgr(); })); subB.querySelector('#colorCustom').addEventListener('change',e=>{ D.setVendorColor(v,e.target.value); toast('색 변경됨'); rebuildAll(true); }); }
async function openPendManage(){ subT.innerHTML='AI 캡처 대기열'; subB.innerHTML='<div class="spinner"></div>'; subF.innerHTML='<div data-s="cancel">닫기</div>'; sub.classList.add('on'); subscrim.classList.add('on'); pushOv('sub',()=>{ sub.classList.remove('on'); subscrim.classList.remove('on'); }); const rows=await D.fetchPendingsFull(); subB.innerHTML=rows.length?`<div class="pendlist">${rows.map(p=>`<div class="pitem" data-pid="${p.id}"><img src="data:image/jpeg;base64,${p.image_b64}" alt=""><div><b>${p.status==='error'?'⚠️ 인식 실패'+(p.result?' · '+esc(p.result):''):'AI가 인식 중…'}</b><div class="pb"><span data-pa="replace">사진 교체</span><span data-pa="del" class="danger">삭제</span></div></div></div>`).join('')}</div>`:'<div class="empty"><b>대기 중인 캡처가 없어요</b></div>'; subB.querySelectorAll('[data-pa]').forEach(el=>el.addEventListener('click',async()=>{ const id=el.closest('.pitem').dataset.pid; if(el.dataset.pa==='del'){ if(!confirm('이 캡처를 삭제할까요?'))return; await D.removePending(id); toast('삭제됨'); openPendManage(); } else { pendReplaceId=id; $('pendFile').click(); } })); }
let pendReplaceId=null; $('pendFile').addEventListener('change',async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f||!pendReplaceId)return; try{ await D.replacePending(pendReplaceId,f); toast('사진 교체됨 · 다시 인식해요'); openPendManage(); }catch(err){ toast('교체 실패: '+(err.message||err)); } pendReplaceId=null; });
function openSync(){ const st=D.getState(), dirty=D.dirtyCount(); subT.innerHTML='동기화'; subB.innerHTML=`<div class="tile" style="padding:14px"><b style="font-size:14px">${st.mode==='cloud'?'✅ 클라우드에 자동 저장 중':'⚠️ 서버에 연결할 수 없어 이 기기에 임시 저장 중'}</b><div class="nudge" style="margin-top:6px">${st.mode==='cloud'?'폰·PC 어디서 열어도 같은 목록. 25초마다 자동 갱신. AI 인식은 6시간마다 — 급하면 컴퓨터의 Claude에게 "큐 처리해줘".':`서버가 돌아오면 자동으로 다시 연결하고 변경분을 올려요.${dirty?` 미전송 ${dirty}건.`:''}`}</div></div>`; subF.innerHTML='<div data-s="cancel">닫기</div><div class="pri" data-s="refresh">지금 새로고침</div>'; sub.classList.add('on'); subscrim.classList.add('on'); pushOv('sub',()=>{ sub.classList.remove('on'); subscrim.classList.remove('on'); }); subF.querySelector('[data-s=refresh]').addEventListener('click',()=>{ D.fetchTickets().then(()=>toast('새로고침됨')); },{once:true}); }

/* ===== 데이터 변경 → 전체 갱신 ===== */
function rebuildAll(force){ rebuildData(); if(force)_vaultSig=null; buildVault(); if(mode==='shows')renderShows(); if(mode==='grid')buildOv(); if(screen==='home')renderHome(); if(screen==='money')renderMoney(); if(screen==='set')renderSet(); render(); }
D.onChange((type,payload)=>{
  if(type==='toast')toast(payload);
  if(type==='tickets')rebuildAll();
  if(type==='pendings')renderPendBanner();
  if(type==='mode'||type==='loading'){ const st=D.getState(); $('syncPill').textContent=st.mode==='cloud'?(st.loading?'동기화 중…':'동기화 됨'):'오프라인'; $('syncPill').classList.toggle('off',st.mode!=='cloud'); }
  if(type==='colors'||type==='lists'){ if(dEdit)renderEdit(curTicket()); }
});

/* ===== 부팅 ===== */
applyDark(dark); applyImm(imm);
rebuildData(); buildVault(); pos=HOME; showScreen('home');
D.init().then(()=>{ pos=HOME; render(); });
D.startSync({paused:()=>isSheetOpen()||dragging});
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  /* 새 서비스워커가 넘겨받으면 한 번 새로고침 — 백그라운드에서 갱신돼도 옛 파일로 계속 도는 일 방지 */
  let reloaded=false; navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(reloaded||!navigator.serviceWorker.controller)return; reloaded=true; if(!isSheetOpen()&&!dragging)location.reload(); }); }
