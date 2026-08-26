# TicketManager 새 GUI — 계획 보고

## Context

**문제**: "앱 정보가 한눈에 안 들어온다." 지난 7월 리디자인(티켓 패스 + 플로팅 독)은 *감성*(절취선·노치·드럼)에 투자했고, *정보 위계*는 못 고침. 코드 진단 결과 원인 6개:

| 원인 | 근거 (`index.html`) |
|---|---|
| 제일 중요한 숫자가 제일 작다 | 통계바 12px(71), 히어로 날짜 11px(211), 좌석 10.5px(235), 상태 9px(564) |
| 타이포 스케일 없음 | 공연명 18px 빼면 전부 10~14px에 몰림 |
| 상태 = "색 빠짐"으로만 | 양도완료 `opacity .48+grayscale`(609), 지난 공연 `opacity .62`(607) |
| D-day가 조연 | 카드 우상단 11px 칩(209). 사용자가 제일 먼저 알고 싶은 "언제" |
| 좌석이 한 문장 | `seatLine()`(1403) → "VIP 1층 A구역 3열 12,13번 · 양도 1" — 등급/열/번 구분 안 됨 |
| 정보 은닉 제스처 | 히어로 캐러셀(1장만 보임) + 월렛 드럼 + 상세 스와이프 = 발견성 낮음 |

**목표**: ticket-bots(KTX 승차권 앱)처럼 "정보가 항상 같은 자리에 같은 크기로" 읽히는 GUI. 상용앱 레퍼런스: 코레일톡/SRT 승차권 카드, 토스 거래내역 타임라인, Apple Wallet 패스, 인터파크 예매상세.

**사용자 결정(확정)**: 바닐라 유지 + 파일 분리(index.html / app.css / app.js / data.js, 빌드 없음) · 기존 기능·UI 구애 없이 자유 · 시안 여러 개 제안 → 사용자 선택 → 구현 · 라이트 기본(다크는 설정).

---

## 1. 진행 순서 (전체)

```
[0] 시안 3안 제작 ──► 사용자 선택 ──► [1] 기계적 파일 분리 ──► [2] data.js 추출
      (디자인 캔버스)                   (동작 동일, 스크린샷 픽셀 비교)   (옛 UI 위에서 검증)
                                                                          │
[5] 정리·문서 ◄── [4] 다크·폴리시 ◄── [3] 새 GUI app.js/app.css (시안대로, 화면 단위 배포) ◄──┘
```

각 단계 단독 배포·검증 가능. [1][2]는 시안 선택과 무관하니 시안 검토 기간에 병행.

---

## 2. [0] 시안 단계 — 디자인 스킬 사용 계획

| 순서 | 스킬 | 용도 |
|---|---|---|
| ① | `ui-ux-pro-max` (`search.py --design-system "ticket wallet event collection mobile PWA"`) | 팔레트·타이포 페어·UX 규칙 검색. 대비 4.5:1, 터치 44px, 배지 색 검증 근거 |
| ② | `frontend-design` | "AI 기본값(크림+세리프+테라코타 / 검정+형광 / 신문 헤어라인)" 회피 규칙, 시안별 시그니처 요소 1개 정하기 |
| ③ | `design` (Claude Design 캔버스 아티팩트) | **시안 3안 × 화면 3종(홈·전체/상세·캘린더) = 아트보드 9장**을 한 캔버스에. 폰에서 열어 비교, 요소 클릭해 직접 수정, PNG 내보내기 가능 |
| ④ | 선택 후 `awesome-design-skills__clean` / `contemporary` | 구현 시 스타일 가이드(간격·표면·모션 절제) |
| ⑤ | 구현 후 `ECC__make-interfaces-feel-better` + `agent-skills__web-design-guidelines` + `ECC__frontend-a11y` | 프레스 상태·모션·접근성 감사 패스 |

시안 픽스처(3안 공통, 실제 데이터 모양): 위키드 8.30 토 19:30 VIP 1층 A구역 3열 12·13번 2매 ₩330,000 NOL(13번 양도 +₩20,000 케이스) / 콘서트 9.02 스탠딩 B 112·113 멜론 / 연극 9.14 R 1층 5열 7번(8번 취소) 티켓링크 / 10.10 양도완료 / 지난 공연 1건 / AI 대기열 2장. 실제 드라큘라 티켓(OP·VIP) 포함.

