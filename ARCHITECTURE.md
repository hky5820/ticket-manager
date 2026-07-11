# ARCHITECTURE.md — 내부 구조 메모

`index.html` 단일 파일 앱의 **비직관적인 핵심 설계**만 정리한 개발자용 문서.
(사용법·배포는 [README.md](README.md), Supabase 스키마는 자동 메모리 참고.)

전역 상태: `tickets[]`(현재 티켓), `view`(calendar|tile|list), `calY/calM`(캘린더 표시 연/월),
`mode`(cloud|local), `editingId/editCanceled/formVendor/formPlatform`(모달 편집 상태).
거의 모든 UI 갱신은 `render()` 한 곳을 거친다(스탯·pending·select바·다가오는공연 + `#viewRoot`).

---

## 1. 좌석·양도 데이터 모델

DB `tickets` 행은 컬럼을 못 늘려서(대시보드 세션 만료) **`seats` jsonb 하나에 전부 패킹**한다.
`parseBlob`/`rowToTicket`/`ticketToDB`가 앱 shape ↔ DB blob을 변환한다.

```
seats(jsonb) = {
  seats: [ { grade, floor, zone, row, no,   // 좌석 식별
             x:true?,                        // 취소된 좌석
             t:true?, tp, tto, tvia } ... ], // 양도된 좌석 + 수령액/대상/경로
  time: "HH:MM",
  transfer: { done, price, to, platform },   // 티켓 '전체' 양도(양도완료)
  hasImg: bool
}
```
- 구버전 행은 `seats`가 그냥 배열일 수 있어 `parseBlob()`이 양쪽을 처리한다.
- 좌석 단위 상태 플래그: **`s.x` = 취소**, **`s.t` = 부분(표단위) 양도**, `s.tp` = 그 좌석 양도 수령액.
- **전체 양도**는 좌석이 아니라 `transfer.done=true` + `transfer.price`로 표현.
- 앱 shape의 `date`는 DB `show_date`로 매핑. 새 필드는 이 blob에 더 넣으면 DB 안 건드려도 됨.

## 2. 회계 모델 (상단 통계바) — `ticketAcct(t)`

좌석 단가 `unit = price / qty`(qty로 나눔). 티켓 단위 집계는 전부 `ticketAcct`가 계산.

| 항목 | 정의 | 비고 |
|------|------|------|
| **매수** | `qty − 취소석` | 취소만 제외, **양도석은 포함**(샀던 표라서) |
| **실지출** | `보유석 × unit`, 보유석 = `qty − 취소 − 양도` | **취소도 양도도 아닌 '실제 관람' 좌석 원가만**. 양도 관련 금액은 여기 절대 안 들어감 |
| **양도차익** | `양도수령 − 양도석 × unit` | +면 이득, −면 손해. `signMoney()`로 부호 표시 |

- 취소석은 환불로 보고 **어디에도 안 들어간다**(매수에서만 빠짐).
- 전체 양도(`transfer.done`)는 "취소 뺀 나머지 전부를 `transfer.price`에 양도"로 계산.
- `money()`=음수는 `−₩`, `signMoney()`=`+₩/−₩`. 표시 직전 `Math.round`.
- 실지출·양도차익은 **탭 가능한 pill(`.bd-link`, `›` 셰브론)** → `openBreakdown(kind)`가
  티켓별 산출 내역 팝업을 띄운다. 실지출 상세는 "관람 N석 × 단가", 관람 0석 티켓은 제외.

> ⚠️ 이 정의는 여러 번 바뀌었다. **실지출은 '내가 공연 보러 가서 쓰는 돈'**이라는 사용자 의도가 기준.
> 양도 수령액을 실지출에서 빼던 이전 버전은 폐기됨.

## 3. 렌더 dedup — 깜빡임 방지 (중요 함정)

`render()`는 25초 자동새로고침·뷰 전환 등으로 자주 불린다. 무한 CSS 애니메이션이 있는
블록을 매번 `innerHTML=`로 다시 그리면 **애니메이션이 리셋되며 깜빡인다.**

- **절대 `el.innerHTML === 생성한html`로 비교하지 말 것.** 브라우저가 `innerHTML`을 재직렬화
  (`#hex`→`rgb()`, `220ms` 정규화, inline style 변형)해서 원본 문자열과 **절대 안 맞는다.**
  → 캘린더가 이것 때문에 일정 있는 달마다 매번 재렌더됐었음.
- 해결: **생성한 html 문자열을 JS 변수에 저장해 그걸로 비교**한다.
  - `_upSig` = 다가오는 공연, `_calSig` = 캘린더.
- 다가오는 공연은 뷰마다 HTML이 동일해야 뷰 전환 시 재렌더 안 됨 → 캘린더 전용 `in-cal`
  클래스(등장 애니메이션)를 **제거**함. (뷰 전환 때 upnext가 리프레시되던 버그의 원인이었음)
- 등장 애니메이션은 "이전에 비어있다 → 카드 생김"일 때만(`.no-anim` 클래스로 최초 로드 억제).

## 4. 뷰 전환 · 캘린더 월 이동 스와이프 — `initCalSwipe()`

손가락을 **실시간으로 따라 움직이는** 인터랙티브 드래그(아이폰 페이지 전환 느낌).
`#viewRoot`에 touch 리스너, `#upnext`는 `#viewRoot` 밖이라 안 잡힘(가로 스크롤 유지).

