<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: FRONTEND MOBILE
# 🤖 АГЕНТ: FRONTEND MOBILE

## 📋 Профиль агента

**Роль:** Mobile Developer (Flutter)  
**Ответственность:** Мобильное приложение (iOS/Android)  
**Рабочая директория:** `mobile/cleaning-ops-app/`  
**Технологии:** Flutter, Dart, Riverpod, go_router, drift, dio  
**Отчетность:** Frontend Lead

---

## 🎯 Цели

1. Мобильное приложение для операторов (толстый клиент)
2. Оффлайн-режим
3. GPS-трекинг
4. Фотофиксация
5. Чек-листы

---

## 📁 Структура проекта
mobile/cleaning-ops-app/
├── lib/
│ ├── main.dart # Точка входа
│ ├── app.dart # Корневой виджет
│ ├── core/
│ │ ├── constants/
│ │ │ ├── app_constants.dart
│ │ │ └── api_constants.dart
│ │ ├── theme/
│ │ │ ├── app_theme.dart
│ │ │ ├── app_colors.dart
│ │ │ └── app_typography.dart
│ │ ├── utils/
│ │ │ ├── validators.dart
│ │ │ └── formatters.dart
│ │ └── errors/
│ │ ├── failures.dart
│ │ └── exceptions.dart
│ ├── features/
│ │ ├── auth/
│ │ │ ├── data/
│ │ │ │ ├── models/
│ │ │ │ ├── repositories/
│ │ │ │ └── datasources/
│ │ │ ├── domain/
│ │ │ │ ├── entities/
│ │ │ │ └── repositories/
│ │ │ └── presentation/
│ │ │ ├── pages/
│ │ │ ├── widgets/
│ │ │ └── providers/
│ │ ├── home/
│ │ ├── route_map/
│ │ ├── checklist/
│ │ ├── sos/
│ │ ├── chat/
│ │ └── profile/
│ ├── shared/
│ │ ├── widgets/
│ │ └── models/
│ ├── router/
│ │ └── app_router.dart
│ ├── services/
│ │ ├── api_client.dart
│ │ ├── secure_storage_service.dart
│ │ ├── location_service.dart
│ │ └── camera_service.dart
│ └── database/
│ ├── app_database.dart
│ └── tables/
├── test/
├── android/
├── ios/
├── pubspec.yaml
└── analysis_options.yaml

text

---

## 📝 Инструкции по реализации

### 1. Инициализация

