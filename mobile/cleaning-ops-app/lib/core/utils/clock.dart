import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Источник «сейчас» для экранов с таймерами.
///
/// Таймер операции считается по wall-clock (`startedAtLocal` → сейчас), а не по
/// числу тиков `Timer.periodic`: так значение не «уплывает», если кадры
/// пропущены или приложение возвращалось из фона. В тестах часы подменяются,
/// чтобы проверять показания таймера детерминированно.
typedef Now = DateTime Function();

final nowProvider = Provider<Now>((Ref ref) => DateTime.now);
