package io.github.maiakitty.jellyshelf

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.webkit.CookieManager
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Works through the download queue one at a time, in the background with a progress notification, so it carries on
 * with the screen off or the app closed. Requests go to your server with the app's sign-in cookie. A download cut short
 * picks up where it stopped (Range), so a dropped connection doesn't start a 1 GB episode over.
 */
class DownloadService : Service() {
    @Volatile private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Library.init(this)
        startForeground(NOTE, note("Downloading…", null), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        if (!running) {
            running = true
            Thread(::work, "downloads").start()
        }
        return START_NOT_STICKY
    }

    private fun work() {
        try {
            while (true) {
                val item = Library.next() ?: break
                fetch(item)
            }
        } finally {
            running = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun fetch(item: JSONObject) {
        val server = getSharedPreferences("jellyshelf", MODE_PRIVATE).getString("server", null)
        val title = "${item.optString("group")}: ${item.optString("title")}"
        synchronized(Library) { item.put("state", "downloading") }
        try {
            var path = item.getString("file")
            val store = Library.store
            val have = store.length(path).coerceAtLeast(0)
            val conn = open(server + item.getString("path"), if (have > 0) have else 0)
            val code = conn.responseCode
            if (code == 401) throw IOException("Signed out: open Jellyshelf and sign in again")
            if (code !in 200..299) throw IOException("The server answered $code")
            val resumed = code == 206
            val length = conn.getHeaderFieldLong("Content-Length", -1)
            val total = if (length < 0) -1 else if (resumed) have + length else length
            // A video gets its extension from what the server says it is.
            if (item.optString("kind") == "video" && !path.contains('.')) {
                path += when {
                    conn.contentType.orEmpty().contains("mp4") -> ".mp4"
                    conn.contentType.orEmpty().contains("webm") -> ".webm"
                    else -> ".mkv"
                }
                synchronized(Library) { item.put("file", path); Library.save() }
            }
            synchronized(Library) { item.put("total", total).put("bytes", if (resumed) have else 0) }
            var done = if (resumed) have else 0L
            var shown = 0L
            conn.inputStream.use { inp ->
                store.output(path, append = resumed).use { out ->
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        if (!Library.items.containsKey(item.getString("key"))) return // deleted while downloading
                        val n = inp.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        synchronized(Library) { item.put("bytes", done) }
                        if (done - shown > 2_000_000) {
                            shown = done
                            notify(title, if (total > 0) (done * 100 / total).toInt() else null)
                        }
                    }
                }
            }
            if (total > 0 && done < total) throw IOException("The connection dropped")
            synchronized(Library) {
                item.put("state", "done").put("total", done).remove("error")
                Library.save()
            }
            poster(server, item)
        } catch (e: Exception) {
            synchronized(Library) {
                if (Library.items.containsKey(item.optString("key"))) {
                    item.put("state", "failed").put("error", e.message ?: e.toString())
                    Library.save()
                }
            }
        }
    }

    /** The series' cover for the Downloads screen, once per series. */
    private fun poster(server: String?, item: JSONObject) {
        val src = item.optString("poster").ifEmpty { return }
        val path = Library.posterPath(item.optString("group"))
        if (Library.store.length(path) > 0) return
        runCatching {
            val conn = open(if (src.startsWith("/")) server + src else src, 0)
            if (conn.responseCode == 200) conn.inputStream.use { inp -> Library.store.output(path, append = false).use { inp.copyTo(it) } }
        }
    }

    private fun open(url: String, from: Long): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        // Only the server gets the sign-in cookie (a cover from AniList doesn't).
        CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }
        if (from > 0) conn.setRequestProperty("Range", "bytes=$from-")
        return conn
    }

    private fun notify(text: String, percent: Int?) = getSystemService(NotificationManager::class.java).notify(NOTE, note(text, percent))

    private fun note(text: String, percent: Int?): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).setAction(MainActivity.ACTION_DOWNLOADS), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading for offline")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .apply { if (percent != null) setProgress(100, percent, false) else setProgress(0, 0, true) }
            .build()
    }

    companion object {
        private const val CHANNEL = "downloads"
        private const val NOTE = 1
        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, DownloadService::class.java))
    }
}

