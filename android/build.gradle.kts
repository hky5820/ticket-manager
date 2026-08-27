// 티켓 보관함 안드로이드 래퍼 — 웹앱(hky5820.github.io/ticket-manager)을 WebView 로 감싼 얇은 앱.
// 이유: Chrome 이 만들어 주는 WebAPK 는 targetSdk 33 이라 Android 15+ 에서 edge-to-edge 가 안 되고
// 내비게이션 바가 불투명(밤엔 검정)으로 남는다. 직접 만든 앱은 targetSdk 35 + enableEdgeToEdge 로 바닥까지 그린다.
plugins {
    id("com.android.application") version "8.6.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
