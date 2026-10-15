import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_product.dart';
import '../../core/theme/app_colors.dart';
import '../../features/auth/presentation/providers/session_provider.dart';
import '../../features/chat/presentation/providers/chat_providers.dart';
import '../../router/app_router.dart';
import '../../services/gps_tracking_service.dart';

/// Каркас авторизованной части приложения.
///
/// По DS-002 (`overview.md`, `README.md`) это нижний таб-бар из **трёх** пунктов
/// («Сегодня», «Чаты», «Профиль») и постоянная кнопка SOS поверх него.
/// Маршрут смены, чек-лист, SOS и оффлайн-экран — полноэкранные маршруты вне shell.
///
/// Каркас также владеет GPS-трекингом (М6.6): пока оператор в приложении, точки
/// копятся в буфере и уходят батчами; вне смены трекер ставит себя на паузу.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  /// Ссылка на трекер: в `dispose` читать провайдер уже нельзя (контейнер гаснет).
  GpsTrackerController? _tracker;

  @override
  void initState() {
    super.initState();
    // GPS-трекинг — только в приложении оператора: у «Команды» нет смен,
    // и трекер там не нужен ни по смыслу, ни по батарее.
    if (!ref.read(appProductProvider).hasOperatorFeatures) return;
    _tracker = ref.read(gpsTrackerProvider.notifier);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _tracker?.start();
    });
  }

  @override
  void dispose() {
    // Провайдер останавливает трекер и через `ref.onDispose`; здесь — на случай
    // выхода из аккаунта, когда каркас снимается, а контейнер ещё жив.
    _tracker?.stop();
    super.dispose();
  }

  /// Вкладки каркаса задаёт продукт (`ProductConfig.tabs`) и роль
  /// (`tabsFor`): оператор — «Сегодня», «Чаты», «Профиль»; команда — «Доска»
  /// для ADMIN/SUPERVISOR или «Объект» для CLIENT, затем «Чаты», «Профиль».
  int _indexFor(BuildContext context, List<ProductTab> tabs) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = tabs.indexWhere((tab) => location.startsWith(tab.route));
    return index < 0 ? 0 : index;
  }

  /// Ключ кнопки SOS зависит от экрана: их различают widget-тесты DS-002
  /// (`today_sos_button`, `chats_sos_button`, `profile_sos_button`).
  String _sosKey(BuildContext context) {
    final String location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith(AppRoutes.chats)) return 'chats_sos_button';
    if (location.startsWith(AppRoutes.admin)) return 'admin_sos_button';
    if (location.startsWith(AppRoutes.client)) return 'client_sos_button';
    if (location.startsWith(AppRoutes.profile)) return 'profile_sos_button';
    return 'today_sos_button';
  }

  /// В открытой переписке (`/chats/<id>`) плавающая SOS легла бы поверх кнопки
  /// «Отправить» в поле ввода — там её нет, она остаётся в списке чатов.
  bool _showSos(BuildContext context) {
    final String location = GoRouterState.of(context).matchedLocation;
    return !location.startsWith('${AppRoutes.chats}/');
  }

  @override
  Widget build(BuildContext context) {
    final SessionState session = ref.watch(sessionProvider);
    final ProductConfig product = ref.watch(appProductProvider);
    final List<ProductTab> tabs = product.tabsFor(session.role);
    final int index = _indexFor(context, tabs);
    // Индикатор непрочитанных на табе «Чаты» (`chat.md` §1.1). Счётчик не
    // запускает загрузку списка сам: он обновляется контроллером списка, иначе
    // запрос уходил бы с любого экрана каркаса.
    final int unread = ref.watch(chatUnreadBadgeProvider);
    return Scaffold(
      body: widget.child,
      // SOS — аварийная заявка с объекта: есть только у приложения оператора.
      floatingActionButton: product.hasOperatorFeatures && _showSos(context)
          ? FloatingActionButton.extended(
              key: Key(_sosKey(context)),
              onPressed: () => context.push(AppRoutes.sos),
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
              icon: const Icon(Icons.emergency),
              label: const Text('SOS'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        key: const Key('shell_bottom_nav'),
        selectedIndex: index,
        onDestinationSelected: (value) => context.go(tabs[value].route),
        destinations: tabs
            .map(
              (tab) => NavigationDestination(
                key: tab.key,
                icon: _tabIcon(tab.icon, tab.route == AppRoutes.chats ? unread : 0),
                selectedIcon: _tabIcon(tab.selectedIcon, tab.route == AppRoutes.chats ? unread : 0),
                label: tab.label,
              ),
            )
            .toList(),
      ),
    );
  }
}

/// Иконка таба со счётчиком непрочитанных: `Badge` с числом (`chat.md` §6).
Widget _tabIcon(IconData icon, int count) {
  if (count <= 0) return Icon(icon);
  return Badge(
    key: const Key('shell_tab_chats_badge'),
    backgroundColor: AppPalette.primary,
    textColor: Colors.white,
    label: Text('$count'),
    child: Icon(icon),
  );
}