```bash
flutter create cleaning-ops-app --org com.cleaningops --platforms=android,ios
cd cleaning-ops-app

flutter pub add flutter_riverpod go_router dio drift sqlite3_flutter_libs flutter_secure_storage geolocator camera image_picker flutter_map local_auth firebase_messaging path_provider
flutter pub add -D drift_dev build_runner flutter_lints
2. API клиент
dart
// services/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  
  late final Dio dio;
  final _storage = const FlutterSecureStorage();
  
  ApiClient._internal() {
    dio = Dio(BaseOptions(
      baseUrl: ApiConstants.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));
    
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: 'access_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            final refreshed = await _refreshToken();
            if (refreshed) {
              // Повторить запрос
              return handler.resolve(await _retryRequest(error.requestOptions));
            } else {
              // Выход
              await _logout();
            }
          }
          return handler.next(error);
        },
      ),
    );
  }
}
3. Маршрутная карта
dart
// features/route_map/presentation/pages/route_map_page.dart
class RouteMapPage extends ConsumerWidget {
  const RouteMapPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final routeState = ref.watch(routeProvider);
    
    return Scaffold(
      appBar: AppBar(
        title: Text(routeState.route?.name ?? 'Маршрут'),
      ),
      body: InteractiveViewer(
        minScale: 0.5,
        maxScale: 3.0,
        child: Stack(
          children: [
            // План этажа
            Image.network(
              routeState.floorPlanUrl!,
              fit: BoxFit.contain,
            ),
            
            // Точки маршрута
            ...routeState.points.map((point) {
              return Positioned(
                left: point.coordsX,
                top: point.coordsY,
                child: RoutePointMarker(
                  point: point,
                  status: point.status,
                  isCurrent: point.id == routeState.currentPointId,
                ),
              );
            }),
          ],
        ),
      ),
      bottomNavigationBar: routeState.hasNext()
          ? ElevatedButton(
              onPressed: () => ref.read(routeProvider.notifier).nextPoint(),
              child: const Text('Следующая точка'),
            )
          : null,
    );
  }
}
4. Чек-лист
dart
// features/checklist/presentation/pages/checklist_page.dart
class ChecklistPage extends ConsumerStatefulWidget {
  const ChecklistPage({super.key, required this.roomId});
  
  final String roomId;

  @override
  ConsumerState<ChecklistPage> createState() => _ChecklistPageState();
}

class _ChecklistPageState extends ConsumerState<ChecklistPage> {
  @override
  Widget build(BuildContext context) {
    final checklistState = ref.watch(checklistProvider(widget.roomId));
    
    return Scaffold(
      appBar: AppBar(
        title: Text(checklistState.roomName ?? 'Чек-лист'),
      ),
      body: ListView.builder(
        itemCount: checklistState.operations.length,
        itemBuilder: (context, index) {
          final operation = checklistState.operations[index];
          
          return OperationTile(
            operation: operation,
            isCompleted: operation.isCompleted,
            isLocked: index > 0 && !checklistState.operations[index - 1].isCompleted,
            onComplete: () async {
              if (operation.requiresPhoto) {
                final photo = await _takePhoto(context);
                if (photo == null) return;
              }
              
              await ref.read(checklistProvider(widget.roomId).notifier)
                  .completeOperation(operation.id);
            },
            onTimerTick: (elapsed) {
              // Обновление таймера
            },
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton(
            onPressed: checklistState.allCompleted
                ? () => ref.read(checklistProvider(widget.roomId).notifier)
                    .completeRoom()
                : null,
            child: const Text('Завершить помещение'),
          ),
        ),
      ),
    );
  }
}
5. SOS
dart
// features/sos/presentation/pages/sos_page.dart
class SosPage extends ConsumerStatefulWidget {
  const SosPage({super.key});

  @override
  ConsumerState<SosPage> createState() => _SosPageState();
}

class _SosPageState extends ConsumerState<SosPage> {
  EmergencyType? _selectedType;
  File? _photo;
  final _descriptionController = TextEditingController();
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Аварийная заявка'),
        backgroundColor: Colors.red,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Тип аварии
            DropdownButtonFormField<EmergencyType>(
              value: _selectedType,
              decoration: const InputDecoration(
                labelText: 'Тип аварии',
                border: OutlineInputBorder(),
              ),
              items: EmergencyType.values.map((type) {
                return DropdownMenuItem(
                  value: type,
                  child: Text(type.label),
                );
              }).toList(),
              onChanged: (value) => setState(() => _selectedType = value),
            ),
            
            const SizedBox(height: 16),
            
            // Фото (обязательно)
            _photo == null
                ? OutlinedButton.icon(
                    onPressed: _takePhoto,
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Сделать фото (обязательно)'),
                  )
                : Image.file(_photo!, height: 200),
            
            const SizedBox(height: 16),
            
            // Описание
            TextField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Описание',
                border: OutlineInputBorder(),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Локация
            const ListTile(
              leading: Icon(Icons.location_on),
              title: Text('Локация'),
              subtitle: Text('Кухня, 3 этаж'),
            ),
            
            const Spacer(),
            
            // Кнопка SOS
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isSubmitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        '🚨 ОТПРАВИТЬ SOS',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_selectedType == null || _photo == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Выберите тип и сделайте фото')),
      );
      return;
    }
    
    setState(() => _isSubmitting = true);
    
    try {
      await ref.read(sosProvider.notifier).submitEmergency(
        type: _selectedType!,
        photo: _photo!,
        description: _descriptionController.text,
      );
      
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Заявка отправлена')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      setState(() => _isSubmitting = false);
    }
  }
}
6. Оффлайн-режим (Drift/SQLite)
dart
// database/app_database.dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';

part 'app_database.g.dart';

class LocalTickets extends Table {
  TextColumn get id => text()();
  TextColumn get type => text()();
  TextColumn get status => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();
  
  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [LocalTickets])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  
  @override
  int get schemaVersion => 1;
  
  static QueryExecutor _openConnection() {
    return NativeDatabase.memory();
  }
}
✅ Acceptance Criteria
□ Авторизация работает
□ PIN-код работает
□ Биометрия работает
□ Главный экран работает
□ Маршрутная карта работает
□ Чек-лист работает
□ SOS работает
□ Чат работает
□ Оффлайн-режим работает
□ GPS-трекинг работает
□ Фотофиксация работает
□ Производительность (60 FPS)
□ Батарея (оптимизация GPS)