### 시안 A — "예매앱 카드" (KTX 문법) ★추천
- **주인공**: 카드 한 장 = 공연 한 건. 날짜 17/900 + 색면 배지가 먼저, 공연명 19/800 다음, 하단 점선 아래 `좌석 | 매수 | 가격` 3분할 고정.
- **내비**: 하단 4탭 `홈 / 전체 / 캘린더 / 설정` + 헤더 ＋(캡처 AI / 수기).
- **홈**: eyebrow "다가오는 공연" → h1 "8월" 29/900 + 카운트 pill → 요약 카드(매수·실지출›·양도차익› 3열, gap-as-divider) → AI 대기열 → **다음 공연 카드(큰 밀도)** → 이번 주(작은 밀도) → 이후 3장 → 양도한 표 접힘.
- **전체**: 검색 상시 + 필터 칩 가로스크롤(전체·예정·임박·관람완료·부분취소·양도) + 월 그룹.
- **카드 해부도 (390px)**:
```
┌ p16 ─────────────────────────────────────────┐
│ ▐NOL▌  8.30 토 19:30               ▐ D-3 ▌   │ 예매처 칩 43×28 · 날짜 17/900 · 상태 배지
│ 뮤지컬 〈위키드〉 서울                          │ 19/800 2줄 클램프
│ 샤롯데씨어터 · 동행 지민                        │ 13/600 ink-3 (메모 첫 줄)
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈ 1px dashed ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ 좌석                  │ 매수   │ 가격          │ 라벨 10/700
│ VIP 1층 A구역         │ 2매    │ ₩330,000     │ 값 13/900 tabular
│ 3열 12·13번           │        │ +₩20,000     │ 좌석 2줄 · 양도차익 초록
└──────────────────────────────────────────────┘
```
- **상태 배지 체계**(연배경+진글자, `<small>`로 보조정보): 오늘(accent 채움) / D-3(민트) / D-25(회색) / 관람완료 8.10 / 날짜 미정(노랑) / 취소 1석(아웃라인) / 양도 1석 +₩(핑크) / 양도완료 +₩(앰버, 카드 흐리게 안 함). 배지는 시간 1개 + 거래 0~1개, 2개 초과 금지.
- **토큰**: `--bg #f5f7fa --surface #fff --ink #111827/#4b5563/#8a94a6 --accent #0e7c6b(민트그린) --accent-soft #dcf7f1 --partial #a21caf --warn #b45309`. 타이포 7단(32/29/19/17/15/13/11). radius 24/16/12/6. 그림자 2티어. ease `cubic-bezier(.32,.72,0,1)`.
- **상세** = 바텀시트 92vh: 카드 헤더 → 좌석 표(행마다 상태 배지) → 금액 2×2(매수/가격/수령/차익 `net=recv−price` 이원화 유지) → 메모·사진 → sticky `[수정][공유] ⋯`.
- **수정 폼** = 바텀시트: 예매처 칩 가로스크롤 → 공연명/날짜·시간/매수·가격 → **좌석 행(등급▾ 층 구역 열 번) + 보유|취소|양도 세그먼트**(좌석이 목록에서 사라지지 않음, `editCanceled` 이동 방식 폐기) → 전체 양도 토글 → 메모 → sticky 삭제/저장.

### 시안 B — "벤토 대시보드" (위젯 홈)
- **주인공**: 홈 = 2열 벤토 그리드. NEXT 타일(전폭, 22/800 공연명 + mono 날짜) / 이번 달 타일(½, 주별 미니바) / 실지출 타일(½) / 이번 주 7일 스트립(전폭) / 다가오는 5행(전폭). 순서 고정(정보 은닉 방지).
- 카드 대신 **좌측 3px 스트라이프**(예매처색 / 회색=완료 / 앰버=양도 / 점선=부분양도)로 밀도 높임. 티켓 탭 = 56px 컴팩트 2줄 행(날짜 mono 열 세로 정렬).
- 상세·수정 = 풀페이지 뷰(오버레이 아님). 토큰: 표면 4단 + 잉크 3단 + 폰트 역할 3(CGV 방식), accent 보라 `#6d5df5`.

