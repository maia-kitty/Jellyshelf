package io.github.maiakitty.jellyshelf

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import io.github.peerless2012.ass.media.kt.buildWithAssSupport
import io.github.peerless2012.ass.media.type.AssRenderType
import org.json.JSONObject

/**
 * Plays a downloaded episode or film: full screen, from where you left off, with the file's own audio and subtitle
 * tracks (styled anime subtitles drawn by libass, like mpv). Where you got to is saved, and once you're 90% in it
 * counts as watched; both go to Jellyfin (and AniList) the next time the app reaches your server.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : Activity() {
    private var player: ExoPlayer? = null
    private lateinit var item: JSONObject
    private val tick = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Library.init(this)
        item = Library.items[intent.getStringExtra(EXTRA_KEY)] ?: return finish()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val view = PlayerView(this).apply {
            setShowSubtitleButton(true)
            setFullscreenButtonState(true)
            keepScreenOn = true
        }
        setContentView(view)
        window.insetsController?.apply {
            hide(WindowInsets.Type.systemBars())
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        val p = ExoPlayer.Builder(this).buildWithAssSupport(this, AssRenderType.OVERLAY_OPEN_GL, subtitleView = view.subtitleView)
        player = p
        view.player = p
        // Subtitles on: the phone's language or English, or an untagged track, even when the file doesn't mark one
        // as default (anime releases usually do; not all).
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setPreferredTextLanguages(java.util.Locale.getDefault().language, "en")
            .setSelectUndeterminedTextLanguage(true)
            .build()
        p.setMediaItem(MediaItem.fromUri(Library.store.uri(item.getString("file"))))
        val resume = item.optLong("position", 0)
        // Started at the very end last time (you finished it): from the top.
        if (resume > 0 && !item.optBoolean("watched")) p.seekTo(resume)
        p.prepare()
        p.playWhenReady = true
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    remember(ended = true)
                    finish()
                }
            }
        })
        // Every 15 s, so a crash or a killed app doesn't lose your place.
        tick.post(object : Runnable {
            override fun run() {
                remember()
                tick.postDelayed(this, 15_000)
            }
        })
    }

    private fun remember(ended: Boolean = false) {
        val p = player ?: return
        val duration = p.duration.takeIf { it > 0 } ?: return
        val position = if (ended) duration else p.currentPosition
        synchronized(Library) {
            item.put("position", if (ended) 0 else position)
            if (position >= duration * 0.9) item.put("watched", true)
            Library.save()
        }
        item.optString("itemId").ifEmpty { null }?.let { id ->
            Library.addPending(JSONObject().put("type", "video").put("itemId", id).put("position", position / 1000.0).put("duration", duration / 1000.0))
        }
    }

    override fun onPause() {
        super.onPause()
        remember()
        player?.pause()
    }

    override fun onDestroy() {
        tick.removeCallbacksAndMessages(null)
        player?.release()
        player = null
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_KEY = "key"
        fun open(ctx: Context, key: String) = ctx.startActivity(Intent(ctx, PlayerActivity::class.java).putExtra(EXTRA_KEY, key))
    }
}