동작 분기(첫 가로 이동에서 결정):
- **`.cal-grid` 안 + 캘린더 뷰** → 월 이동. 인접 달을 `calHTMLFor(y,m)`로 렌더한 pane 슬라이드.
- **그 외 영역·타일·리스트** → 뷰 전환. 인입 뷰를 `viewHTML(v)`로 렌더한 pane 슬라이드.
- **양끝(더 갈 뷰 없음)** → 고무줄 저항.

`viewHTML(v)` / `calHTMLFor(y,m)`는 **전역 `view`/`calY/calM`을 안 바꾸고** 임의 뷰·달의
`#viewRoot` HTML만 만든다(pane 렌더용). pane은 `.view-pane`(현재 뷰 위 절대배치, `±W`에서 시작).

릴리즈 시 `|dx| > W * passRatio`면 확정, 아니면 되돌림. **kind별 튜닝 값**:

| | 릴리즈 이징 (`settleEase`) | 확정 임계 (`passRatio`) |
|---|---|---|
| 뷰 전환 | `.2s cubic-bezier(.2,.8,.2,1)` (빠릿) | `0.22` |
| 월 이동 | `.36s cubic-bezier(.3,.1,.3,1)` (부드럽게 안착) | `0.14` (더 민감) |

**끊김(jank) 방지 3종** (드래그 동안 `body.swiping`):
1. `body.swiping *{animation-play-state:paused}` → 셀 리플·다가오는공연 광택 등 무한
   애니메이션 정지(프레임당 리페인트 제거, 끊김의 주원인).
2. `translate3d(x,0,0)` → GPU 합성 레이어.
3. 스와이프 동안만 `will-change:transform` 승격(평소 메모리 절약).

세그먼트 버튼 탭(setView)은 인터랙티브 대신 `animateViewSwitch(dir)`의 비인터랙티브 슬라이드.
`_viewAnim` 플래그로 애니메이션 중 스와이프 진입 차단.

## 5. 오버레이/팝업 — `openOv/closeOv`

- 두 종류: **바텀시트**(기본, 아래서 올라옴) / **중앙 팝업**(`.overlay.centered`, 진짜 팝업).
  캘린더 날짜 팝업(`dayOverlay`)·금액상세(`breakdownOverlay`)는 centered. centered는 시트
  드래그(아래로 내려 닫기) 대상에서 제외.
- `_ovStack` + `history.pushState`/`history.back()`로 **뒤로가기 버튼 = 최상단 팝업 닫기**.
  `_ignorePop` 플래그로 우리가 유발한 `history.back`의 popstate는 무시.
- **목록성 팝업(날짜·금액상세)에서 아이템 클릭 → `edit()`가 그 팝업을 먼저 닫는다**
  (`edit` 진입 시 `closeOv('dayOverlay'); closeOv('breakdownOverlay')`). 안 닫히던 버그 수정본.

## 6. 동기화 · 경쟁 방지

- 부팅: 항상 Supabase 연결 시도 → `mode='cloud'` → `refresh()`. 실패 시 localStorage 폴백.
- 25초마다 `refresh()`(오버레이 열려있거나 탭 숨김이면 스킵).
- **경쟁 가드 `dataVer`**: 로컬 변경(저장/삭제/복제/import)마다 `dataVer++`. `refresh()`는
  SELECT 시작 시점의 `dataVer`를 기억했다가, 응답 도착 시 값이 바뀌었으면 **오래된 스냅샷으로
  덮어쓰지 않고 스킵**한다(느린 새로고침이 방금 저장한 걸 되돌리던 버그 방지).
- 백업 import: 클라우드/로컬 **둘 다 id 기준 dedup**(같은 백업 재import 시 중복 방지).
- 로컬 저장도 qty/price를 `numOrNull`로 숫자화(클라우드와 타입 일치).

## 7. 보안 (XSS)

- 텍스트는 `esc()`.
- **`onclick="f('...')"`처럼 'HTML 속성 안 JS 문자열'에 값을 넣을 땐 반드시 `jsAttr()`**.
  `esc(v).replace(/'/)`는 `esc`가 먼저 `'`를 `&#39;`로 바꿔 replace가 무효 → 예매처/양도처/등급
  이름에 `'`나 페이로드 넣으면 저장형 XSS였음. `jsAttr`은 JS 이스케이프 후 속성용 HTML 인코딩.

---

## 작업 시 체크리스트
- 애니메이션 있는 블록을 다시 그릴 때 → **시그니처 변수 dedup** 썼는가? `innerHTML` 비교 금지.
- `onclick`에 사용자 값 interpolate → **`jsAttr()`** 썼는가?
- 통계/금액 관련 → `ticketAcct` 한 곳만 고치면 스탯·상세팝업 동시 반영.
- 로컬에서 `tickets` 바꾸는 코드 추가 → `dataVer++` 넣었는가?
- 인라인 스크립트 문법 검증:
  ```bash
  node -e 'const h=require("fs").readFileSync("index.html","utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0;while((m=re.exec(h))){i++;try{new Function(m[1])}catch(e){console.log("ERR#"+i,e.message)}}console.log(i+" scripts checked")'
  ```
