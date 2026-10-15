package com.cleaningops.cleaning_ops_app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Каналы фоновой связи (`lib/services/push_service.dart`):
 *  * `cleanfine/push` — start/stop сервиса, payload уведомления, открывшего
 *    приложение, запрос «не ограничивать в фоне»;
 *  * `cleanfine/push/events` — push, пришедшие при открытом приложении, и тапы
 *    по уведомлениям, пока приложение живо.
 */
class MainActivity : FlutterActivity() {

    /** Payload уведомления, которым запустили приложение: Dart забирает его один раз. */
    private var launchPayload: String? = null
    private var events: EventChannel.EventSink? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        launchPayload = intent?.getStringExtra(CfPushService.EXTRA_PAYLOAD)
        intent?.removeExtra(CfPushService.EXTRA_PAYLOAD)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val payload = intent.getStringExtra(CfPushService.EXTRA_PAYLOAD) ?: return
        intent.removeExtra(CfPushService.EXTRA_PAYLOAD)
        if (events != null) CfPushBus.emitOpened(payload) else launchPayload = payload
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, "cleanfine/push").setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    val topic = call.argument<String>("topic")
                    val url = call.argument<String>("url")
                    if (topic.isNullOrEmpty() || url.isNullOrEmpty()) {
                        result.error("bad_args", "нужны topic и url", null)
                    } else {
                        try {
                            CfPushService.start(applicationContext, topic, url)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("start_failed", e.message, null)
                        }
                    }
                }
                "stop" -> {
                    CfPushService.stop(applicationContext)
                    result.success(true)
                }
                "takeLaunchPayload" -> {
                    result.success(launchPayload)
                    launchPayload = null
                }
                "isIgnoringBatteryOptimizations" -> result.success(isIgnoringBatteryOptimizations())
                "requestIgnoreBatteryOptimizations" -> result.success(requestIgnoreBatteryOptimizations())
                else -> result.notImplemented()
            }
        }

        EventChannel(messenger, "cleanfine/push/events").setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, sink: EventChannel.EventSink) {
                    events = sink
                    CfPushBus.listener = { kind, payload ->
                        sink.success(mapOf("kind" to kind, "payload" to payload))
                    }
                }

                override fun onCancel(arguments: Any?) {
                    events = null
                    CfPushBus.listener = null
                }
            },
        )
    }

    override fun onDestroy() {
        CfPushBus.listener = null
        events = null
        super.onDestroy()
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val power = getSystemService(PowerManager::class.java) ?: return true
        return power.isIgnoringBatteryOptimizations(packageName)
    }

    /**
     * Системный диалог «Разрешить работу в фоне без ограничений?». Без него в
     * режиме Doze сеть у приложения отбирают, и push опаздывают до пробуждения.
     * `true` — диалог показан (или ограничений уже нет).
     */
    @SuppressLint("BatteryLife")
    private fun requestIgnoreBatteryOptimizations(): Boolean {
        if (isIgnoringBatteryOptimizations()) return true
        return try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:$packageName")),
            )
            true
        } catch (_: Exception) {
            false
        }
    }
}
