package com.cleaningops.cleaning_ops_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * После перезагрузки телефона и после обновления приложения фоновая связь
 * поднимается сама — если пользователь не выходил из аккаунта.
 */
class CfPushBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
            else -> return
        }
        if (!CfPushService.isEnabled(context)) return
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, CfPushService::class.java).setAction(CfPushService.ACTION_START),
            )
        } catch (e: Exception) {
            // Система не дала стартовать из фона — сервис поднимется при открытии приложения.
            Log.w("CfPush", "старт после загрузки не удался: ${e.message}")
        }
    }
}
