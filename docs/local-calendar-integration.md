# Android 로컬 캘린더 연동

2026-11-01 · 웹 v50 / Android 1.2 (versionCode 3)

## 사용

설정 → 로컬 캘린더 → 권한 허용하고 연동하기. Android READ_CALENDAR,
WRITE_CALENDAR 런타임 권한을 요청하고 기기에 `티켓함` 로컬 캘린더를 생성한다.
권한 거절 시 연동하지 않으며 설정 화면에서 재시도할 수 있다.

- 보유 좌석이 있는 오늘 이후 공연을 예매 건별로 등록한다. 예매 ID가 일정의 안정적인 식별자다.
- 제목, 공연장, 날짜, 시간, 보유 좌석을 갱신한다. 전석 양도·취소 또는 티켓 삭제 시 연결 일정만 삭제한다.
- 지난 일정은 보존한다. 앱에서 해당 예매를 명시적으로 삭제하거나 전석 양도·취소하면 제거한다.
- 시간 미정은 UTC 자정 기준 종일 일정, 시간이 있으면 Asia/Seoul 기준이다.
- 종료 시각은 선택한 1/2/3/4시간 후의 예상 시각임을 일정 설명에 표시한다.
- 금액, 메모, 양도 상대방은 복사하지 않는다.
- 연동을 끄면 기존 일정은 남는다. 다른 캘린더나 사용자가 직접 만든 일정은 수정하지 않는다.
- 단방향 연동이다. 캘린더에서 직접 수정·삭제한 연결 일정은 다음 연동 때 앱 데이터로 복원될 수 있다.

## 갱신 경로

앱의 저장·수정·삭제 이벤트 → 신뢰된 WebView 메시지 → 직렬 실행기 → Calendar Provider 원자적 배치.
전체 조회를 확인하기 전에는 초기 캐시로 일정을 정리하지 않는다. 오프라인 변경은 변경한 예매만 전달한다.
일정의 CUSTOM_APP_PACKAGE / CUSTOM_APP_URI로 소유권과 예매 ID를 확인하여 중복 삽입을 방지한다.

Supabase `public.tickets`의 `supabase_realtime` publication을 운영 대시보드에서 활성화했다.
WebSocket 응답 `Subscribed to PostgreSQL` / `status: ok`를 확인했다.
앱 실행 중 서버 변경은 Realtime으로 조회하고, 25초 폴링도 복구용으로 유지한다.
앱 사이 Broadcast는 별도 채널을 사용한다.

앱이 닫힌 동안은 WorkManager의 네트워크 연결 조건부 15분 주기 작업으로 갱신한다.
Android 배터리 최적화/Doze에 따라 늦어질 수 있으며, 강제 종료 상태의 즉시 반영을 보장하지 않는다.
종료 상태에서도 즉시 깨우려면 별도 FCM 토큰 등록·서버 푸시 구성이 필요하며 이번 구현에는 포함되지 않았다.
백그라운드 조회는 기본 프로젝트의 공개 키만 사용한다. 미전송 로컬 변경이 있으면 서버 조회로 덮어쓰지 않는다.
조회 오류, 불완전한 페이지, 잘못된 날짜는 기존 일정을 삭제하지 않고 오류 상태로 남긴다.

## 검증

- `node tools/check-calendar.mjs`: 모의 네이티브 브리지, 권한 활성화/해제, 초기 캐시 보호, 로컬 변경/삭제, 개인정보 제외, 예상 시간 변경.
- `node tools/check-management.mjs`, `node tools/check-secondary.mjs`: 기존 관리/결산/보관함 회귀 검사.
- `android/gradlew.bat -p android testDebugUnitTest assembleDebug`: 날짜/시간대/종일/양도/취소/서버 매핑 단위 테스트와 APK 빌드.
- 실제 기기 권한 팝업, Calendar Provider 쓰기, 삼성 캘린더 표시, 백그라운드 실행은 USB 재연결 후 확인 필요.

참고: [Calendar Provider](https://developer.android.com/identity/providers/calendar-provider),
[WorkManager 주기 작업](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work),
[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
