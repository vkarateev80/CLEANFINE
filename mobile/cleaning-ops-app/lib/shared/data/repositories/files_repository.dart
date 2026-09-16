import '../../../core/constants/api_constants.dart';
import '../../../core/errors/exceptions.dart';
import '../../../services/api_client.dart';
import '../models/file_models.dart';
import '../result.dart';

/// Загрузка файлов в file-service (фотоотчёт оператора, М6.4).
class FilesRepository {
  FilesRepository(this._api);

  static const String _uploadPath = '${ApiConstants.apiPrefix}/files/upload';

  final ApiClient _api;

  /// `POST /api/files/upload` (multipart): `kind=photo` → сервер сам накладывает
  /// водяной знак (ФИО из токена, дата, координаты) и отдаёт `url`.
  ///
  /// `userName` не передаём: file-service подставляет ФИО из access-токена,
  /// который и так уходит в заголовке (`files.service.ts`, «подставляет ФИО из
  /// токена, если userName не передан»).
  Future<Result<UploadedFile>> uploadPhoto({
    required String filePath,
    DateTime? takenAt,
    double? lat,
    double? lng,
    String? fileName,
    void Function(int sent, int total)? onProgress,
  }) {
    return guard(() async {
      final response = await _api.upload(
        _uploadPath,
        filePath: filePath,
        field: 'file',
        fileName: fileName,
        onProgress: onProgress,
        fields: <String, dynamic>{
          'kind': 'photo',
          if (takenAt != null) 'takenAt': takenAt.toUtc().toIso8601String(),
          if (lat != null) 'lat': lat,
          if (lng != null) 'lng': lng,
        },
      );
      final UploadedFile? file = UploadedFile.tryParse(response.data);
      if (file == null) {
        throw const ServerException('Некорректный ответ сервера: не удалось разобрать файл');
      }
      return file;
    });
  }
}
