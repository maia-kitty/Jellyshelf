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
import android.Manifest
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceResponse
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Jellyshelf in an app: the web app full screen in a WebView, pointed at your own server. First start (and the
 * launcher shortcut "Change server") asks for the server's address. Videos go full screen, links to other sites open
 * in the browser, and Back goes back a page.
 *
 * Inside the app the web pages get Download buttons (through the `JellyshelfApp` bridge): chapters and videos are kept
 * on the phone and read or watched from the app's own Downloads pages (bundled in the app, so they work with no
 * connection), with progress sent back to the server once it's reachable again.
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private var web: WebView? = null
    private var overlay: View? = null
    private var fullscreen: View? = null
    private var fullscreenDone: WebChromeClient.CustomViewCallback? = null
    private val prefs by lazy { getSharedPreferences("jellyshelf", MODE_PRIVATE) }
    private val server get() = prefs.getString(KEY_SERVER, null)
    /**
     * The page the WebView is showing, for the bridge to check who's calling. Its methods run on another thread and the
     * page can call before onPageStarted arrives, so it asks the WebView itself (on the UI thread).
     */
    private val pageUrl: Uri
        get() {
            val task = java.util.concurrent.FutureTask { web?.url }
            runOnUiThread(task)
            return runCatching { task.get(2, java.util.concurrent.TimeUnit.SECONDS) }.getOrNull()?.let(Uri::parse) ?: Uri.EMPTY
        }

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
        Library.init(this)
        // Downloads cut short last time carry on.
        if (Library.next() != null) DownloadService.start(this)

        val url = server
        when {
            intent?.action == ACTION_DOWNLOADS -> openDownloads()
            url == null || intent?.action == ACTION_CHANGE_SERVER -> showSetup(url)
            else -> openWeb(url, savedInstanceState)
        }

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_CHANGE_SERVER) showSetup(server)
        if (intent.action == ACTION_DOWNLOADS) openDownloads()
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
        val w = newWeb()
        if (state == null || w.restoreState(state) == null) w.loadUrl(url)
    }

    /** The Downloads pages, bundled in the app: they work with no connection at all. */
    private fun openDownloads() {
        hideOverlay()
        (web ?: newWeb()).loadUrl("$OFFLINE/offline/index.html")
    }

    private fun newWeb(): WebView {
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
                if (sameServer(uri) || isAniListLogin(uri) || uri.host == OFFLINE_HOST) return false
                return openOutside(uri)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError("Can't reach Jellyshelf at ${server}.\n${error.description}")
            }

            override fun onPageFinished(view: WebView, url: String) {
                CookieManager.getInstance().flush()
                // Back in touch with the server: send what was read and watched offline.
                if (sameServer(Uri.parse(url))) Thread(::sendPending).start()
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                if (request.url.host == OFFLINE_HOST) offline(request.url) else null
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
        w.addJavascriptInterface(Bridge(), "JellyshelfApp")
        root.addView(w, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        return w
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

    // ---------- the bridge the pages talk to ----------

    /**
     * `window.JellyshelfApp`. Your server's pages may queue downloads and see their progress; the app's own Downloads
     * pages may read, play and delete them. Nothing else gets anything (AniList's login page runs in here too).
     */
    inner class Bridge {
        private fun fromServer() = sameServer(pageUrl)
        private fun fromApp() = pageUrl.let { it.host == OFFLINE_HOST && it.scheme == "https" }

        @JavascriptInterface
        fun download(json: String) {
            if (!fromServer()) return
            val item = runCatching { JSONObject(json) }.getOrNull() ?: return
            // Only paths on your server: the page can't send the app (or its sign-in) anywhere else.
            val path = item.optString("path")
            val poster = item.optString("poster")
            if (!path.startsWith("/") || path.startsWith("//") || item.optString("key").isEmpty()) return
            if (poster.isNotEmpty() && !poster.startsWith("https://") && !(poster.startsWith("/") && !poster.startsWith("//"))) item.remove("poster")
            if (Library.enqueue(item)) runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
                DownloadService.start(this@MainActivity)
            }
        }

        @JavascriptInterface
        fun status(): String = if (fromServer() || fromApp()) Library.status() else "{}"

        @JavascriptInterface
        fun openDownloads() {
            if (fromServer()) runOnUiThread { this@MainActivity.openDownloads() }
        }

        /** Everything downloaded or queued, for the Downloads pages. */
        @JavascriptInterface
        fun library(): String {
            if (!fromApp()) return "{}"
            return synchronized(Library) {
                JSONObject()
                    .put("items", JSONArray(Library.items.values.map { JSONObject(it.toString()) }))
                    .put("storage", Library.store.label)
                    .put("server", server != null)
                    .toString()
            }
        }

        @JavascriptInterface
        fun pages(key: String): Int = if (fromApp()) runCatching { Library.pages(key)?.second?.size }.getOrNull() ?: 0 else 0

        @JavascriptInterface
        fun play(key: String) {
            if (fromApp()) runOnUiThread { PlayerActivity.open(this@MainActivity, key) }
        }

        /** The reader got to the end of a chapter: AniList follows once the server is reachable. */
        @JavascriptInterface
        fun markRead(key: String) {
            if (!fromApp()) return
            val item = Library.items[key] ?: return
            synchronized(Library) { item.put("read", true) }
            Library.addPending(JSONObject().put("type", "manga").put("anilistId", item.optInt("anilistId")).put("chapter", item.optDouble("chapter")))
        }

        @JavascriptInterface
        fun remove(key: String) {
            if (fromApp()) Library.remove(key)
        }

        @JavascriptInterface
        fun retry(key: String) {
            if (!fromApp()) return
            val item = Library.items[key] ?: return
            if (Library.enqueue(JSONObject(item.toString()))) runOnUiThread { DownloadService.start(this@MainActivity) }
        }

        @JavascriptInterface
        fun chooseFolder() {
            if (fromApp()) runOnUiThread {
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), PICK_FOLDER)
            }
        }

        @JavascriptInterface
        fun useAppStorage() {
            if (!fromApp()) return
            Library.useFolder(null)
            runOnUiThread { web?.reload() }
        }

        /** Back to Jellyshelf itself. */
        @JavascriptInterface
        fun home() {
            if (fromApp()) runOnUiThread { server?.let { openWeb(it) } ?: showSetup(null) }
        }
    }

    @Deprecated("Fine for a one-off picker; the AndroidX result API would be a dependency")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val tree = data?.data
        if (requestCode != PICK_FOLDER || resultCode != RESULT_OK || tree == null) return
        // Keep access to the folder after a restart.
        contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        Library.useFolder(tree)
        web?.reload()
    }

    // ---------- the app's own pages and files ----------

    /** https://appassets.androidplatform.net/…: the bundled Downloads pages, chapter pages out of the CBZs, covers. */
    private fun offline(url: Uri): WebResourceResponse {
        val parts = url.pathSegments
        return runCatching {
            when (parts.firstOrNull()) {
                "offline" -> {
                    val name = parts.drop(1).joinToString("/")
                    val type = when (name.substringAfterLast('.')) { "html" -> "text/html"; "css" -> "text/css"; "js" -> "text/javascript"; else -> "application/octet-stream" }
                    WebResourceResponse(type, "utf-8", assets.open("offline/$name"))
                }
                "page" -> {
                    val (zip, names) = Library.pages(parts[1]) ?: return notFound()
                    val name = names.getOrNull(parts[2].toInt()) ?: return notFound()
                    val bytes = synchronized(Library) { zip.getInputStream(zip.getEntry(name)).use { it.readBytes() } }
                    WebResourceResponse(mime(name), null, ByteArrayInputStream(bytes))
                }
                "poster" -> Library.store.input(Library.posterPath(parts[1]))?.let { WebResourceResponse("image/jpeg", null, it) } ?: notFound()
                else -> notFound()
            }
        }.getOrElse { notFound() }
    }

    private fun mime(name: String) = when (name.substringAfterLast('.').lowercase()) {
        "png" -> "image/png"; "webp" -> "image/webp"; "gif" -> "image/gif"; "avif" -> "image/avif"; else -> "image/jpeg"
    }

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    // ---------- progress made offline ----------

    /** Chapters read and episodes watched without a connection go to the server (and from there AniList and Jellyfin). */
    @Synchronized
    private fun sendPending() {
        val base = server ?: return
        for (e in Library.takePending()) {
            val sent = runCatching {
                if (e.optString("type") == "manga") {
                    post("$base/api/manga/read", JSONObject().put("anilistId", e.getInt("anilistId")).put("chapter", e.getDouble("chapter")))
                } else {
                    val id = e.getString("itemId")
                    post(
                        "$base/api/play/report",
                        JSONObject().put("event", "stop").put("itemId", id).put("mediaSourceId", id.replace("-", ""))
                            .put("playSessionId", UUID.randomUUID().toString().replace("-", "")).put("playMethod", "DirectPlay")
                            .put("position", e.getDouble("position")).put("duration", e.getDouble("duration")).put("paused", true)
                            .put("audioIndex", JSONObject.NULL).put("subtitleIndex", JSONObject.NULL),
                    )
                }
            }.getOrDefault(0)
            // Sent, or refused for good (a bad request): either way it's done. A server error or no connection: next time.
            if (sent in 200..299 || sent in 400..499 && sent != 401) Library.donePending(e) else break
        }
    }

    private fun post(url: String, body: JSONObject): Int {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 10_000
        conn.setRequestProperty("Content-Type", "application/json")
        CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        return conn.responseCode.also { conn.disconnect() }
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
            if (Library.items.isNotEmpty()) button("Downloads", primary = false) { openDownloads() } else null,
            cancel,
        )
        input.requestFocus()
    }

    private fun showError(message: String) {
        showOverlay(
            text("Can't connect", 24f, FG),
            text(message, 15f, MUTED),
            button("Try again") { server?.let { openWeb(it) } },
            button("Downloads", primary = false) { openDownloads() },
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
        const val ACTION_DOWNLOADS = "io.github.maiakitty.jellyshelf.DOWNLOADS"
        /** Android's reserved address for an app's own pages: it never reaches the network. */
        private const val OFFLINE_HOST = "appassets.androidplatform.net"
        private const val OFFLINE = "https://$OFFLINE_HOST"
        private const val PICK_FOLDER = 1
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
