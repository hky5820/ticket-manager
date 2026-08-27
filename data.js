/* 티켓 보관함 — 데이터 레이어 (Supabase · 회계 · 동기화 · 직렬화). DOM 접근 없음.
   뷰(app.js)는 이 모듈의 export만 쓴다. 이 파일 안에 getElementById / confirm / toast 는 두지 않는다. */

/* ===== 상수 ===== */
export const LS_TICKETS='tm_tickets_v1', LS_VENDORS='tm_vendors_v1', LS_CFG='tm_cfg_v1', LS_GRADES='tm_grades_v1', LS_PLATFORMS='tm_platforms_v1';
export const DEFAULT_VENDORS=['티켓링크','멜론티켓','세종문화회관','YES24','클립서비스','NOL 인터파크','샤롯데씨어터'];
export const DEFAULT_GRADES=['VIP','R','S','A'];
export const DEFAULT_PLATFORMS=['티켓베이','중고나라','당근마켓','번개장터','트위터/X','지인','기타'];
const PALETTE=['#c5b0f4','#f3c9b6','#c8e6cd','#efd4d4','#dceeb1','#f4ecd6','#b8d4e8','#e8c9e0','#d9d0f0','#cfe6c0'];
// 예매처 브랜드 색. 사용자가 색 관리에서 덮어쓸 수 있음(vcolors)
export const VENDOR_COLORS={'티켓링크':'#E03E3E','멜론티켓':'#00A33F','세종문화회관':'#F9A825','YES24':'#3B82F6','샤롯데씨어터':'#E0457A','클립서비스':'#22C3E6','NOL 인터파크':'#2E63F0','LG아트센터':'#B00046'};
// 예매처 약칭(카드·목록용). 없으면 앞 4자
export const VENDOR_SHORT={'NOL 인터파크':'NOL','멜론티켓':'멜론','티켓링크':'링크','YES24':'YES24','세종문화회관':'세종','샤롯데씨어터':'샤롯데','클립서비스':'클립','LG아트센터':'LG아트'};
export const LS_VCOLORS='tm_vcolors_v1';
export const LS_DIRTY='tm_dirty_v1'; // 오프라인 중 변경된 티켓 id {up:[],del:[]} — 서버 복귀 시 밀어올림
export const PICK_PALETTE=['#E03E3E','#FF6B6B','#FF4D8D','#F0629E','#B00046','#F9A825','#FF8C42','#FFC24B','#00A33F','#2FBF71','#12B886','#35C0F0','#38BDF8','#1565D8','#4B79FF','#5B6EF5','#8B5CF6','#E0457A','#7c8598','#495a70'];
export const WD=['일','월','화','수','목','금','토'];
const BUILTIN_CFG={url:'https://ydqabdlwzseommowiupw.supabase.co',key:'sb_publishable_t5MlvS1Ea8ftD7IkfzqaiA_BCrzU80J'};

/* ===== 상태 (모듈 내부, getState()로 읽기) ===== */
let tickets=load(LS_TICKETS,[]);
let pendings=[];
let dataVer=0; // 로컬 변경마다 증가. 조회 도중 로컬 변경이 나면 오래된 스냅샷으로 덮어쓰지 않는 가드
let vendors=load(LS_VENDORS,DEFAULT_VENDORS.slice());
let grades=load(LS_GRADES,DEFAULT_GRADES.slice());
let platforms=load(LS_PLATFORMS,DEFAULT_PLATFORMS.slice());
let vcolors=load(LS_VCOLORS,{});
let sb=null, mode='local', loading=false;

const listeners=[];
export function onChange(fn){ listeners.push(fn); }
function emit(type,payload){ listeners.forEach(fn=>{ try{ fn(type,payload); }catch(e){ console.error(e); } }); }
export function getState(){ return {tickets,pendings,vendors,grades,platforms,vcolors,mode,loading,dataVer}; }

