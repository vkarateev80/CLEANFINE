import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Наличие сети для очереди оффлайна (М6.7).
///
/// Интерфейс, а не класс: в тестах состояние сети задаётся вручную, а
/// `connectivity_plus` сообщает не «есть интернет», а «есть подключение к сети» —
/// окончательное решение всё равно принимает [SyncService] по результату запроса.
abstract class ConnectivityService {
  Future<bool> isOnline();

  /// Изменения состояния: `true` — соединение появилось.
  Stream<bool> get onlineChanges;
}

class ConnectivityPlusService implements ConnectivityService {
  ConnectivityPlusService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<bool> isOnline() async => _hasConnection(await _connectivity.checkConnectivity());

  @override
  Stream<bool> get onlineChanges =>
      _connectivity.onConnectivityChanged.map(_hasConnection).distinct();

  static bool _hasConnection(List<ConnectivityResult> results) =>
      results.any((ConnectivityResult result) => result != ConnectivityResult.none);
}

final connectivityServiceProvider = Provider<ConnectivityService>((Ref ref) {
  return ConnectivityPlusService();
});

/// Онлайн ли устройство: стартовое значение из `isOnline()`, дальше — поток изменений.
///
/// Экраны показывают по нему оффлайн-баннер и не ждут запроса, чтобы его отрисовать.
final onlineProvider = StreamProvider<bool>((Ref ref) async* {
  final ConnectivityService service = ref.watch(connectivityServiceProvider);
  yield await service.isOnline();
  yield* service.onlineChanges;
});
