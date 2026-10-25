package com.docunest.mappal

import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent
import java.util.Locale

/**
 * Grab the position and open the link. This is the app's whole contract
 * with the web app: fill {lat} {lng} {acc} into the saved link and open it.
 * Nothing else about the web app is known here, so it can change freely.
 */
object Opener {
    fun fill(template: String, loc: Location?): String {
        if (loc == null) {
            // No fix: open without coordinates; the web app falls back to browser GPS.
            return template.substringBefore('?').ifBlank { template }
        }
        return template
            .replace("{lat}", String.format(Locale.US, "%.5f", loc.latitude))
            .replace("{lng}", String.format(Locale.US, "%.5f", loc.longitude))
            .replace("{acc}", if (loc.hasAccuracy()) loc.accuracy.toInt().toString() else "")
    }

    fun locateAndOpen(context: Context, onDone: () -> Unit = {}) {
        val link = Prefs(context).link
        if (link.isBlank()) {
            Toast.makeText(context, "Set the MapPal link first", Toast.LENGTH_LONG).show()
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            onDone()
            return
        }
        Locator.current(context) { loc ->
            if (loc == null) {
                Toast.makeText(context, "No GPS fix — MapPal will ask the browser for location", Toast.LENGTH_SHORT).show()
            }
            open(context, fill(link, loc))
            onDone()
        }
    }

    private fun open(context: Context, url: String) {
        // A Custom Tab shares the browser's cookies, so the MapPal login sticks.
        val tab = CustomTabsIntent.Builder().setShowTitle(true).build()
        tab.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            tab.launchUrl(context, Uri.parse(url))
        } catch (e: Exception) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