/* ===== 순수 헬퍼 ===== */
export function load(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v??def;}catch(e){return def;}}
function saveLocal(){localStorage.setItem(LS_TICKETS,JSON.stringify(tickets));localStorage.setItem(LS_VENDORS,JSON.stringify(vendors));}
function getCfg(){const c=load(LS_CFG,null);return (c&&c.url&&c.key)?c:{...BUILTIN_CFG};}
export function colorFor(v){v=v||'';let c=vcolors[v]||VENDOR_COLORS[v];if(!c){let h=0;for(let i=0;i<v.length;i++)h=(h*31+v.charCodeAt(i))>>>0;c=PALETTE[h%PALETTE.length];}return /^#[0-9a-f]{6}$/i.test(c)?c:'#8a8f99';} // hex 검증(localStorage 변조 대비)
export function vendorShort(v){ v=v||''; return VENDOR_SHORT[v]||v.slice(0,4); }
export function won(n){return '₩'+(Number(n)||0).toLocaleString('ko-KR');}
export function money(v){v=Math.round(v);return (v<0?'−₩':'₩')+(Math.abs(v)).toLocaleString('ko-KR');}
export function signMoney(v){v=Math.round(v);return (v>0?'+₩':v<0?'−₩':'₩')+(Math.abs(v)).toLocaleString('ko-KR');}
// 좌석 하나의 원가: 좌석별 가격(perSeat)이면 s.pp, 아니면 price/qty
export function unitOf(t,s){ const qty=Number(t.qty)||0, price=Number(t.price)||0; if(t.perSeat&&s&&s.pp!==undefined&&s.pp!=='')return Number(s.pp)||0; return qty>0?price/qty:0; }
// 티켓 단위 회계: 매수(취소만 제외)·실지출(관람석 원가)·양도차익(양도수령−양도석 원가). ARCHITECTURE.md §2 — 여기 한 곳만 고친다
export function ticketAcct(t){
  const qty=Number(t.qty)||0, seats=t.seats||[];
  const canceled=seats.filter(s=>s.x).length;
  let xfer, recv, xferCost;
  if(t.transfer&&t.transfer.done){ recv=Number(t.transfer.price)||0; xfer=Math.max(0,qty-canceled); xferCost=seats.length?seats.filter(s=>!s.x).reduce((a,s)=>a+unitOf(t,s),0):xfer*unitOf(t); }
  else{ const xs=seats.filter(s=>s.t); xfer=xs.length; recv=xs.reduce((a,s)=>a+(Number(s.tp)||0),0); xferCost=xs.reduce((a,s)=>a+unitOf(t,s),0); }
  const kept=Math.max(0,qty-canceled-xfer);
  const keptSeats=seats.filter(s=>!s.x&&!s.t);
  const spend=(t.transfer&&t.transfer.done)?0:(seats.length?keptSeats.reduce((a,s)=>a+unitOf(t,s),0):kept*unitOf(t));
  return { held:qty-canceled, kept, xfer, canceled, recv, spend, profit: recv-xferCost, hasXfer: xfer>0||!!(t.transfer&&t.transfer.done) };
}
export function ticketRecv(t){ return ticketAcct(t).recv; }
export function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function numOrNull(v){return v===''||v==null?null:Number(v);}
export function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function fmtDate(ds,time){ if(!ds)return ''; const p=ds.split('-').map(Number); if(p.length<3)return ds+(time?' '+time:''); const d=new Date(p[0],p[1]-1,p[2]); return `${p[1]}.${p[2]} ${WD[d.getDay()]}`+(time?` ${time}`:''); }
export function ddayN(ds){ if(!ds)return null; const p=ds.split('-').map(Number); if(p.length<3)return null; const d=new Date(p[0],p[1]-1,p[2]); const n=new Date(); n.setHours(0,0,0,0); return Math.round((d-n)/864e5); }
export function dday(ds){ const n=ddayN(ds); if(n===null)return '미정'; return n===0?'오늘':n>0?'D-'+n:'D+'+(-n); }
export function isPast(t){ const n=ddayN(t.date); return n!==null&&n<0; }
export function isSold(t){ return !!(t.transfer&&t.transfer.done); }
export function seatLabel(s){ return [s.grade, s.floor?s.floor+'층':'', s.zone?s.zone+'구역':'', s.row?s.row+'열':'', s.no?(/^\d+$/.test(String(s.no))?s.no+'번':s.no):''].filter(Boolean).join(' '); }
// 카드용 좌석 요약: 같은 구역/열이면 "VIP 1층 A구역 3열 12·13번"
export function seatLine(t){
  const live=(t.seats||[]).filter(s=>!s.x); if(!live.length)return '';
  const head=[live[0].grade, live[0].floor?live[0].floor+'층':'', live[0].zone?live[0].zone+'구역':'', live[0].row?live[0].row+'열':''].filter(Boolean).join(' ');
  const same=live.every(s=>s.grade===live[0].grade&&s.floor===live[0].floor&&s.zone===live[0].zone&&s.row===live[0].row);
  if(same){ const nos=live.map(s=>s.no).filter(Boolean); const allNum=nos.every(n=>/^\d+$/.test(String(n))); return (head?head+' ':'')+(nos.length?nos.join('·')+(allNum?'번':''):''); }
  return live.map(seatLabel).join(' · ');
}
export function normGrade(g){ g=(g||'').trim(); if(/^OP석?$/i.test(g)||/오피/.test(g))return 'OP'; return g.replace(/석$/,'')||g; }

/* ===== DB blob 매핑 (seats jsonb 하나에 전부 패킹 — 컬럼 추가 없음) =====
   seats = { seats:[{grade,floor,zone,row,no,x?,t?,tp?,tto?,tvia?,pp?}], time, transfer:{done,price,to,platform}, hasImg, poster?, venue?, perSeat? } */
export function parseBlob(raw){
  if(Array.isArray(raw)) return {seats:raw,time:'',transfer:{done:false}};
  raw=(raw&&typeof raw==='object')?raw:{};
  return {seats:Array.isArray(raw.seats)?raw.seats:[], time:raw.time||'', transfer:raw.transfer||{done:false}, hasImg:!!raw.hasImg, poster:raw.poster||'', venue:raw.venue||'', perSeat:!!raw.perSeat};
}
export function rowToTicket(r){const b=parseBlob(r.seats);return {id:r.id,vendor:r.vendor,name:r.name,date:r.show_date||'',time:b.time,qty:r.qty,price:r.price,memo:r.memo,seats:b.seats,transfer:b.transfer,hasImg:b.hasImg,poster:b.poster,venue:b.venue,perSeat:b.perSeat,created:r.created_at};}
export function ticketToDB(t){return {vendor:t.vendor,name:t.name,show_date:t.date||null,qty:numOrNull(t.qty),price:numOrNull(t.price),memo:t.memo||null,
  seats:{seats:t.seats||[],time:t.time||'',transfer:t.transfer||{done:false},hasImg:!!t.hasImg,poster:t.poster||'',venue:t.venue||'',perSeat:!!t.perSeat}};}

/* ===== 오프라인 폴백 ===== */
export function isNetErr(e){
  if(!navigator.onLine)return true;
  const m=String((e&&e.message)||e||'');
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_name_not_resolved/i.test(m);
}
function goOffline(){ if(mode!=='cloud')return; mode='local'; saveLocal(); emit('mode',mode); emit('toast','서버에 연결할 수 없어 이 기기에 임시 저장해요'); }
const isLocalId=id=>String(id).startsWith('t');
function markDirty(id,del){
  id=String(id); const d=load(LS_DIRTY,{up:[],del:[]});
  d.up=d.up.filter(x=>x!==id); d.del=d.del.filter(x=>x!==id);
  if(del){ if(!isLocalId(id))d.del.push(id); } else d.up.push(id);
  localStorage.setItem(LS_DIRTY,JSON.stringify(d));
}
export function dirtyCount(){ const d=load(LS_DIRTY,{up:[],del:[]}); return d.up.length+d.del.length; }
async function flushDirty(){
  if(!(mode==='cloud'&&sb))return;
  const d=load(LS_DIRTY,{up:[],del:[]});
  if(!d.up.length&&!d.del.length)return;
  if(d.del.length){ const {error}=await sb.from('tickets').delete().in('id',d.del); if(error)throw error; }
  for(const id of d.up){
    const t=tickets.find(x=>String(x.id)===String(id)); if(!t)continue;
    const {error}=isLocalId(id) ? await sb.from('tickets').insert(ticketToDB(t)) : await sb.from('tickets').upsert({id,...ticketToDB(t)});
    if(error)throw error;
  }
  localStorage.removeItem(LS_DIRTY);
  emit('toast',`오프라인 변경 ${d.up.length+d.del.length}건 동기화됨`);
}

/* ===== 수명주기 ===== */
export async function init(){
  const cfg=getCfg();
  if(cfg.url&&cfg.key&&window.supabase){
    try{ sb=window.supabase.createClient(cfg.url,cfg.key); mode='cloud'; emit('mode',mode); await flushDirty(); await fetchTickets(); }
    catch(e){ console.error(e); mode='local'; tickets=load(LS_TICKETS,[]); emit('mode',mode); emit('tickets'); }
  } else { emit('tickets'); }
}
export async function fetchTickets(){
  if(mode!=='cloud'||!sb)return;
  loading=true; emit('loading',true);
  const ver=dataVer;
  const {data,error}=await sb.from('tickets').select('id,vendor,name,show_date,qty,price,memo,seats,created_at').order('created_at',{ascending:true});
  loading=false; emit('loading',false);
  if(error){ if(isNetErr(error)){ goOffline(); return; } emit('toast','불러오기 실패: '+error.message); return; }
  if(ver!==dataVer)return; // 조회 도중 로컬 변경 → 오래된 스냅샷 적용 스킵
  tickets=(data||[]).map(rowToTicket);
  try{ const {data:pd}=await sb.from('pending_uploads').select('id,status,result').neq('status','done').order('created_at',{ascending:false}); pendings=pd||[]; }catch(e){}
  emit('tickets'); emit('pendings');
}
// 25초 주기 동기화. paused()가 true면 건너뜀(팝업 열림·탭 숨김 등은 뷰가 판단)
export function startSync({paused}={paused:()=>false}){
  setInterval(async()=>{
    if(!sb||document.hidden||(paused&&paused()))return;
    if(mode==='cloud'){ fetchTickets(); return; }
    if(!navigator.onLine)return;
    const {error}=await sb.from('tickets').select('id').limit(1); if(error)return;
    mode='cloud'; emit('mode',mode);
    try{ await flushDirty(); }catch(e){ if(isNetErr(e)){ goOffline(); return; } emit('toast','동기화 실패: '+(e.message||e)); }
    fetchTickets();
  },25000);
}

/* ===== 티켓 CRUD ===== */
// data = 앱 shape(id 제외). 반환: 저장된 티켓. 실패 시 throw
export async function saveTicket(data,id=null){
  let saved=null, done=false;
  if(mode==='cloud'&&sb){
    try{
      if(id){ const {data:row,error}=await sb.from('tickets').update(ticketToDB(data)).eq('id',id).select().single(); if(error)throw error; saved=rowToTicket(row); const i=tickets.findIndex(x=>String(x.id)===String(id)); if(i>-1)tickets[i]=saved; else tickets.push(saved); }
      else{ const {data:row,error}=await sb.from('tickets').insert(ticketToDB(data)).select().single(); if(error)throw error; saved=rowToTicket(row); tickets.push(saved); }
      done=true;
    }catch(e){ if(!isNetErr(e))throw e; goOffline(); }
  }
  if(!done){
    if(id){ const i=tickets.findIndex(x=>String(x.id)===String(id)); saved={...(i>-1?tickets[i]:{}),...data,id}; if(i>-1)tickets[i]=saved; else tickets.push(saved); }
    else{ id='t'+Date.now()+Math.floor(Math.random()*1000); saved={id,...data}; tickets.push(saved); }
    saveLocal(); markDirty(id);
  }
  dataVer++; emit('tickets'); return saved;
}
export async function deleteTicket(id){
  if(mode==='cloud'&&sb){ try{ const {error}=await sb.from('tickets').delete().eq('id',id); if(error)throw error; }catch(e){ if(!isNetErr(e))throw e; goOffline(); } }
  tickets=tickets.filter(x=>String(x.id)!==String(id)); dataVer++;
  if(mode!=='cloud'){ markDirty(id,true); saveLocal(); }
  emit('tickets');
}
export async function deleteTickets(ids){
  if(mode==='cloud'&&sb){ try{ const {error}=await sb.from('tickets').delete().in('id',ids); if(error)throw error; }catch(e){ if(!isNetErr(e))throw e; goOffline(); } }
  const set=new Set(ids.map(String)); tickets=tickets.filter(x=>!set.has(String(x.id))); dataVer++;
  if(mode!=='cloud'){ ids.forEach(i=>markDirty(i,true)); saveLocal(); }
  emit('tickets');
}
export async function duplicateTicket(id){
  const t=tickets.find(x=>String(x.id)===String(id)); if(!t)return null;
  const copy={...t}; delete copy.id; delete copy.created; copy.hasImg=false;
  copy.seats=(t.seats||[]).map(s=>({grade:s.grade,floor:s.floor,zone:s.zone,row:s.row,no:s.no,pp:s.pp}));
  copy.transfer={done:false};
  return saveTicket(copy);
}

/* ===== 예매내역 사진 (img 컬럼) ===== */
export async function setTicketImage(id,file){
  if(!(mode==='cloud'&&sb))throw new Error('오프라인에서는 사진을 올릴 수 없어요');
  const b64=await fileToB64(file);
  const t=tickets.find(x=>String(x.id)===String(id)); if(!t)throw new Error('티켓 없음');
  t.hasImg=true;
  const {error}=await sb.from('tickets').update({img:b64,seats:ticketToDB(t).seats}).eq('id',id); if(error){ t.hasImg=false; throw error; }
  dataVer++; emit('tickets');
}
export async function clearTicketImage(id){
  if(!(mode==='cloud'&&sb))throw new Error('오프라인');
  const t=tickets.find(x=>String(x.id)===String(id)); if(!t)return;
  t.hasImg=false;
  const {error}=await sb.from('tickets').update({img:null,seats:ticketToDB(t).seats}).eq('id',id); if(error){ t.hasImg=true; throw error; }
  dataVer++; emit('tickets');
}
export async function fetchTicketImage(id){
  if(!(mode==='cloud'&&sb))return null;
  const {data}=await sb.from('tickets').select('img').eq('id',id).single();
  return data&&data.img?data.img:null;
}

/* ===== AI 캡처 대기열 (pending_uploads) ===== */
export async function queueCaptures(files){
  if(mode!=='cloud'||!sb)throw new Error('오프라인이라 지금은 안 돼요');
  let ok=0, fail=0;
  for(const f of files){ try{ const b64=await fileToB64(f); const {error}=await sb.from('pending_uploads').insert({image_b64:b64,status:'pending'}); if(error)throw error; ok++; }catch(e){ fail++; } }
  fetchTickets();
  return {ok,fail};
}
export async function fetchPendingsFull(){
  if(!(mode==='cloud'&&sb))return [];
  const {data}=await sb.from('pending_uploads').select('id,status,result,image_b64').neq('status','done').order('created_at',{ascending:false});
  return data||[];
}
export async function removePending(id){
  if(!(mode==='cloud'&&sb))return;
  await sb.from('pending_uploads').delete().eq('id',id);
  pendings=pendings.filter(p=>String(p.id)!==String(id)); emit('pendings');
}
export async function replacePending(id,file){
  if(!(mode==='cloud'&&sb))return;
  const b64=await fileToB64(file);
  const {error}=await sb.from('pending_uploads').update({image_b64:b64,status:'pending',result:null}).eq('id',id); if(error)throw error;
  const pp=pendings.find(x=>String(x.id)===String(id)); if(pp){ pp.status='pending'; pp.result=null; } emit('pendings');
}

/* ===== 예매처 · 양도처 · 색 ===== */
export function allVendors(){ const set=new Set(vendors); tickets.forEach(t=>{ if(t.vendor)set.add(t.vendor); }); return [...set]; }
export function allPlatforms(){ const set=new Set(platforms); tickets.forEach(t=>{ if(t.transfer&&t.transfer.platform)set.add(t.transfer.platform); (t.seats||[]).forEach(s=>{ if(s.tvia)set.add(s.tvia); }); }); return [...set]; }
export function addVendor(n){ n=(n||'').trim(); if(!n)return false; if(!vendors.includes(n))vendors.push(n); saveLocal(); emit('lists'); return true; }
export function removeVendor(n){ vendors=vendors.filter(x=>x!==n); saveLocal(); emit('lists'); }
export function addPlatform(n){ n=(n||'').trim(); if(!n)return false; if(!platforms.includes(n))platforms.push(n); localStorage.setItem(LS_PLATFORMS,JSON.stringify(platforms)); emit('lists'); return true; }
export function addGrade(n){ n=normGrade(n); if(!n)return false; if(!grades.includes(n))grades.push(n); localStorage.setItem(LS_GRADES,JSON.stringify(grades)); emit('lists'); return true; }
export function setVendorColor(name,hex){ if(hex)vcolors[name]=hex; else delete vcolors[name]; localStorage.setItem(LS_VCOLORS,JSON.stringify(vcolors)); emit('colors'); }
export function isDefaultVendor(v){ return DEFAULT_VENDORS.includes(v); }

/* ===== 백업 ===== */
export function exportBackup(){
  const blob=new Blob([JSON.stringify({tickets,vendors},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='티켓보관함_백업.json'; a.click();
}
export function parseBackup(text){ const d=JSON.parse(text); if(!Array.isArray(d.tickets))throw new Error('올바른 백업 파일이 아니에요'); return d; }
export async function importBackup(d){
  if(Array.isArray(d.vendors))d.vendors.forEach(v=>{ if(!vendors.includes(v))vendors.push(v); });
  const have=new Set(tickets.map(t=>String(t.id)));
  const fresh=d.tickets.filter(t=>!have.has(String(t.id)));
  let done=false;
  if(mode==='cloud'&&sb){ try{ if(fresh.length){ const {error}=await sb.from('tickets').insert(fresh.map(ticketToDB)); if(error)throw error; } await fetchTickets(); done=true; }catch(e){ if(!isNetErr(e))throw e; goOffline(); } }
  if(!done){ fresh.forEach(t=>{ tickets.push(t); markDirty(t.id); }); dataVer++; saveLocal(); emit('tickets'); }
  return {added:fresh.length};
}

/* ===== 공유 ===== */
export function ticketText(t){
  const a=ticketAcct(t);
  const L=[`🎫 ${t.name||'(공연명 없음)'}`];
  if(t.venue)L.push(`📍 ${t.venue}`);
  L.push(`📅 ${fmtDate(t.date,t.time)}`);
  const sl=seatLine(t); if(sl)L.push(`💺 ${sl}`);
  L.push(`🧾 ${t.qty||0}매 · ${won(t.price)}${t.vendor?' · '+t.vendor:''}`);
  if(a.hasXfer)L.push(`🔁 양도 ${a.xfer}석 · 수령 ${won(a.recv)} · 차익 ${signMoney(a.profit)}`);
  if(t.memo)L.push(`📝 ${t.memo}`);
  return L.join('\n');
}
export function b64ToFile(b64,name){ const bin=atob(b64), a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return new File([a],name,{type:'image/jpeg'}); }
export async function shareTicket(t,{wantTxt=true,wantImg=false,imgB64=null}={}){
  const title=t.name||'티켓', text=ticketText(t);
  const fname=(t.name||'예매내역').replace(/[\\/:*?"<>|]/g,'');
  const dl=(b64,nm)=>{ const a=document.createElement('a'); a.href='data:image/jpeg;base64,'+b64; a.download=nm; a.click(); };
  if(wantImg&&imgB64){
    const f=b64ToFile(imgB64,fname+'.jpg');
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[f]})){ await navigator.share({files:[f],title,text:wantTxt?text:undefined}); return 'shared'; }
    dl(imgB64,fname+'.jpg'); if(wantTxt&&navigator.clipboard)await navigator.clipboard.writeText(text); return 'downloaded';
  }
  if(navigator.share){ await navigator.share({title,text}); return 'shared'; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); return 'copied'; }
  throw new Error('공유 미지원');
}

/* ===== 이미지 ===== */
export function fileToB64(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{ const max=2200; let w=img.naturalWidth,h=img.naturalHeight; const s=Math.min(1,max/Math.max(w,h)); w=Math.round(w*s); h=Math.round(h*s);
      const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(img,0,0,w,h); res(c.toDataURL('image/jpeg',0.92).split(',')[1]); };
    img.onerror=rej;
    const fr=new FileReader(); fr.onload=()=>{img.src=fr.result;}; fr.onerror=rej; fr.readAsDataURL(file);
  });
}
