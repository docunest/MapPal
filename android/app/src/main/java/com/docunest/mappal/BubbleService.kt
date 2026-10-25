package com.docunest.mappal

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.TextView
import kotlin.math.abs

/**
 * The floating button. Tap: current position → MapPal opens there.
 * Drag: move it. Long-press: hide it (until started again from the app).
 */
class BubbleService : Service() {
    private lateinit var wm: WindowManager
    private var bubble: TextView? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        if (bubble == null) addBubble()
        return START_STICKY
    }

    private fun startInForeground() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Floating button", NotificationManager.IMPORTANCE_MIN))
        val stop = PendingIntent.getService(
            this, 1, Intent(this, BubbleService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val hideAction = Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_pin), "Hide button", stop).build()
        val n: Notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_pin)
            .setContentTitle("MapPal button is on")
            .setContentText("Tap the 📍 bubble to open MapPal where you are. Long-press it to hide.")
            .setContentIntent(open)
            .addAction(hideAction)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
    }

    @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
    private fun addBubble() {
        val prefs = Prefs(this)
        val size = (56 * resources.displayMetrics.density).toInt()
        val view = TextView(this).apply {
            text = "📍"
            textSize = 26f
            gravity = Gravity.CENTER
            background = context.getDrawable(R.drawable.bubble_bg)
            elevation = 8 * resources.displayMetrics.density
            contentDescription = "Open MapPal here"
        }
        val params = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = prefs.bubbleX
            y = prefs.bubbleY
        }

        val slop = ViewConfiguration.get(this).scaledTouchSlop
        val longPress = ViewConfiguration.getLongPressTimeout().toLong()
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var moved = false
        val hide = Runnable { stopSelf() }

        view.setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; moved = false
                    v.postDelayed(hide, longPress)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!moved && (abs(dx) > slop || abs(dy) > slop)) {
                        moved = true
                        v.removeCallbacks(hide)
                    }
                    if (moved) {
                        params.x = startX + dx.toInt()
                        params.y = startY + dy.toInt()
                        wm.updateViewLayout(v, params)
                    }
                }
                MotionEvent.ACTION_UP -> {
                    v.removeCallbacks(hide)
                    if (moved) {
                        prefs.bubbleX = params.x
                        prefs.bubbleY = params.y
                    } else {
                        (v as TextView).text = "…"
                        Opener.locateAndOpen(this) { v.text = "📍" }
                    }
                }
                MotionEvent.ACTION_CANCEL -> v.removeCallbacks(hide)
            }
            true
        }
        wm.addView(view, params)
        bubble = view
    }

    override fun onDestroy() {
        bubble?.let { runCatching { wm.removeView(it) } }
        bubble = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "bubble"
        private const val NOTIFICATION_ID = 1
        const val ACTION_STOP = "com.docunest.mappal.STOP"

        fun start(context: Context) {
            context.startForegroundService(Intent(context, BubbleService::class.java))
        }

        fun stop(context: Context) =
            context.startService(Intent(context, BubbleService::class.java).setAction(ACTION_STOP))
    }
}