### 시안 C — "원장 타임라인" (날짜가 주인공)
- **주인공**: 왼쪽 열 큰 날짜 28/800. 홈·전체를 **단일 스크롤 타임라인**으로 통합, sticky "오늘" 마커, 월 경계 헤어라인, 지난 공연 접힘. 카드·그림자·색면 없음, 예매처는 6px 점, 상태는 텍스트(오늘·D-3 오렌지 / 양도 1석 핑크 / 양도완료 앰버). 회계는 **결산 탭**으로 승격(항상 펼쳐진 티켓별 표).
- 내비 3탭 `타임라인 / 캘린더 / 결산` + FAB. 상세·수정 = 바텀시트 라벨/값 표. 웹폰트 1개(JetBrains Mono) 허용.

### 비교
| | A 예매앱 카드 | B 벤토 | C 타임라인 |
|---|---|---|---|
| 1초 가독성 | **상** | 상(홈)/중(목록) | 상(날짜)/중(상태) |
| 정보 밀도 | 중(한 화면 3~4건) | **상** | **상** |
| 구현 난이도 | **하~중** (현 구조와 1:1) | 상 (풀페이지 뷰 2종 신설) | 중 |
| 티켓 감성 | **상** (사용자 지목 레퍼런스 그대로) | 중 | 하~중 |
| 추천 | **1** | 3 | 2 |

추천 A. 목업엔 "A + B의 이번 주 스트립" 변형도 나란히 넣어 고르게 함.

---

## 3. 기술 이행 — 공통 뼈대 (시안 무관)

### 파일 구조
```
index.html   셸: pre-paint 테마 스크립트(인라인 유지, FOUC 방지) · 헤더 · #viewRoot · 하단 내비 · 오버레이 껍데기 13개
app.css      토큰 + 컴포넌트 (색은 :root / [data-theme=dark] 두 벌)
app.js       <script type="module"> 뷰: 스토어 S · render()/patch() · 이벤트 위임 · 오버레이·제스처 인프라
data.js      Supabase·회계·동기화·직렬화·순수 헬퍼 (export 블록 하나 = API 표면)
sw.js        CACHE v19 · ASSETS +3 · ignoreSearch · navigate 전용 index 폴백
```

### data.js — 그대로 옮기는 것 (불변)
`ticketAcct`(1022) · `ticketRecv`(1032) · `parseBlob/rowToTicket/ticketToDB`(1041–1048) · `colorFor`(1017) · `won/money/signMoney`(1018–1020) · `esc/numOrNull/ymd/fmtDate`(1033–1038) · `isNetErr/markDirty/flushDirty`(1053–1090) · `ddayInfo`(1324) · `groupByMonth`(1384) · `hasCancel/hasSeatTransfer/seatLine`(1400–1417) · `normGrade/seatLabel`(1917/1957) · `ticketText/composeInfoCard/fileToB64`(2259/2304/2409) · 상수(980–993). `dataVer` 가드(1103/1107) 그대로.

