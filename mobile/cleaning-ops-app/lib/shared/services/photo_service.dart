import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// Снимок фотоотчёта: файл на устройстве, его размеры и время съёмки.
class CapturedPhoto {
  const CapturedPhoto({
    required this.path,
    required this.width,
    required this.height,
    required this.takenAt,
  });

  final String path;
  final int width;
  final int height;
  final DateTime takenAt;

  /// Сервер (`file-service`) принимает фото не меньше 1280×720 — проверяем то же
  /// условие до загрузки, чтобы оператор не ждал ответа 400.
  bool get isLargeEnough => width >= CapturedPhoto.minWidth && height >= CapturedPhoto.minHeight;

  static const int minWidth = 1280;
  static const int minHeight = 720;
}

/// Съёмка фото операции.
///
/// Интерфейс, а не класс: widget-тесты не поднимают камеру и не пишут файлы на
/// диск — они подменяют сервис снимком с нужными размерами.
abstract class PhotoCaptureService {
  /// Снимает фото и кладёт его в каталог приложения (`photos/{operationId}.jpg`).
  /// `null` — оператор закрыл камеру, ничего не сняв.
  Future<CapturedPhoto?> capture({required String operationId});

  /// Удаляет локальный файл (после успешной отправки или по кнопке «Переснять»).
  Future<void> delete(String? path);
}

class ImagePickerPhotoService implements PhotoCaptureService {
  ImagePickerPhotoService({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<CapturedPhoto?> capture({required String operationId}) async {
    final XFile? shot = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );
    if (shot == null) return null;

    final Uint8List bytes = await shot.readAsBytes();
    final ui.Codec codec = await ui.instantiateImageCodec(bytes);
    final ui.FrameInfo frame = await codec.getNextFrame();
    final int width = frame.image.width;
    final int height = frame.image.height;
    frame.image.dispose();
    codec.dispose();

    // Снимок из кэша камеры может быть очищен системой — держим свою копию.
    final Directory base = await getApplicationDocumentsDirectory();
    final Directory photos = Directory('${base.path}/photos');
    if (!photos.existsSync()) await photos.create(recursive: true);
    final String path = '${photos.path}/$operationId.jpg';
    await File(path).writeAsBytes(bytes, flush: true);

    return CapturedPhoto(path: path, width: width, height: height, takenAt: DateTime.now());
  }

  @override
  Future<void> delete(String? path) async {
    if (path == null || path.isEmpty) return;
    final File file = File(path);
    if (file.existsSync()) await file.delete();
  }
}

final photoCaptureServiceProvider = Provider<PhotoCaptureService>((Ref ref) {
  return ImagePickerPhotoService();
});
