import '../../../core/constants/api_constants.dart';
import '../../../core/errors/exceptions.dart';
import '../../../services/api_client.dart';
import '../models/gps_models.dart';
import '../result.dart';

/// Приём треков в gps-service (М6.6).
class GpsRepository {
  GpsRepository(this._api);

  static const String _trackPath = '${ApiConstants.apiPrefix}/gps/track';

  final ApiClient _api;

  /// `POST /api/gps/track` — batch до [ApiConstants.trackBatchLimit] точек.
  ///
  /// Пустой список не отправляется: сервер отвечает 400 на `tracks: []`.
  Future<Result<GpsTrackResult>> trackBatch(List<GpsTrackPoint> points) {
    return guard(() async {
      if (points.isEmpty) return const GpsTrackResult(accepted: 0);
      final response = await _api.post(
        _trackPath,
        data: <String, dynamic>{
          'tracks': points.map((GpsTrackPoint point) => point.toJson()).toList(),
        },
      );
      final GpsTrackResult? result = GpsTrackResult.tryParse(response.data);
      if (result == null) {
        throw const ServerException('Некорректный ответ сервера: не удалось разобрать приём трека');
      }
      return result;
    });
  }
}
