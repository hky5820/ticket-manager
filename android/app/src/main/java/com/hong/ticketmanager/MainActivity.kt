package com.hong.ticketmanager

import android.annotation.SuppressLint
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import android.provider.CalendarContract
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** 웹앱을 바닥까지 그리는 얇은 껍데기. 상태 바·내비 바는 투명, 그 밑은 창 배경(흰색)이라 경계가 없다. */
class MainActivity : ComponentActivity() {
    private val calendar by lazy { CalendarSyncManager(applicationContext) }
    private val calendarPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (calendar.hasPermission()) calendar.enable() else calendar.recordError("캘린더 권한을 허용해야 연동할 수 있어요")
        calendarStatus()
    }
    private fun trusted() = ::web.isInitialized && web.url?.let { val u = Uri.parse(it); u.scheme == "https" && u.host == HOST && u.path?.startsWith("/ticket-manager/") == true } == true
    private fun calendarStatus() {
        if (trusted()) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ticket-calendar-status',{detail:${calendar.status()}}));", null)
    }
    override fun onStart() { super.onStart(); CalendarSyncManager.foreground = true }
    override fun onStop() { CalendarSyncManager.foreground = false; super.onStop() }
    override fun onResume() { super.onResume(); calendarStatus() }
    private lateinit var web: WebView
    private var safeTop = 0
    private var safeBottom = 0
    private var safeLeft = 0
    private var safeRight = 0
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val data = result.data
        val uris: Array<Uri>? = when {
            result.resultCode != RESULT_OK || data == null -> null
            data.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        cb.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        // Keep the WebView full-screen; CSS applies safe insets to controls only.
        val root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        web = WebView(this)
        web.setBackgroundColor(Color.WHITE)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            safeTop = bars.top
            safeBottom = if (insets.isVisible(WindowInsetsCompat.Type.ime())) 0 else bars.bottom
            safeLeft = bars.left
            safeRight = bars.right
            v.setPadding(0, 0, 0, ime.bottom)
            applySafeInsets()
            WindowInsetsCompat.CONSUMED
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString TicketManagerApp/1.2"
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "TicketCalendar", setOf("https://$HOST")) { _, message, _, mainFrame, _ ->
                if (mainFrame && trusted()) runCatching {
                    val payload = JSONObject(message.data ?: "{}")
                    when (payload.optString("type")) {
                        "status" -> calendarStatus()
                        "enable" -> if (calendar.hasPermission()) { calendar.enable(); calendarStatus() }
                            else calendarPermission.launch(CalendarSyncManager.permissions)
                        "open" -> runCatching { startActivity(Intent(Intent.ACTION_VIEW, CalendarContract.CONTENT_URI.buildUpon().appendPath("time").appendPath(System.currentTimeMillis().toString()).build())) }
                        "sync", "disable", "duration" -> CalendarSyncManager.executor.execute {
                            runCatching {
                                when (payload.getString("type")) {
                                    "sync" -> calendar.accept(payload)
                                    "disable" -> calendar.disable()
                                    "duration" -> calendar.duration(payload.getInt("minutes"))
                                }
                            }.onFailure { calendar.recordError(it.message ?: "연동 실패") }
                            runOnUiThread { if (!isDestroyed) calendarStatus() }
                        }
                    }
                }.onFailure { calendar.recordError("캘린더 요청을 처리하지 못했습니다"); calendarStatus() }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                applySafeInsets()
                calendarStatus()
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = params.createIntent().apply {
                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                runCatching { pickFiles.launch(intent) }.onFailure { fileCallback = null; callback.onReceiveValue(null) }
                return true
            }
        }

        // 뒤로가기: 웹앱이 시트를 history 로 관리하므로 goBack 이 곧 시트 닫기. 더 갈 데 없으면 앱 종료
        onBackPressedDispatcher.addCallback(this) {
            if (web.canGoBack()) web.goBack() else finish()
        }

        if (savedInstanceState == null) web.loadUrl(START_URL) else web.restoreState(savedInstanceState)
    }

    private fun applySafeInsets() {
        if (!::web.isInitialized) return
        val density = resources.displayMetrics.density
        web.evaluateJavascript("""
            (() => {
                const root = document.documentElement;
                root.classList.add('tm-native');
                root.style.setProperty('--native-safe-top', '${safeTop / density}px');
                root.style.setProperty('--native-safe-bottom', '${safeBottom / density}px');
                root.style.setProperty('--native-safe-left', '${safeLeft / density}px');
                root.style.setProperty('--native-safe-right', '${safeRight / density}px');
            })();
        """.trimIndent(), null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val HOST = "hky5820.github.io"
        const val START_URL = "https://hky5820.github.io/ticket-manager/"
    }
}
