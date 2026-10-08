import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/data/models/auth_roles.dart';

/// Продукт — какое из приложений CLEANFINE собрано из этого кода.
///
/// Один код — несколько приложений: у каждого своё имя, bundle id, иконка,
/// набор вкладок и допустимые роли. Продукт выбирается точкой входа
/// (`main_operator.dart` / `main_team.dart`) или `--dart-define=APP_PRODUCT=…`
/// для сборок без отдельной точки входа (десктоп, лончеры).
///
/// * **operator** — «CLEANFINE Оператор»: смены, маршрут, чек-листы, SOS,
///   оффлайн, чаты. Роли OPERATOR, SUPERVISOR, ADMIN (бригадир с оператором
///   на объекте работает тем же приложением).
/// * **team** — «CLEANFINE Команда»: доска действий для бригадира и менеджера,
///   портал заказчика для клиента, чаты. Роли SUPERVISOR, ADMIN, CLIENT.
enum AppProduct {
  operator,
  team;

  /// Значение `--dart-define=APP_PRODUCT=operator|team`; по умолчанию оператор.
  static const String _defined = String.fromEnvironment('APP_PRODUCT', defaultValue: 'operator');

  static AppProduct fromEnvironment() => fromId(_defined) ?? AppProduct.operator;

  static AppProduct? fromId(String id) {
    for (final AppProduct product in AppProduct.values) {
      if (product.name == id.trim().toLowerCase()) return product;
    }
    return null;
  }
}

/// Вкладка нижнего таб-бара каркаса.
class ProductTab {
  const ProductTab({
    required this.route,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.key,
  });

  final String route;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Key key;
}

/// Настройки продукта: тексты, роли, маршруты, вкладки.
class ProductConfig {
  const ProductConfig._({
    required this.product,
    required this.title,
    required this.allowedRoles,
    required this.hasOperatorFeatures,
    required this.hasAdminBoard,
    required this.hasClientPortal,
    required this.tabs,
  });

  final AppProduct product;

  /// Название приложения (заголовок окна, подписи).
  final String title;

  /// Роли, которым разрешён вход именно в это приложение.
  final Set<String> allowedRoles;

  /// Экраны оператора: «Сегодня», маршрут, чек-лист, SOS, оффлайн, GPS-трекинг.
  final bool hasOperatorFeatures;

  /// Доска действий (ADMIN/SUPERVISOR).
  final bool hasAdminBoard;

  /// Портал заказчика (CLIENT).
  final bool hasClientPortal;

  /// Вкладки каркаса в порядке показа; роль может скрыть часть (`tabsFor`).
  final List<ProductTab> tabs;

  bool allows(String? role) => role != null && allowedRoles.contains(role);

  /// Куда вести после входа: оператора — на «Сегодня», команду — на доску,
  /// клиента — в портал.
  String startRouteFor(String? role) {
    if (hasOperatorFeatures) return ProductRoutes.today;
    if (role == AuthRoles.client && hasClientPortal) return ProductRoutes.client;
    return ProductRoutes.admin;
  }

  /// Вкладки для роли: доска — только ADMIN/SUPERVISOR, портал — только CLIENT.
  List<ProductTab> tabsFor(String? role) {
    final bool staff = role == AuthRoles.admin || role == AuthRoles.supervisor;
    return tabs.where((ProductTab tab) {
      if (tab.route == ProductRoutes.admin) return staff;
      if (tab.route == ProductRoutes.client) return role == AuthRoles.client;
      return true;
    }).toList(growable: false);
  }

  /// Текст отказа во входе: какое приложение нужно этой роли.
  String deniedMessage(String? role) {
    if (role == AuthRoles.client) {
      return product == AppProduct.operator
          ? 'Это приложение для операторов. Заказчику — приложение «CLEANFINE Команда» или портал.'
          : 'Роль не поддерживается этим приложением.';
    }
    if (role == AuthRoles.operator) {
      return 'Операторы входят через приложение «CLEANFINE Оператор».';
    }
    return 'Эта учётная запись не может войти в «$title».';
  }

  static ProductConfig of(AppProduct product) {
    switch (product) {
      case AppProduct.operator:
        return const ProductConfig._(
          product: AppProduct.operator,
          title: 'CLEANFINE Оператор',
          allowedRoles: <String>{AuthRoles.operator, AuthRoles.supervisor, AuthRoles.admin},
          hasOperatorFeatures: true,
          hasAdminBoard: false,
          hasClientPortal: false,
          tabs: <ProductTab>[
            ProductTab(
              route: ProductRoutes.today,
              icon: Icons.today_outlined,
              selectedIcon: Icons.today,
              label: 'Сегодня',
              key: Key('shell_tab_today'),
            ),
            ProductTab(
              route: ProductRoutes.chats,
              icon: Icons.chat_bubble_outline,
              selectedIcon: Icons.chat_bubble,
              label: 'Чаты',
              key: Key('shell_tab_chats'),
            ),
            ProductTab(
              route: ProductRoutes.profile,
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
              label: 'Профиль',
              key: Key('shell_tab_profile'),
            ),
          ],
        );
      case AppProduct.team:
        return const ProductConfig._(
          product: AppProduct.team,
          title: 'CLEANFINE Команда',
          allowedRoles: <String>{AuthRoles.supervisor, AuthRoles.admin, AuthRoles.client},
          hasOperatorFeatures: false,
          hasAdminBoard: true,
          hasClientPortal: true,
          tabs: <ProductTab>[
            ProductTab(
              route: ProductRoutes.admin,
              icon: Icons.dashboard_outlined,
              selectedIcon: Icons.dashboard,
              label: 'Доска',
              key: Key('shell_tab_admin'),
            ),
            ProductTab(
              route: ProductRoutes.client,
              icon: Icons.apartment_outlined,
              selectedIcon: Icons.apartment,
              label: 'Объект',
              key: Key('shell_tab_client'),
            ),
            ProductTab(
              route: ProductRoutes.chats,
              icon: Icons.chat_bubble_outline,
              selectedIcon: Icons.chat_bubble,
              label: 'Чаты',
              key: Key('shell_tab_chats'),
            ),
            ProductTab(
              route: ProductRoutes.profile,
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
              label: 'Профиль',
              key: Key('shell_tab_profile'),
            ),
          ],
        );
    }
  }
}

/// Пути, на которые ссылается конфигурация продукта. Дублируют константы
/// `AppRoutes` (router), чтобы `core` не зависел от роутера и его экранов.
class ProductRoutes {
  const ProductRoutes._();

  static const String today = '/today';
  static const String chats = '/chats';
  static const String profile = '/profile';
  static const String admin = '/admin';
  static const String client = '/client';
}

/// Текущий продукт. Точка входа `main_team.dart` переопределяет провайдер;
/// без переопределения продукт берётся из `APP_PRODUCT` (по умолчанию оператор).
final appProductProvider = Provider<ProductConfig>(
  (Ref ref) => ProductConfig.of(AppProduct.fromEnvironment()),
);
