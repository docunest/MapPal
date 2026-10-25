package com.docunest.mappal

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/** Dashboard devices reboot with the ignition — bring the button back by itself. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (Prefs(context).startOnBoot && Settings.canDrawOverlays(context)) BubbleService.start(context)
    }
}