### data.js — DOM 결합 해제 (새 시그니처)
| 현재 | 새 API |
|---|---|
| `refresh()` 1100 (render 4회) | `fetchTickets()` + `onChange(fn)` 이벤트(`tickets/pendings/mode/loading/toast`) |
| `save()` 2146 (폼 DOM 12곳 읽음) | `saveTicket(data, id?)` — 2152–2165 조립은 app.js `formToData()`, 2167–2187 cloud/local 분기만 data.js |
| `del/bulkDelete` | `deleteTicket(id)` / `deleteTickets(ids)` — confirm은 app.js |
| `filtered()` (#search 읽음) | `filterTickets(list, q)` 순수 |
| `collectSeats/markSeat/restoreCanceled` (DOM=상태) | **폐기** → app.js `S.form.seats[]`에 `x/t/tp/tvia/tto` 플래그. data.js는 `normSeat(s)`만 |
| `aiUpload(e)` | `queueCaptures(files)` → `{ok,fail}` |
| `importData(e)` | `parseBackup(text)` / `importBackup(parsed)` (id dedup 유지) |
| `editImgUpload/deleteTicketImg/viewCurrentImage/detailImg` (3중복) | `setTicketImage(id,file)` / `clearTicketImage(id)` / `fetchTicketImage(id)` |
| 25초 인터벌 2621 | `startSync({paused:()=>bool})` — 재접속 프로브·flushDirty 로직 그대로 |

규칙: data.js 안에 `getElementById`·`confirm`·`toast` 0건. 모든 로컬 변경 지점에 `dataVer++`(현재 6곳 → grep으로 확인).

### app.js — 스토어·렌더·이벤트
- `S = {view, filter, query, calY, calM, selDay, sel, theme, detailId, form}` 단일 객체.
- `patch(id, html)`: 블록별 시그니처 dedup(ARCHITECTURE §3의 `_homeSig/_calSig` 일반화). `innerHTML` 비교 금지 유지. 현 `renderPending`의 `el.innerHTML===html`(1122)은 금지 패턴 → patch로 교체.
- **이벤트 위임** `data-act` / `data-field` / `data-file`. ES module이라 인라인 `onclick` 원천 불가 → `jsAttr` 사용 0건 목표(값은 `data-*`에 `esc()`). `stopPropagation` 패턴 소멸.
- 텍스트 입력은 재렌더 없이 상태만 갱신(포커스 유지). 좌석 구조 변경 때만 `renderSeats()`.
- 오버레이: `openOv/closeOv/popstate/_orphan`(2445–2481) + `initSheetDrag`(2482) **그대로 이식**. `history.back()` 금지 유지. 개선 2개: 중복 push 가드, `DARK_OVS`에서 wallet 제거.
- 제스처: 캘린더 월 스와이프(`initCalSwipe` 2542의 `.cal-grid` 분기), 시트 드래그 닫기, 롱프레스(2524), 이미지 핀치줌(2100) 이식. 뷰 전환 스와이프·캐러셀·드럼·상세 스와이프는 시안 선택에 따라(A/B/C 전부 폐기 제안).
- `applyTheme/resolveTheme/setTheme`(1789) + `color-scheme:only light` + `metaScheme` 동기 유지(안드로이드 강제 다크 반전 방지). theme_color 4곳(pre-paint 스크립트·applyTheme·manifest·meta 초기값) 새 토큰으로 동기.

### 삭제
- CSS: 타일 108–152·157–158·167·568–574(단 153–156, 159–166은 살아있음), 월렛 248–268, 미사용 토큰 13개(`--coral…` 38/534, `--ok`), 미참조 클래스(`icon-btn/pend-actions/grouped/util/sel-mode/mtitle/ldot`).
- JS: 월렛 1477–1562, `initDeckTick`, `dismissPending`(1169), `dayLabel`(1395), `calSX…swInGrid`(2495), `.cal-chip` 참조, `toggleHideXfer`(→필터 칩), 인라인 핸들러 105개 전부.
- HTML: `walletOverlay` 902–917. 오버레이 17 → 13(월렛·사진메뉴·롱프레스액션·색선택 통합).

### sw.js
`CACHE='tm-shell-v19'`, ASSETS에 `app.css/app.js/data.js`, `caches.match(req,{ignoreSearch:true})`, index 폴백은 `req.mode==='navigate'`일 때만(지금은 오프라인에서 JS 요청에 HTML이 돌아와 조용히 깨짐).

---

## 4. 단계별 작업 + 게이트

| 단계 | 작업 | 게이트 |
|---|---|---|
| **0 베이스라인** | 현재 앱 스크린샷 5장(홈·캘린더·전체·상세·폼) scratchpad 보관 | — |
| **1 기계적 분리** | CSS 21–660→app.css, JS 978–2634→app.js(classic, 로직 불변), sw v19, `<link>/<script>` | `node --check app.js`, 스크린샷 픽셀 동일, 오프라인 재로드 OK |
| **2 data.js 추출** | §3 표대로 이동, `window.TM` 노출, 옛 app.js가 `TM.*` 호출 + `onChange`로 render 연결 | `grep -c "getElementById\|confirm(\|toast(" data.js`=0, 회귀(추가/수정/삭제/오프라인) |
| **3 새 GUI** (시안 확정 후) | 3a 셸·토큰·patch·위임·ov·`export` 전환 → 3b 홈+전체 → 3c 캘린더 → 3d 상세 → 3e 폼(좌석 상태화) → 3f 설정/색/동기화/AI대기열/뷰어/공유/산출내역 → 3g 롱프레스·햅틱 | 화면별: `pageerror` 0, 스크린샷, 수동 체크 해당 항목 |
| **4 다크·폴리시** | 다크 토큰 패스, 강제 다크 검증, Escape 닫기, 스켈레톤 | 다크 스크린샷 |
| **5 정리** | 삭제 목록 실행, `jsAttr` 0건 확인, ARCHITECTURE.md(스토어·patch·파일구조·검증 커맨드)·README 갱신, 시안 `design/`에 보관 | 문법 체크·전체 수동 체크리스트 |

---

## 5. 리스크 → 완화
| 리스크 | 완화 |
|---|---|
| 25초 refresh 깜빡임 | 모든 블록 `patch()`; loading은 헤더 점 classList만; 등장 애니 첫 렌더만 |
| dataVer 경쟁 / 오프라인 flush | data.js 내부 보관, `init()`에서 `flushDirty→fetchTickets` 순서 고정 |
| XSS | 텍스트·`data-*` 전부 `esc()`, 인라인 핸들러 0, `colorFor` 반환 hex 검증, 색은 `style="--c:${hex}"` |
| 안드로이드 강제 다크 | `color-scheme:only light` + metaScheme 동기, headless `--enable-features=WebContentsForceDark` 검증 |
| 뒤로가기 앱 종료 | `_orphan` 유지 + 중복 push 가드, 실기기 확인 |
| SW 캐시 | v19 + `?v=` + ignoreSearch + navigate 폴백 |
| Pretendard 미설치(이 PC엔 없음) | 시스템 스택 폴백 + `tabular-nums`; 웹폰트는 선택(4단계) |
| 데스크톱 680px | 콘텐츠 `min(100%,480px)` 중앙 + 시트 480px 통일 |

---

## 6. 검증 레시피
```bash
node --check data.js app.js
node -e '…ARCHITECTURE.md:129 인라인 스크립트 파서…'          # pre-paint 스크립트
grep -c 'dataVer++' data.js; grep -c 'getElementById' data.js; grep -c 'jsAttr(' app.js
python -m http.server 4747                                     # .claude/launch.json과 동일
node -e 'playwright-core(C:/Users/Hong/Desktop/ticket-bots/node_modules) 390×844 isMobile → home/calendar/list/detail/form/dark 스크린샷 + pageerror 수집'
```
headless shell chromium-1234 설치 확인됨. 수동 체크리스트 12항목(추가·수정·부분취소·부분양도·전체양도·삭제 3경로·AI 업로드·오프라인 왕복·뒤로가기·스와이프·테마 3종·PWA 오프라인 셸).

---

## 7. 손대는 파일
- `index.html` — 셸로 축소(분리 원본: CSS 21–660, JS 978–2634, 오버레이 662–977, pre-paint 9–12)
- `app.css`, `app.js`, `data.js` — 신규
- `sw.js` — v19 + ASSETS + 폴백 수정
- `manifest.webmanifest` — theme_color/background_color 새 토큰
- `ARCHITECTURE.md`, `README.md` — 5단계에서 갱신
- `design/` — 시안 HTML 보관(캔버스 아트보드 export)
- 참조(읽기만): `ticket-bots/apps/ktx/dev/webapp/public/app.css`(카드 637–852, 배지 982–1027, 칩 932–966, 헤더 607–636, 내비 549–600), `apps/cgv/public/dashboard/booking-app.css`(토큰 1–38), `docs/mockups/BRIEF.md`

## 8. 승인 후 첫 행동
1. 이 계획을 `docs/superpowers/specs/2026-08-27-ui-redesign-design.md`로 저장·커밋.
2. [0] 시안 캔버스 제작(`ui-ux-pro-max` → `frontend-design` → `design`) → 링크 전달 → 선택 대기.
3. 대기 중 [1][2] 기계적 분리·data.js 추출 진행(시안 무관).
