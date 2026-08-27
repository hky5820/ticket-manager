// 예매내역 캡처 → 티켓 자동 등록 (Supabase Edge Function, Deno)
// 앱이 pending_uploads 에 캡처를 올린 직후 이 함수를 부르면, Claude 비전으로 필드를 뽑아 tickets 에 넣고 업로드를 done 으로 표시한다.
// 배포:  supabase functions deploy ingest --project-ref ydqabdlwzseommowiupw --no-verify-jwt
// 비밀:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref ydqabdlwzseommowiupw
// 호출:  POST /functions/v1/ingest  body {"ids":["..."]}  (ids 없으면 pending 전부, 최대 5)
// 남는 건(실패·타임아웃) PC 의 ticket-capture-ingest 루틴이 6시간마다 그대로 처리한다.

const BASE = Deno.env.get("SUPABASE_URL")! + "/rest/v1";
const KEY = Deno.env.get("SUPABASE_ANON_KEY")!;                 // 테이블이 anon 전체 CRUD 라 anon 으로 충분
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("INGEST_MODEL") ?? "claude-sonnet-5";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const RECIPE = `You read ONE Korean ticket-booking confirmation screenshot (예매 완료/상세내역) and return ONLY a JSON object — no prose, no code fence.
Fields (use only what is literally shown in THIS image; never guess a title):
- vendor: one of "티켓링크","멜론티켓","NOL 인터파크","YES24","세종문화회관","클립서비스","샤롯데씨어터","LG아트센터", else "기타". (멜론티켓 clue: 결제 예금주명 "멜론티켓".)
- name: the exact show title as printed.
- date: performance date "YYYY-MM-DD" from 관람일/관람일시/공연일시 (NOT 예매일); null if absent.
- time: performance time "HH:MM" 24h; "" if absent.
- qty: integer number of tickets (default 1). "N회" is a session number, not quantity. If partially cancelled (부분취소 / a seat marked 취소완료), qty = seats NOT cancelled.
- price: total paid in won, digits only; null if absent. If partially cancelled, price = total paid minus refunds.
- venue: the venue name (공연장) if shown, else "".
- memo: short extras such as 예매번호; "" if none.
- seats: array of {grade,floor,zone,row,no} strings. [] if none.
  · Cancelled seats stay in the list with "x":true.
  · grade: strip a trailing "석" (VIP석→"VIP", R석→"R"); keep "지정석 P", "스탠딩SR" as is.
  · OP (오피/오케스트라피트): grade "OP" and zone "OP".
  · Split row and number: "7열 15번" → row "7", no "15". floor digits only, zone name only ("B","가","OP"), row only, no only. Never include the units 층/구역/열/번.
  · Standing with entry number only: row "", no "입장번호 333".
Example output: {"vendor":"멜론티켓","name":"뮤지컬 〈엘리자벳〉","date":"2026-09-06","time":"15:00","qty":2,"price":364000,"venue":"블루스퀘어 신한카드홀","memo":"예매번호 T1234","seats":[{"grade":"VIP","floor":"1","zone":"","row":"3","no":"16"},{"grade":"VIP","floor":"1","zone":"","row":"3","no":"17"}]}`;

type Seat = { grade?: string; floor?: string; zone?: string; row?: string; no?: string; x?: boolean };
type Parsed = { vendor?: string; name?: string; date?: string | null; time?: string; qty?: number; price?: number | null; venue?: string; memo?: string; seats?: Seat[] };

