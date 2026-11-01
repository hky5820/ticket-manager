import * as D from './data.js';

let state={supported:!!window.TicketCalendar,enabled:false,permission:false,lastSync:0,count:0,durationMinutes:120};
let fingerprint='';
const changedIds=new Set();
const listeners=[];
export const calendarState=()=>state;
export function calendarLabel(){
  if(!state.supported)return 'Android 앱 업데이트 후 사용';
  if(!state.permission)return '캘린더 권한 필요';
  if(!state.enabled)return '연동 꺼짐';
  if(state.error)return state.error;
  return state.lastSync?`공연 ${state.count}건 · 자동 연동 중`:'티켓을 확인하는 중';
}
export function calendarCommand(type,extra={}){window.TicketCalendar?.postMessage(JSON.stringify({type,...extra}));}
export function syncCalendar(force=false,deleted=[]){
  const st=D.getState();
  if(!state.enabled||!state.permission||(!st.calendarReady&&!st.dataVer))return;
  // Only calendar fields cross into native storage. Money, notes and recipients stay in the app.
  const tickets=st.tickets.filter(t=>st.calendarReady||changedIds.has(String(t.id))).map(t=>({id:String(t.id),name:t.name,vendor:t.vendor,date:t.date,time:t.time,venue:t.venue,qty:t.qty,
    transfer:{done:!!t.transfer?.done},seats:(t.seats||[]).map(s=>({grade:s.grade,floor:s.floor,zone:s.zone,row:s.row,no:s.no,x:!!s.x,t:!!s.t}))}));
  const payload={tickets,allowDelete:st.calendarReady,dirty:D.dirtyCount()>0,source:D.calendarSource(),deleted};
  const next=JSON.stringify(payload);
  if(force||next!==fingerprint){fingerprint=next;calendarCommand('sync',payload);}
}
export function onCalendarChange(fn){listeners.push(fn);}
window.addEventListener('ticket-calendar-status',event=>{
  const before=state;
  state={...state,...event.detail};
  if(!state.enabled||!state.permission)fingerprint='';
  syncCalendar(state.enabled&&(!before.enabled||!before.permission||before.durationMinutes!==state.durationMinutes));
  listeners.forEach(fn=>fn());
});
D.onChange((type,payload)=>{if(type==='tickets'){(payload?.changed||[]).forEach(id=>changedIds.add(String(id)));syncCalendar(false,payload?.deleted||[]);}});
calendarCommand('status');
