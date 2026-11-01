package io.github.maiakitty.jellyshelf

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/**
 * Jellyshelf in an app: the web app full screen in a WebView, pointed at your own server. First start (and the
 * launcher shortcut "Change server") asks for the server's address. Videos go full screen, links to other sites open
 * in the browser, and Back goes back a page.
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private var web: WebView? = null
    private var overlay: View? = null
    private var fullscreen: View? = null
    private var fullscreenDone: WebChromeClient.CustomViewCallback? = null
    private val prefs by lazy { getSharedPreferences("jellyshelf", MODE_PRIVATE) }
    private val server get() = prefs.getString(KEY_SERVER, null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        // Android 15+ draws apps under the status and navigation bars: keep the page out from under them (and above
        // the keyboard), except for a full-screen video.
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
            if (fullscreen == null) v.setPadding(bars.left, bars.top, bars.right, bars.bottom) else v.setPadding(0, 0, 0, 0)
            insets
        }
        setContentView(root)
        window.decorView.setBackgroundColor(BG)

        val url = server
        if (url == null || intent?.action == ACTION_CHANGE_SERVER) showSetup(url) else openWeb(url, savedInstanceState)

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_CHANGE_SERVER) showSetup(server)
    }

    @Deprecated("Android 12 and older; 13+ uses the OnBackInvokedCallback above")
    override fun onBackPressed() = back()

    private fun back() {
        when {
            fullscreen != null -> web?.webChromeClient?.onHideCustomView()
            overlay != null && web != null -> hideOverlay()
            web?.canGoBack() == true -> web!!.goBack()
            else -> finish()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web?.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        // Keep the login cookie even if Android kills the app in the background.
        CookieManager.getInstance().flush()
        web?.onPause()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onDestroy() {
        web?.destroy()
        super.onDestroy()
    }

    // ---------- the web app ----------

    private fun openWeb(url: String, state: Bundle? = null) {
        hideOverlay()
        web?.let { root.removeView(it); it.destroy() }
        CookieManager.getInstance().setAcceptCookie(true)
        val w = WebView(this)
        web = w
        w.setBackgroundColor(BG)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The player starts the video itself after you pick an episode.
            mediaPlaybackRequiresUserGesture = false
            builtInZoomControls = false
            // Lets the web app tell it's running in the app.
            userAgentString = "$userAgentString JellyshelfAndroid/${packageManager.getPackageInfo(packageName, 0).versionName}"
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme != "http" && uri.scheme != "https") return openOutside(uri)
                // Your server stays in the app, and so does AniList's login (it comes back to your server after).
                if (sameServer(uri) || isAniListLogin(uri)) return false
                return openOutside(uri)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError("Can't reach Jellyshelf at ${server}.\n${error.description}")
            }

            override fun onPageFinished(view: WebView, url: String) {
                CookieManager.getInstance().flush()
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreen != null) return callback.onCustomViewHidden()
                fullscreen = view
                fullscreenDone = callback
                root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
                window.insetsController?.apply {
                    hide(WindowInsets.Type.systemBars())
                    systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
                root.requestApplyInsets()
            }

            override fun onHideCustomView() {
                val view = fullscreen ?: return
                root.removeView(view)
                fullscreen = null
                fullscreenDone?.onCustomViewHidden()
                fullscreenDone = null
                window.insetsController?.show(WindowInsets.Type.systemBars())
                root.requestApplyInsets()
            }
        }
        root.addView(w, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        if (state == null || w.restoreState(state) == null) w.loadUrl(url)
    }

    private fun sameServer(uri: Uri): Boolean {
        val base = Uri.parse(server ?: return false)
        return uri.host == base.host && uri.port == base.port
    }

    private fun isAniListLogin(uri: Uri) = uri.host == "anilist.co" && uri.path.orEmpty().startsWith("/api/v2/oauth")

    private fun openOutside(uri: Uri): Boolean {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
        }
        return true
    }

    // ---------- setup and errors (drawn in code: two small screens don't need layouts) ----------

    private fun showSetup(current: String?) {
        val input = EditText(this).apply {
            setText(current ?: "")
            hint = "http://192.168.1.10:8101"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setSingleLine()
            setTextColor(FG)
            setHintTextColor(MUTED)
        }
        val problem = text("", 14f, BAD)
        val connect = {
            val url = normalise(input.text.toString())
            if (url == null) {
                problem.text = "That isn't a web address. Something like http://192.168.1.10:8101"
            } else {
                prefs.edit().putString(KEY_SERVER, url).apply()
                openWeb(url)
            }
        }
        input.setOnEditorActionListener { _, action, _ -> (action == EditorInfo.IME_ACTION_GO).also { if (it) connect() } }
        val cancel = if (current != null && web != null) button("Cancel", primary = false) { hideOverlay() } else null
        showOverlay(
            text("Jellyshelf", 28f, FG),
            text("Your Jellyshelf server's address, the one you open it at in a browser.", 15f, MUTED),
            input,
            problem,
            button("Connect") { connect() },
            cancel,
        )
        input.requestFocus()
    }

    private fun showError(message: String) {
        showOverlay(
            text("Can't connect", 24f, FG),
            text(message, 15f, MUTED),
            button("Try again") { server?.let { openWeb(it) } },
            button("Change server", primary = false) { showSetup(server) },
        )
    }

    private fun showOverlay(vararg views: View?) {
        hideOverlay()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(BG)
            val pad = dp(28)
            setPadding(pad, pad, pad, pad)
            // Swallow taps so the page under it can't be used.
            isClickable = true
            views.filterNotNull().forEach { v ->
                addView(v, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(12) })
            }
        }
        overlay = box
        root.addView(box, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
    }

    private fun hideOverlay() {
        overlay?.let { root.removeView(it) }
        overlay = null
    }

    private fun text(s: String, size: Float, color: Int) = TextView(this).apply {
        text = s
        textSize = size
        setTextColor(color)
    }

    private fun button(label: String, primary: Boolean = true, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        if (primary) backgroundTintList = android.content.res.ColorStateList.valueOf(ACCENT)
        setTextColor(if (primary) Color.WHITE else FG)
        if (!primary) setBackgroundColor(Color.TRANSPARENT)
        setOnClickListener { onClick() }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        private const val KEY_SERVER = "server"
        const val ACTION_CHANGE_SERVER = "io.github.maiakitty.jellyshelf.CHANGE_SERVER"
        private val BG = Color.parseColor("#0b0d12")
        private val FG = Color.parseColor("#e9ebf3")
        private val MUTED = Color.parseColor("#8b93a7")
        private val BAD = Color.parseColor("#f87171")
        private val ACCENT = Color.parseColor("#8b7cf6")

        /** "192.168.1.10:8101" → "http://192.168.1.10:8101": a scheme if missing, no trailing slash. Null if it isn't an address. */
        fun normalise(input: String): String? {
            val s = input.trim().trimEnd('/')
            if (s.isEmpty() || s.any { it.isWhitespace() }) return null
            val withScheme = if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(s)) s else "http://$s"
            val uri = Uri.parse(withScheme)
            return if (uri.host.isNullOrEmpty()) null else withScheme
        }
    }
}
