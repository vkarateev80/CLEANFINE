package com.cleaningops.cleaning_ops_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Фоновая связь с ntfy: foreground-сервис с тихим постоянным уведомлением
 * «CLEANFINE на связи», держит подписку `GET <ntfy>/<topic>/json` и показывает
 * push системными уведомлениями — при свёрнутом и закрытом приложении.
 *
 * Раньше подписка жила в Dart-процессе и умирала, как только приложение уходило
 * с экрана (на проде ntfy почти всегда видел 0 подписчиков, 15.10.2026).
 *
 * Топик и адрес приходят из Dart ([MainActivity], канал `cleanfine/push`) и
 * хранятся в SharedPreferences: после перезагрузки телефона или обновления
 * приложения сервис поднимает [CfPushBootReceiver]. Последний принятый id
 * сообщения тоже хранится — переподключение идёт с `since=<id>`, и всё, что
 * ntfy закэшировал за время обрыва связи (12 ч), доходит.
 */
class CfPushService : Service() {

    companion object {
        private const val TAG = "CfPush"

        const val ACTION_START = "com.cleaningops.push.START"
        const val ACTION_STOP = "com.cleaningops.push.STOP"
        const val EXTRA_TOPIC = "topic"
        const val EXTRA_URL = "url"

        /** Extra intent-а MainActivity: JSON уведомления, по которому тапнули. */
        const val EXTRA_PAYLOAD = "cf_push_payload"

        private const val PREFS = "cf_push"
        private const val KEY_TOPIC = "topic"
        private const val KEY_URL = "url"
        private const val KEY_LAST_ID = "last_id"
        private const val KEY_ENABLED = "enabled"

        /** Тот же канал, что создаёт flutter_local_notifications в Dart. */
        private const val CHANNEL_MESSAGES = "cleanfine_main"
        private const val CHANNEL_SERVICE = "cleanfine_service"
        private const val SERVICE_NOTIFICATION_ID = 7001

        /** ntfy шлёт keepalive раз в 45 с: дольше тишины — соединение мёртвое. */
        private const val READ_TIMEOUT_MS = 100_000
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val MAX_BACKOFF_MS = 60_000L

        fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun start(context: Context, topic: String, url: String) {
            prefs(context).edit()
                .putString(KEY_TOPIC, topic)
                .putString(KEY_URL, url)
                .putBoolean(KEY_ENABLED, true)
                .apply()
            val intent = Intent(context, CfPushService::class.java).setAction(ACTION_START)
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        /** Выход из аккаунта: сервис гаснет и не поднимается после перезагрузки. */
        fun stop(context: Context) {
            prefs(context).edit().putBoolean(KEY_ENABLED, false).remove(KEY_LAST_ID).apply()
            context.stopService(Intent(context, CfPushService::class.java))
        }

        fun isEnabled(context: Context): Boolean {
            val p = prefs(context)
            return p.getBoolean(KEY_ENABLED, false) && !p.getString(KEY_TOPIC, null).isNullOrEmpty()
        }

        /** Разбор события ntfy в JSON-payload приложения (как `ntfyEventToMessage` в Dart). */
        fun payloadOf(event: JSONObject): JSONObject? {
            if (event.optString("event") != "message") return null
            val raw = event.optString("message", "")
            val out = JSONObject()
            if (raw.startsWith("{")) {
                try {
                    val env = JSONObject(raw)
                    if (env.has("v") && env.has("b")) {
                        if (!env.isNull("t")) out.put("title", env.optString("t"))
                        out.put("body", env.optString("b"))
                        val data = env.optJSONObject("d")
                        if (data != null) {
                            val keys = data.keys()
                            while (keys.hasNext()) {
                                val key = keys.next()
                                out.put(key, if (data.isNull(key)) "" else data.get(key).toString())
                            }
                        }
                        return out
                    }
                } catch (_: Exception) {
                    // Не конверт — разбор как обычного сообщения ниже.
                }
            }
            if (event.has("title")) out.put("title", event.optString("title"))
            out.put("body", raw)
            return out
        }
    }

    private val main = Handler(Looper.getMainLooper())
    @Volatile private var running = false
    @Volatile private var connection: HttpURLConnection? = null
    private var worker: Thread? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !isEnabled(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        goForeground()
        startWorker()
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        unwatchNetwork()
        connection?.disconnect()
        worker?.interrupt()
        worker = null
        super.onDestroy()
    }

    private fun goForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_SERVICE,
                "Фоновая связь",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Держит связь с сервером, чтобы уведомления приходили при закрытом приложении"
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_cleanfine)
            .setContentTitle("CLEANFINE на связи")
            .setContentText("Уведомления придут, даже если приложение закрыто")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setShowWhen(false)
            .setSilent(true)
            .setContentIntent(launchIntent(null, 0))
            .build()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
        } else {
            0
        }
        ServiceCompat.startForeground(this, SERVICE_NOTIFICATION_ID, notification, type)
    }

    private fun startWorker() {
        if (running && worker?.isAlive == true) return
        running = true
        watchNetwork()
        worker = Thread({ loop() }, "cf-ntfy").also { it.start() }
    }

    private fun loop() {
        var backoff = 3_000L
        while (running) {
            val started = System.currentTimeMillis()
            try {
                consume()
            } catch (e: InterruptedException) {
                if (!running) return
            } catch (e: Exception) {
                Log.w(TAG, "ntfy: ${e.javaClass.simpleName}: ${e.message}")
            }
            if (!running) return
            // Долгое соединение было рабочим — переподключаемся быстро.
            if (System.currentTimeMillis() - started > 60_000) backoff = 3_000L
            try {
                Thread.sleep(backoff)
            } catch (_: InterruptedException) {
                if (!running) return
            }
            backoff = (backoff * 2).coerceAtMost(MAX_BACKOFF_MS)
        }
    }

    private fun consume() {
        val p = prefs(this)
        val topic = p.getString(KEY_TOPIC, null) ?: throw IllegalStateException("нет топика")
        val base = p.getString(KEY_URL, null) ?: throw IllegalStateException("нет адреса")
        val lastId = p.getString(KEY_LAST_ID, null)
        val query = if (lastId.isNullOrEmpty()) "" else "?since=" + URLEncoder.encode(lastId, "UTF-8")
        val conn = URL("${base.trimEnd('/')}/$topic/json$query").openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.setRequestProperty("Accept", "application/x-ndjson")
        connection = conn
        try {
            if (conn.responseCode != HttpURLConnection.HTTP_OK) {
                throw IllegalStateException("ntfy HTTP ${conn.responseCode}")
            }
            Log.i(TAG, "подписка открыта")
            BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { reader ->
                while (running) {
                    val line = reader.readLine() ?: break
                    if (line.isBlank()) continue
                    val event = try { JSONObject(line) } catch (_: Exception) { continue }
                    val payload = payloadOf(event) ?: continue
                    val id = event.optString("id")
                    if (id.isNotEmpty()) p.edit().putString(KEY_LAST_ID, id).apply()
                    deliver(id, payload)
                }
            }
        } finally {
            connection = null
            conn.disconnect()
        }
    }

    private fun deliver(id: String, payload: JSONObject) {
        val notificationId = if (id.isEmpty()) payload.hashCode() else id.hashCode()
        showMessage(notificationId, payload)
        val json = payload.toString()
        main.post { CfPushBus.emitMessage(json) }
    }

    private fun showMessage(notificationId: Int, payload: JSONObject) {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.getNotificationChannel(CHANNEL_MESSAGES) == null
        ) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_MESSAGES,
                    "Уведомления CLEANFINE",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply { description = "Смены, заявки, чат и тревоги" },
            )
        }
        val body = payload.optString("body", "")
        val notification = NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_cleanfine)
            .setContentTitle(payload.optString("title", "").ifEmpty { "CLEANFINE" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(launchIntent(payload.toString(), notificationId))
            .build()
        try {
            manager.notify(notificationId, notification)
        } catch (e: SecurityException) {
            // Нет разрешения POST_NOTIFICATIONS — сообщение всё равно ушло в приложение.
            Log.w(TAG, "уведомление не показано: ${e.message}")
        }
    }

    private fun launchIntent(payload: String?, requestCode: Int): PendingIntent {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (payload != null) intent.putExtra(EXTRA_PAYLOAD, payload)
        return PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Сеть появилась/сменилась — рвём зависшее соединение, цикл переподключится сразу. */
    private fun watchNetwork() {
        if (networkCallback != null) return
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            /** Первый вызов приходит сразу при регистрации — это текущая сеть. */
            private var current: Network? = null

            override fun onAvailable(network: Network) {
                val previous = current
                current = network
                if (previous == null || previous == network) return
                connection?.disconnect()
                worker?.interrupt()
            }
        }
        try {
            cm.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (e: Exception) {
            Log.w(TAG, "без слежения за сетью: ${e.message}")
        }
    }

    private fun unwatchNetwork() {
        val callback = networkCallback ?: return
        networkCallback = null
        try {
            getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(callback)
        } catch (_: Exception) {
        }
    }
}
