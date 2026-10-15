package com.cleaningops.cleaning_ops_app

/**
 * Мост «сервис → Flutter»: пока приложение открыто, [MainActivity] держит здесь
 * слушателя, и push из [CfPushService] доходит до Dart (обновить экраны).
 * Приложение закрыто — слушателя нет, остаётся системное уведомление.
 * Вызывается только с главного потока.
 */
object CfPushBus {
    var listener: ((kind: String, payload: String) -> Unit)? = null

    fun emitMessage(payload: String) {
        listener?.invoke("message", payload)
    }

    fun emitOpened(payload: String) {
        listener?.invoke("opened", payload)
    }
}
