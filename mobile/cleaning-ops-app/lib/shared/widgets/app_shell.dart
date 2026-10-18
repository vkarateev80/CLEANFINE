import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_product.dart';
import '../../core/i18n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../features/auth/presentation/providers/session_provider.dart';
import '../../features/chat/presentation/providers/chat_providers.dart';
import '../../router/app_router.dart';
import '../../services/gps_tracking_service.dart';

/// Каркас авторизованной части приложения.
///
/// По DS-002 (`overview.md`, `README.md`) это нижний таб-бар («Сегодня», «Чаты»,
/// «Профиль») и постоянная кнопка SOS. С 17.10.2026 SOS — не плавающая кнопка,
/// а четвёртый пункт таб-бара (решение владельца): FAB ложилась поверх
/// «Отправить» в переписке, и даже спрятанная в открытом чате продолжала
/// мешать на старых сборках. Маршрут смены, чек-лист, SOS и оффлайн-экран —
/// полноэкранные маршруты вне shell.
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
    // SOS — аварийная заявка с объекта: есть только у приложения оператора.
    final bool withSos = product.hasOperatorFeatures;
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        key: const Key('shell_bottom_nav'),
        selectedIndex: index,
        onDestinationSelected: (value) {
          // SOS — полноэкранный маршрут вне каркаса: `push`, а не `go`, чтобы
          // после отправки вернуться на тот же экран; подсветка вкладки не
          // меняется.
          if (withSos && value == tabs.length) {
            context.push(AppRoutes.sos);
            return;
          }
          context.go(tabs[value].route);
        },
        destinations: <Widget>[
          for (final ProductTab tab in tabs)
            NavigationDestination(
              key: tab.key,
              icon: _tabIcon(tab.icon, tab.route == AppRoutes.chats ? unread : 0),
              selectedIcon: _tabIcon(tab.selectedIcon, tab.route == AppRoutes.chats ? unread : 0),
              label: tr(tab.label),
            ),
          if (withSos)
            NavigationDestination(
              key: const Key('shell_tab_sos'),
              icon: const _SosTabIcon(),
              label: 'SOS',
              tooltip: tr('Аварийная заявка SOS'),
            ),
        ],
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

/// Иконка пункта SOS: красная «таблетка», чтобы пункт читался как аварийная
/// кнопка, а не как обычная вкладка. Цвета заданы явно — `NavigationBar`
/// перекрашивает иконки под свою тему.
class _SosTabIcon extends StatelessWidget {
  const _SosTabIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      decoration: BoxDecoration(
        color: AppPalette.danger,
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Icon(Icons.emergency, color: Colors.white, size: 20),
    );
  }
}