const normGrade = (g = "") => { g = g.trim(); return /석$/.test(g) && !/^(지정석|스탠딩)/.test(g) && g.length > 1 ? g.replace(/석$/, "") : g; };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { ...H, ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function recognize(b64: string): Promise<Parsed> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200, system: RECIPE,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64.replace(/^data:[^,]+,/, "") } },
        { type: "text", text: "Extract the ticket fields from this screenshot. Output the JSON object only." },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status} ${await r.text()}`);
  const j = await r.json();
  const text = (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in model output: " + text.slice(0, 120));
  return JSON.parse(m[0]);
}

/* 인터파크 검색 페이지(서버 렌더링)에서 포스터 — tools/posters.py 의 1단계와 같은 규칙의 축약판 */
const norm = (s = "") => s.replace(/[〈〉<>\[\]()（）:：\-–—·,&『』「」]/g, " ").toLowerCase().split(/\s+/).filter((x) => x && !["뮤지컬", "콘서트", "연극", "초연", "내한", "공연", "the", "musical", "한국"].includes(x)).join(" ");
async function poster(name: string, venue: string): Promise<{ img: string; place: string } | null> {
  try {
    const core = norm(name).replace(/\b20\d\d\b/g, "").trim().split(" ")[0] || name;
    const h = await (await fetch("https://tickets.interpark.com/contents/search?keyword=" + encodeURIComponent(core), { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120" } })).text();
    const tn = norm(name), toks = tn.split(" ").filter((x) => x.length > 1);
    let best: { s: number; img: string; place: string } | null = null;
    for (const blk of h.split('data-prd-no="').slice(1)) {
      const nm = blk.match(/data-prd-name="([^"]*)"/), img = blk.match(/src="(https:\/\/ticketimage\.interpark\.com\/[^"]+)"/), place = blk.match(/placeName__\w+">([^<]*)</);
      if (!nm || !img) continue;
      const itn = norm(nm[1]);
      let s = toks.length < 2 ? (toks[0] && itn.startsWith(toks[0]) ? 0.9 : 0) : toks.filter((x) => itn.includes(x)).length / toks.length * 0.9;
      const treg = name.match(/[-–—－]\s*([가-힣]{2,3})\s*$/), ireg = nm[1].match(/[-–—－]\s*([가-힣]{2,3})\s*$/);
      if (treg && ireg && treg[1] !== ireg[1]) s -= 0.3;
      if (!treg && ireg) s -= 0.15;
      for (const g of ["뮤지컬", "콘서트", "연극"]) if (name.includes(g) && !nm[1].includes(g)) s -= 0.5;
      const pl = place ? place[1] : "";
      if (s >= 0.5 && venue && pl && (pl.slice(0, 4).length && (venue.includes(pl.slice(0, 4)) || pl.includes(venue.slice(0, 4))))) s += 0.3;
      if (!best || s > best.s) best = { s, img: img[1], place: pl };
    }
    return best && best.s >= 0.5 ? { img: best.img, place: best.place } : null;
  } catch { return null; }
}

async function processOne(id: string) {
  const rows = await rest(`/pending_uploads?id=eq.${id}&select=id,image_b64,status`);
  const row = rows?.[0];
  if (!row) return { id, error: "not found" };
  const b64: string = row.image_b64 ?? "";
  if (b64.length < 1000) { await rest(`/pending_uploads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "error", result: "empty image" }) }); return { id, error: "empty image" }; }
  let p: Parsed;
  try { p = await recognize(b64); }
  catch (e) { await rest(`/pending_uploads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "error", result: "인식 실패: " + String(e).slice(0, 120) }) }); return { id, error: String(e) }; }
  if (!p.name) { await rest(`/pending_uploads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "error", result: "not a readable ticket" }) }); return { id, error: "no name" }; }
  const seats = (p.seats ?? []).map((s) => { const o: Seat = { grade: normGrade(s.grade ?? ""), floor: s.floor ?? "", zone: s.zone ?? "", row: s.row ?? "", no: s.no ?? "" }; if (s.x) o.x = true; return o; });
  const venue = p.venue ?? "";
  const pst = await poster(p.name, venue);
  const ticket = {
    vendor: p.vendor || "기타", name: p.name, show_date: p.date || null, qty: Math.max(1, Number(p.qty) || seats.filter((s) => !s.x).length || 1),
    price: p.price == null ? null : Number(p.price), memo: p.memo ?? "",
    seats: { seats, time: p.time ?? "", transfer: { done: false }, hasImg: true, poster: pst?.img ?? "", venue: venue || pst?.place || "", perSeat: false },
    img: b64,
  };
  const ins = await rest("/tickets?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(ticket) });
  const ticketId = ins?.[0]?.id;
  await rest(`/pending_uploads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "done", result: "added" }) });
  return { id, ticketId, name: p.name, date: p.date, qty: ticket.qty, price: ticket.price, poster: !!pst };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!ANTHROPIC) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  let ids: string[] = [];
  try { const body = await req.json(); if (Array.isArray(body?.ids)) ids = body.ids; } catch { /* no body */ }
  if (!ids.length) ids = ((await rest("/pending_uploads?status=eq.pending&select=id&order=created_at.asc&limit=5")) as { id: string }[]).map((r) => r.id);
  const results = [];
  for (const id of ids) results.push(await processOne(id));   // 순차: 이미지 섞임 방지 + 메모리
  return new Response(JSON.stringify({ results }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
