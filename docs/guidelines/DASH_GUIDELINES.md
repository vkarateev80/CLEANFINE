<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# ПРАВИЛА НАПИСАНИЯ КОДА В DASH
# 📐 ПРАВИЛА НАПИСАНИЯ КОДА В DASH

## Общие принципы

### 1. Структура файлов
dash_project/
├── lib/
│ ├── main.dart # Точка входа
│ ├── app.dart # Корневой виджет
│ ├── core/ # Ядро приложения
│ │ ├── constants/ # Константы
│ │ ├── theme/ # Тема
│ │ ├── utils/ # Утилиты
│ │ └── errors/ # Ошибки
│ ├── features/ # Фичи (feature-first)
│ │ ├── auth/ # Фича авторизации
│ │ │ ├── data/ # Данные
│ │ │ ├── domain/ # Домен
│ │ │ └── presentation/ # UI
│ │ ├── home/ # Главная
│ │ └── ...
│ └── shared/ # Общие компоненты

text

### 2. Именование

```dart
// Классы: PascalCase
class UserRepository {}

// Методы и переменные: camelCase
Future<User> getUserById(String userId) {}

// Константы: SCREAMING_SNAKE_CASE
const API_BASE_URL = 'https://api.example.com';

// Файлы: snake_case
user_repository.dart

// Виджеты: PascalCase с суффиксом
class UserCardWidget extends StatelessWidget {}
class LoginPage extends StatelessWidget {}
class SubmitButton extends StatelessWidget {}
3. State Management (Riverpod)
dart
// Провайдеры
final userProvider = StateProvider<User?>((ref) => null);

final userListProvider = FutureProvider<List<User>>((ref) async {
  final repository = ref.watch(userRepositoryProvider);
  return repository.getUsers();
});

// AsyncNotifierProvider для сложной логики
class TicketListNotifier extends AsyncNotifier<List<Ticket>> {
  @override
  Future<List<Ticket>> build() async {
    final repository = ref.watch(ticketRepositoryProvider);
    return repository.getTickets();
  }
  
  Future<void> createTicket(TicketDto dto) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(ticketRepositoryProvider);
      return repository.createTicket(dto);
    });
  }
}

final ticketListProvider = AsyncNotifierProvider<TicketListNotifier, List<Ticket>>(
  TicketListNotifier.new,
);
4. Обработка ошибок
dart
// Кастомные исключения
class NetworkException implements Exception {
  final String message;
  NetworkException(this.message);
}

class ValidationException implements Exception {
  final Map<String, String> errors;
  ValidationException(this.errors);
}

// Обработка в репозитории
Future<User> login(String email, String password) async {
  try {
    final response = await apiClient.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    
    return User.fromJson(response.data);
  } on DioException catch (e) {
    if (e.response?.statusCode == 401) {
      throw ValidationException({'auth': 'Неверный email или пароль'});
    }
    throw NetworkException('Ошибка сети');
  }
}
5. Работа с БД (Drift)
dart
// Таблицы
class Users extends Table {
  TextColumn get id => text()();
  TextColumn get email => text()();
  TextColumn get fullName => text()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime);
  
  @override
  Set<Column> get primaryKey => {id};
}

// DAO
@DriftAccessor(tables: [Users])
class UsersDao extends DatabaseAccessor<AppDatabase> with _$UsersDaoMixin {
  UsersDao(AppDatabase db) : super(db);
  
  Future<List<User>> getActiveUsers() {
    return (select(users)).get();
  }
  
  Future<void> insertUser(User user) {
    return into(users).insert(user);
  }
}
6. Тестирование
dart
// Unit-тест
void main() {
  group('UserRepository', () {
    late UserRepository repository;
    late MockApiClient mockApiClient;
    
    setUp(() {
      mockApiClient = MockApiClient();
      repository = UserRepository(mockApiClient);
    });
    
    test('login should return user on success', () async {
      when(mockApiClient.post('/auth/login', data: anyNamed('data')))
          .thenAnswer((_) async => Response(data: {'id': '1', 'email': 'test@test.com'}));
      
      final user = await repository.login('test@test.com', 'password');
      
      expect(user.email, 'test@test.com');
    });
  });
}

// Widget-тест
testWidgets('LoginPage should show error on invalid input', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(home: LoginPage()),
    ),
  );
  
  await tester.enterText(find.byKey(const Key('email_field')), 'invalid');
  await tester.tap(find.byKey(const Key('submit_button')));
  await tester.pump();
  
  expect(find.text('Введите корректный email'), findsOneWidget);
});
7. Производительность
dart
// Использовать const конструкторы
const SizedBox(height: 16);

// Избегать rebuild всего дерева
Consumer(builder: (context, ref, child) {
  final user = ref.watch(userProvider);
  return Column(
    children: [
      Text(user?.name ?? ''),
      child!, // Не перестраивается
    ],
  );
});

// Использовать ListView.builder для длинных списков
ListView.builder(
  itemCount: items.length,
  itemBuilder: (context, index) => ItemTile(item: items[index]),
);

// Ленивая загрузка изображений
Image.network(
  url,
  loadingBuilder: (context, child, progress) {
    if (progress == null) return child;
    return const CircularProgressIndicator();
  },
);
8. Безопасность
dart
// Безопасное хранение токенов
final storage = FlutterSecureStorage();
await storage.write(key: 'access_token', value: token);

// Не логировать чувствительные данные
debugPrint('User logged in'); // ✅
debugPrint('Token: $token'); // ❌

// Валидация данных
String? validateEmail(String? value) {
  if (value == null || value.isEmpty) return 'Email обязателен';
  if (!value.contains('@')) return 'Некорректный email';
  return null;
}
9. Документация
dart
/// Репозиторий для работы с пользователями.
/// 
/// Предоставляет методы для:
/// - Аутентификации
/// - Получения информации о пользователе
/// - Обновления профиля
class UserRepository {
  /// Выполняет вход пользователя в систему.
  /// 
  /// [email] - email пользователя
  /// [password] - пароль
  /// 
  /// Возвращает [User] при успешном входе.
  /// 
  /// Бросает [ValidationException] при неверных данных.
  /// Бросает [NetworkException] при проблемах с сетью.
  Future<User> login(String email, String password) async {
    // ...
  }
}
10. Git workflow
bash
# Создание ветки
git checkout -b feature/ticket-123-create-ticket

# Коммиты
git commit -m "feat: добавить создание заявки
- Реализовать форму создания заявки
- Добавить валидацию
- Написать тесты"

# Создание PR
gh pr create --title "feat: создание заявки" --body "Closes #123"
Чек-лист перед merge
□ Код отформатирован (dart format)
□ Линтер пройден (flutter analyze)
□ Тесты проходят (flutter test)
□ Документация обновлена
□ Code review пройден
□ Нет конфликтов с main
