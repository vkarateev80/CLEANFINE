import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../shared/data/models/operator_models.dart';
import 'api_client.dart';
import 'service_providers.dart';

/// Метаданные плана этажа рядом с картинкой: `plans_dir/{floorId}.meta.json`.
///
/// Сам `Floor` в этой таблице не кэшируется (в DS-002 §3 таблицы этажей нет),
/// поэтому всё, что нужно для отрисовки без сети, лежит в метафайле.
class FloorPlanMeta {
  const FloorPlanMeta({
    required this.floorId,
    required this.number,
    required this.savedAt,
    this.planImageUrl,
    this.planWidth,
    this.planHeight,
  });

  final String floorId;
  final int number;
  final DateTime savedAt;
  final String? planImageUrl;
  final int? planWidth;
  final int? planHeight;

  FloorPlan toFloorPlan() => FloorPlan(
        id: floorId,
        number: number,
        planImageUrl: planImageUrl,
        planWidth: planWidth,
        planHeight: planHeight,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'floorId': floorId,
        'number': number,
        'savedAt': savedAt.toIso8601String(),
        if (planImageUrl != null) 'planImageUrl': planImageUrl,
        if (planWidth != null) 'planWidth': planWidth,
        if (planHeight != null) 'planHeight': planHeight,
      };

  static FloorPlanMeta? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? floorId = body['floorId']?.toString();
    if (floorId == null || floorId.isEmpty) return null;
    return FloorPlanMeta(
      floorId: floorId,
      number: int.tryParse(body['number']?.toString() ?? '') ?? 1,
      savedAt: DateTime.tryParse(body['savedAt']?.toString() ?? '') ?? DateTime.now(),
      planImageUrl: _text(body['planImageUrl']),
      planWidth: int.tryParse(body['planWidth']?.toString() ?? ''),
      planHeight: int.tryParse(body['planHeight']?.toString() ?? ''),
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// План этажа из файлового кэша: файл картинки и его метаданные.
class CachedFloorPlan {
  const CachedFloorPlan({required this.file, required this.meta});

  final File file;
  final FloorPlanMeta meta;

  FloorPlan get floor => meta.toFloorPlan();
}

/// Файловый кэш планов этажей (DS-002 `offline.md` §3):
/// `plans_dir/{floorId}.img` + `plans_dir/{floorId}.meta.json`.
///
/// Экран маршрута берёт план отсюда, когда сети нет; каждый успешный ответ
/// `GET /api/floors/:id` дописывает кэш.
class FloorPlanCache {
  FloorPlanCache({
    required ApiClient api,
    Future<Directory> Function()? documentsDirectory,
  })  : _api = api,
        _documentsDirectory = documentsDirectory ?? getApplicationDocumentsDirectory;

  /// Имя каталога задано спецификацией; фото лежат рядом, в `photos`
  /// (`photo_service.dart`) — расхождение зафиксировано в отчёте.
  static const String directoryName = 'plans_dir';

  final ApiClient _api;
  final Future<Directory> Function() _documentsDirectory;

  Future<Directory> plansDirectory() async {
    final Directory base = await _documentsDirectory();
    final Directory plans = Directory('${base.path}/$directoryName');
    if (!plans.existsSync()) await plans.create(recursive: true);
    return plans;
  }

  Future<File> imageFile(String floorId) async =>
      File('${(await plansDirectory()).path}/$floorId.img');

  Future<File> metaFile(String floorId) async =>
      File('${(await plansDirectory()).path}/$floorId.meta.json');

  /// План из кэша: `null`, если файла или метаданных нет.
  Future<CachedFloorPlan?> read(String floorId) async {
    final File image = await imageFile(floorId);
    final File meta = await metaFile(floorId);
    if (!image.existsSync() || !meta.existsSync()) return null;
    final FloorPlanMeta? parsed = FloorPlanMeta.tryParse(
      jsonDecode(await meta.readAsString()),
    );
    if (parsed == null) return null;
    return CachedFloorPlan(file: image, meta: parsed);
  }

  /// Только файл картинки: метаданные могут отсутствовать (кэш старой версии).
  Future<File?> cachedImage(String floorId) async {
    final File image = await imageFile(floorId);
    return image.existsSync() ? image : null;
  }

  /// Скачивание плана: сеть → `plans_dir`. `null` — скачать не удалось.
  Future<CachedFloorPlan?> download(FloorPlan plan) async {
    final String? url = plan.planImageUrl;
    if (url == null || url.isEmpty) return null;
    final Uint8List bytes;
    try {
      final Response<dynamic> response = await _api.get(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      final dynamic body = response.data;
      bytes = switch (body) {
        Uint8List value => value,
        List<int> value => Uint8List.fromList(value),
        _ => Uint8List(0),
      };
    } on Object {
      // Нет сети или файл недоступен: экран покажет план из кэша либо список точек.
      return null;
    }
    if (bytes.isEmpty) return null;
    // Запись на диск — вне try: сбой диска не должен выглядеть как «нет сети».
    return save(plan, bytes);
  }

  Future<CachedFloorPlan> save(FloorPlan plan, List<int> bytes) async {
    final File image = await imageFile(plan.id);
    await image.writeAsBytes(bytes, flush: true);
    final FloorPlanMeta meta = FloorPlanMeta(
      floorId: plan.id,
      number: plan.number,
      savedAt: DateTime.now(),
      planImageUrl: plan.planImageUrl,
      planWidth: plan.planWidth,
      planHeight: plan.planHeight,
    );
    final File metaFileHandle = await metaFile(plan.id);
    await metaFileHandle.writeAsString(jsonEncode(meta.toJson()), flush: true);
    return CachedFloorPlan(file: image, meta: meta);
  }

  /// Кэш → сеть: то, что нужно экрану маршрута при каждом открытии.
  ///
  /// Сначала отдаём файл из кэша (мгновенно, без сети), затем пробуем обновить
  /// его из сети. Если сети нет — остаётся кэш.
  Future<CachedFloorPlan?> ensure(FloorPlan plan, {bool online = true}) async {
    final CachedFloorPlan? cached = await read(plan.id);
    if (cached != null) return cached;
    final File? image = await cachedImage(plan.id);
    if (image != null) {
      // Картинка есть, метаданных нет: отдаём её с метаданными из ответа сети.
      return CachedFloorPlan(
        file: image,
        meta: FloorPlanMeta(
          floorId: plan.id,
          number: plan.number,
          savedAt: DateTime.now(),
          planImageUrl: plan.planImageUrl,
          planWidth: plan.planWidth,
          planHeight: plan.planHeight,
        ),
      );
    }
    if (!online) return null;
    return download(plan);
  }

  /// Очистка кэша планов — кнопка «Очистить кэш» в профиле.
  Future<void> clear() async {
    final Directory plans = await plansDirectory();
    if (plans.existsSync()) await plans.delete(recursive: true);
  }

  Future<int> sizeBytes() async {
    final Directory plans = await plansDirectory();
    return directorySize(plans);
  }
}

/// Размер каталога в байтах; отсутствующий каталог — 0.
Future<int> directorySize(Directory directory) async {
  if (!directory.existsSync()) return 0;
  int total = 0;
  await for (final FileSystemEntity entity in directory.list(recursive: true)) {
    if (entity is File) total += await entity.length();
  }
  return total;
}

final floorPlanCacheProvider = Provider<FloorPlanCache>((Ref ref) {
  return FloorPlanCache(api: ref.watch(coreApiProvider));
});
