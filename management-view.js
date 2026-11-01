/* Presentation only. Ticket accounting and persistence remain in data.js. */
import {esc,ticketAcct,isPast,fmtDate,seatLabel,dday,ymd} from './data.js';
export function matchesStatus(t,status){
  const a=ticketAcct(t);
  if(status==='held')return a.kept>0&&!isPast(t);
  if(status==='past')return a.kept>0&&isPast(t);
  if(status==='transfer')return a.xfer>0;
  if(status==='cancel')return a.canceled>0;
  return true;
}
import {posterFor} from './poster-catalog.js';
const icon=name=>`<img class="mg-icon" src="assets/ui/${name}.svg" alt="">`;
function seatSummary(t){return (t.seats||[]).filter(s=>!s.x&&!s.t).map(seatLabel).filter(Boolean).join(' · ')||'좌석 정보 미입력';}
function row(t,selected,featured=false){
  const poster=posterFor(t);
  const a=ticketAcct(t),bits=[];
  if(a.kept)bits.push(`${isPast(t)?'지난 공연':'보유'} ${a.kept}매`);
  if(a.xfer)bits.push(`양도 ${a.xfer}매`);
  if(a.canceled)bits.push(`취소 ${a.canceled}매`);
  return `<button type="button" class="res mg-ticket${featured?' mg-featured':''}${selected.has(String(t.id))?' sel':''}" data-id="${esc(t.id)}">${featured?`<div class="mg-next-label"><span>가장 가까운 공연</span><b>${esc(dday(t.date))}</b></div>`:''}<div class="mg-ticket-main">${poster?`<img class="mg-poster" src="${esc(poster)}" alt="${esc(t.name)} 포스터" loading="${featured?'eager':'lazy'}" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<span class="mg-mark"${poster?' hidden':''}>${icon('ticket')}</span><div class="mg-copy"><span class="mg-provider">${esc(t.vendor||'예매처 미지정')}</span><h3>${esc(t.name||'공연명 미입력')}</h3><p>${featured?esc(fmtDate(t.date,''))+' · ':''}${esc(t.time||'시간 미정')}${t.venue?' · '+esc(t.venue):''}</p></div></div><div class="mg-ticket-foot"><span title="${esc(seatSummary(t))}">${esc(seatSummary(t))}</span><b>${esc(bits.join(' · ')||'매수 미입력')}</b></div></button>`;
}
export function renderManager(tickets,state,selected=new Set()){
  const {vendor,status,view,month,day}=state;
  const scoped=tickets.filter(t=>!vendor||t.vendor===vendor);
  const filtered=scoped.filter(t=>matchesStatus(t,status));
  const statusNames={held:'보유',past:'지난 공연',transfer:'양도',cancel:'취소',all:'전체'};
  const title='내 티켓';
  const next=view==='list'&&status==='held'?filtered.filter(t=>t.date&&(t.date>ymd(new Date())||!t.time||new Date(t.date+'T'+t.time)>=new Date())).sort((a,b)=>(a.date+(a.time||'23:59')).localeCompare(b.date+(b.time||'23:59')))[0]:null;
  let html=`<div class="mg-heading"><div><p class="mg-kicker">공연 일정과 보유 좌석</p><h1>${esc(title)}</h1></div><div class="mg-view" aria-label="보기 방식"><button data-mg-view="list" aria-label="목록 보기" aria-pressed="${view==='list'}">${icon('ticket')}</button><button data-mg-view="calendar" aria-label="달력 보기" aria-pressed="${view==='calendar'}">${icon('calendar-days')}</button></div></div>${next?`<section class="mg-next">${row(next,selected,true)}</section>`:''}<div class="mg-filter"><button type="button" class="mg-vendor" data-mg-vendor aria-haspopup="dialog" aria-expanded="false" aria-controls="sub"><span>${esc(vendor||'모든 예매처')}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><span>${filtered.length}건</span></div><div class="mg-status" aria-label="티켓 상태">${Object.entries(statusNames).map(([key,label])=>`<button data-mg-status="${key}" aria-pressed="${key===status}">${label} <small>${scoped.filter(t=>matchesStatus(t,key)).length}</small></button>`).join('')}</div>`;
  let shown=filtered.filter(t=>t!==next);
  if(view==='calendar'){
    const [y,m]=month.split('-').map(Number),offset=new Date(y,m-1,1).getDay(),count=new Date(y,m,0).getDate();
    const dated=filtered.filter(t=>(t.date||'').startsWith(month));
    html+=`<div class="mg-month"><button data-mg-month="-1" aria-label="이전 달">‹</button><h2>${y}년 ${m}월</h2><button data-mg-month="1" aria-label="다음 달">›</button></div><div class="mg-calendar">${['일','월','화','수','목','금','토'].map(w=>`<span class="mg-weekday">${w}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{const d=`${month}-${String(i+1).padStart(2,'0')}`,n=dated.filter(t=>t.date===d).length;return `<button data-mg-day="${d}" aria-label="${m}월 ${i+1}일 ${n}건" aria-pressed="${day===d}" class="${n?'has':''}${d===ymd(new Date())?' today':''}">${i+1}${n?`<small>${n}건</small>`:''}</button>`;}).join('')}</div><button class="mg-reset-day" data-mg-day="">이 달 전체 보기</button>`;
    shown=dated.filter(t=>!day||t.date===day);
    const undated=filtered.filter(t=>!t.date).length;
    if(undated)html+=`<p class="mg-hint">날짜 미정 ${undated}건은 목록에서 확인하세요.</p>`;
  }
  const groups=new Map();shown.forEach(t=>{const d=t.date||'';if(!groups.has(d))groups.set(d,[]);groups.get(d).push(t)});
  html+=shown.length?[...groups].map(([date,items])=>`<section class="mg-date-group"><h2>${date?esc(fmtDate(date,'')):'날짜 미정'}${date&&!isPast(items[0])?`<span>${esc(dday(date))}</span>`:''}</h2>${items.map(t=>row(t,selected)).join('')}</section>`).join(''):next?'':`<div class="empty"><b>${tickets.length?'이 조건에 맞는 티켓이 없어요':'첫 티켓을 추가해보세요'}</b><span>${tickets.length?'예매처나 상태를 바꾸면 다른 내역을 볼 수 있어요.':'예매 캡처를 올리거나 직접 입력할 수 있어요.'}</span></div>`;
  return html+`<button type="button" class="mg-add" data-mg-add>${icon('scan-line')}예매 캡처 · 티켓 추가</button>`;
}
