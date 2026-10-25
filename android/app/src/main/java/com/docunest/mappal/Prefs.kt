package com.docunest.mappal

import android.content.Context

/**
 * Everything the app remembers. The link is a template so the web app can
 * move or change its URL format without reinstalling this APK (it's on a
 * device bolted to a dashboard — installs should be rare).
 */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("mappal", Context.MODE_PRIVATE)

    /** e.g. https://mappal.example/?lat={lat}&lng={lng}&acc={acc} */
    var link: String
        get() = sp.getString("link", null)?.takeIf { it.isNotBlank() } ?: defaultLink(BuildConfig.MAPPAL_URL)
        set(value) = sp.edit().putString("link", normalize(value)).apply()

    /** Start the button by itself after the device boots (dashboard power-cycles). */
    var startOnBoot: Boolean
        get() = sp.getBoolean("startOnBoot", true)
        set(value) = sp.edit().putBoolean("startOnBoot", value).apply()

    var bubbleX: Int
        get() = sp.getInt("bubbleX", 24)
        set(value) = sp.edit().putInt("bubbleX", value).apply()

    var bubbleY: Int
        get() = sp.getInt("bubbleY", 400)
        set(value) = sp.edit().putInt("bubbleY", value).apply()

    companion object {
        fun defaultLink(base: String): String =
            if (base.isBlank()) "" else "${base.trimEnd('/')}/?lat={lat}&lng={lng}&acc={acc}"

        /** A plain address ("https://x.app") gets the standard placeholders added. */
        fun normalize(value: String): String {
            val v = value.trim()
            return if (v.isBlank() || v.contains("{lat}")) v else defaultLink(v)
        }
    }
}
