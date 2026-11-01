# Android 로컬 캘린더 연동 검토

2026-11-01. 구현안이며 아직 캘린더에 일정을 쓰거나 권한을 요청하지 않는다.

## 권장: 티켓함 전용 로컬 캘린더, 단방향 동기화

현재 앱은 `MainActivity.kt`의 WebView로 웹앱을 표시한다. Android의
Calendar Provider를 이용하면 기기 캘린더 저장소에 `티켓함` 캘린더를 만들 수 있다.
`CalendarContract.ACCOUNT_TYPE_LOCAL`을 사용하면 Google 계정 없이도 저장 가능하다.
캘린더 생성은 공식 문서의 sync-adapter URI 경로와 필수 계정·소유자 필드를 사용한다.
삼성 캘린더 등 기기 캘린더를 읽는 앱에서 표시할 수 있다. 실제 삼성 캘린더의
캘린더 목록 노출·알림·색상은 해당 폰에서 검증해야 한다.

- 설정에 `캘린더 연동` 스위치, `지금 동기화`, 최근 성공 시각·대상 건수 표시.
- 사용자가 켜는 시점에 `READ_CALENDAR`, `WRITE_CALENDAR` 런타임 권한 요청.
- 앱이 만든 캘린더 ID와 이벤트 ID만 관리한다. 다른 개인 캘린더는 변경하지 않는다.
- 방향은 티켓함 → 캘린더. 캘린더에서 바꾼 내용은 티켓 원본으로 역반영하지 않는다.
- 최초 범위는 날짜가 있는 예정 티켓 중 `ticketAcct(t).kept > 0`인 건.
- 전량 취소·전량 양도·삭제는 앱이 만든 해당 일정만 제거한다. 부분 양도는 잔여 좌석 갱신.
- 시간이 없으면 종일 일정으로 내보내고, 날짜도 없으면 제외 사유를 표시한다.
- 종료 시간 데이터는 현재 없다. 실제 공연 종료로 추정해서 저장하지 않는다.
  사용자에게 기본 소요 시간(예: 2시간, 추정)을 설정하게 하거나 개별 지정 UI를 추가한다.
- 시간대는 `Asia/Seoul`. 종일 일정은 Android Calendar Provider의 UTC 자정 및
  배타적 종료 날짜 규칙에 맞춘다.
- 제목·공연장·잔여 좌석·예매처를 전달한다. 가격·개인 메모·양도 상대 정보는 기본 제외.
- 동일 공연/같은 회차를 여러 예매처에서 보유한 경우 한 일정에 좌석을 모으는 방식 권장.
  제목 문자열만으로 합치지 않고 공연 식별자·일시·장소를 비교하며, 불확실하면 합치지 않는다.

## 중복·변경 처리

이벤트에 대응하는 내부 식별자와 티켓 ID 목록을 별도 저장한다. 일정 날짜가 바뀌어도
기존 티켓 ID로 같은 이벤트를 찾아 수정하므로 중복 삽입하지 않는다. 회차 묶음이
분리되거나 합쳐지는 경우에도 이전 매핑과 겹치는 티켓 ID를 비교한다.

동기화는 직렬 처리하고 `ContentProviderOperation` 배치와 재시도용 작업 기록을 둔다.
이벤트 등록 후 매핑 저장 전에 앱이 종료되어도, 전용 캘린더 안의 관리 식별자로
기존 이벤트를 찾아 중복을 방지해야 한다. 식별자 저장 필드는 Provider 지원 범위를
확인하며, sync-adapter 전용 필드를 일반 앱 쓰기로 사용할 수 있다고 가정하지 않는다.

서버 조회 실패·권한 취소·부분 응답을 빈 티켓 목록으로 처리해 일정을 삭제하면 안 된다.
성공한 완전한 스냅샷 및 확인된 삭제만 반영한다. 사용자가 캘린더에서 직접 삭제한
일정은 제외 목록으로 존중하고, 명시적 재동기화 때 복구 여부를 선택하게 한다.

## 갱신 시점과 Android 변경

첫 단계는 앱 실행/복귀, 티켓 저장·양도·취소 이후, `지금 동기화`에서 실행한다.
현재 25초 갱신은 웹앱이 실행 중일 때만 돌아가므로 백그라운드 연동을 보장하지 않는다.

백그라운드까지 원하면 WorkManager와 네이티브 데이터 조회 계층이 추가로 필요하다.
주기 작업 최소 간격은 15분이며 실행 시각은 배터리·네트워크·OS 정책에 따라 늦어질 수 있다.
앱이 닫힌 상태에서 다른 기기의 수정까지 즉시 반영된다고 표시하면 안 된다.

WebView → Android 전달은 허용된 HTTPS 출처와 메인 프레임만 받는
`WebViewCompat.addWebMessageListener` 등으로 제한한다. 웹의 임의 calendar/event ID를
신뢰하지 않고 네이티브가 소유한 매핑만 사용한다. 이전 APK에는 연결 UI를 숨기고,
지원 버전에서만 연동 설정을 제공한다.

필요 파일: Android manifest 권한, `MainActivity.kt` 메시지 연결,
새 `CalendarSyncManager.kt` 및 매핑 저장소, 웹 설정 UI 및 동기화 payload 생성기.

## 대안

| 방식 | 권한 | 동작 | 제한 |
|---|---|---|---|
| `ACTION_INSERT` | 직접 캘린더 읽기/쓰기 권한 불필요 | 티켓 상세에서 캘린더 작성 화면을 열고 사용자가 저장 | 1건씩, 취소·변경 자동 반영 불가 |
| 전용 로컬 캘린더 | 읽기/쓰기 권한 필요 | 여러 일정 추가·변경·삭제 자동 반영 | Android 구현 및 기기 검증 필요, 다른 기기로 자체 동기화되지 않음 |
| `.ics` 파일 내보내기 | Android 캘린더 권한 불필요 | 앱/PC에서 파일 가져오기 | 재가져오기 중복 여부는 대상 앱 의존, 자동 연동 아님 |

권장 순서: 전용 로컬 캘린더 + 앱 실행 시 동기화 → 실기기 반복/취소/권한 테스트 →
필요하면 백그라운드 갱신. 파일 내보내기는 보조 수단으로 둔다.

## 공식 근거

- [Calendar Provider와 권한·일정 Intent](https://developer.android.com/identity/providers/calendar-provider)
- [로컬 캘린더 생성 필드와 ACCOUNT_TYPE_LOCAL](https://developer.android.com/reference/android/provider/CalendarContract.Calendars)
- [출처를 제한하는 WebView 메시지 연결](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [WorkManager 주기 작업 제한](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)

검증 범위: 코드 구조·공식 API 문서 확인. 로컬 캘린더 생성, Samsung Calendar 표시,
권한 거부, 재설치, 삭제/재시도 시 중복 방지, 실제 알림은 아직 미구현·미검증.
