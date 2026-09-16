/// Ответ file-service `POST /api/files/upload` (`UploadedFileView`).
///
/// Для фотоотчёта операции (М6.4) нужны `url` (в него сервер уже положил
/// водяной знак — `watermarked: true`) и `thumbnailUrl` для миниатюры.
class UploadedFile {
  const UploadedFile({
    required this.id,
    required this.url,
    this.thumbnailUrl,
    this.width,
    this.height,
    this.watermarked = false,
  });

  final String id;
  final String url;
  final String? thumbnailUrl;
  final int? width;
  final int? height;
  final bool watermarked;

  static UploadedFile? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    final String? url = _text(body['url']);
    if (id == null || id.isEmpty || url == null) return null;
    return UploadedFile(
      id: id,
      url: url,
      thumbnailUrl: _text(body['thumbnailUrl']),
      width: _int(body['width']),
      height: _int(body['height']),
      watermarked: body['watermarked'] == true,
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }
}
