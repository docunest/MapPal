package com.docunest.mappal

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * Setup screen: the web app's address, the three permissions the button
 * needs, and start/stop. Kept to plain views — it's a one-time screen.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var urlField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val pad = (16 * resources.displayMetrics.density).toInt()

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        fun label(text: String, size: Float = 15f) = TextView(this).apply {
            this.text = text
            textSize = size
            setPadding(0, pad / 2, 0, pad / 2)
        }
        fun button(text: String, onClick: () -> Unit) = Button(this).apply {
            this.text = text
            setOnClickListener { onClick() }
        }

        col.addView(label("MapPal button", 22f))
        col.addView(label("A floating 📍 button: tap it anywhere and MapPal opens at your current location."))

        col.addView(label("Link to open (the web app's address works too)"))
        urlField = EditText(this).apply {
            setText(prefs.link)
            hint = "https://your-mappal.vercel.app"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
        }
        col.addView(urlField, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(label("{lat} {lng} {acc} are filled in with your position. Change this any time — no reinstall needed.", 12f))
        col.addView(button("Save link") { saveUrl() })
        col.addView(CheckBox(this).apply {
            text = "Show the button automatically after the device starts"
            isChecked = prefs.startOnBoot
            setOnCheckedChangeListener { _, checked -> prefs.startOnBoot = checked }
        })

        status = label("")
        col.addView(status)
        col.addView(button("1. Allow location") {
            val perms = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            requestPermissions(perms, REQ_LOCATION)
        })
        col.addView(button("2. Allow \"display over other apps\"") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            col.addView(button("3. Allow notification (keeps the button alive)") {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
            })
        }
        col.addView(button("Show floating button") { startBubble() })
        col.addView(button("Hide floating button") { BubbleService.stop(this) })
        col.addView(button("Open MapPal here now") { saveUrl(); Opener.locateAndOpen(this) })

        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refreshStatus()
    }

    private fun saveUrl() {
        val url = urlField.text.toString().trim()
        if (url.isNotEmpty() && !url.startsWith("https://") && !url.startsWith("http://")) {
            Toast.makeText(this, "The link should start with https://", Toast.LENGTH_LONG).show()
            return
        }
        prefs.link = url
        urlField.setText(prefs.link)
        refreshStatus()
    }

    private fun startBubble() {
        saveUrl()
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow \"display over other apps\" first (step 2)", Toast.LENGTH_LONG).show()
            return
        }
        BubbleService.start(this)
        Toast.makeText(this, "Button is on — you can leave this screen", Toast.LENGTH_SHORT).show()
    }

    @SuppressLint("SetTextI18n")
    private fun refreshStatus() {
        val loc = if (Locator.hasPermission(this)) "✓" else "✗"
        val overlay = if (Settings.canDrawOverlays(this)) "✓" else "✗"
        val notify = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) "✓" else "✗"
        val link = if (prefs.link.isBlank()) "✗ not set" else "✓"
        status.text = "Link $link · Location $loc · Over other apps $overlay · Notification $notify"
    }

    companion object {
        private const val REQ_LOCATION = 1
        private const val REQ_NOTIFY = 2
    }
}
