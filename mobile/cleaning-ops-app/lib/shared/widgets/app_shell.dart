import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../features/admin/admin_texts.dart';
import '../../features/auth/data/models/auth_roles.dart';
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

  /// Вкладки каркаса: для ADMIN/SUPERVISOR между «Чаты» и «Профиль»
  /// появляется «Админ» (доска действий); оператор видит прежние три.
  static List<_ShellTab> _tabsFor(String? role) {
    final List<_ShellTab> tabs = <_ShellTab>[
      const _ShellTab(
          AppRoutes.today, Icons.today_outlined, Icons.today, 'Сегодня', Key('shell_tab_today')),
      const _ShellTab(
          AppRoutes.chats, Icons.chat_bubble_outline, Icons.chat_bubble, 'Чаты', Key('shell_tab_chats')),
    ];
    if (role == AuthRoles.admin || role == AuthRoles.supervisor) {
      tabs.add(const _ShellTab(AppRoutes.admin, Icons.dashboard_outlined, Icons.dashboard,
          AdminTexts.tabLabel, Key('shell_tab_admin')));
    }
    tabs.add(const _ShellTab(
        AppRoutes.profile, Icons.person_outline, Icons.person, 'Профиль', Key('shell_tab_profile')));
    return tabs;
  }

  int _indexFor(BuildContext context, List<_ShellTab> tabs) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = tabs.indexWhere((tab) => location.startsWith(tab.path));
    return index < 0 ? 0 : index;
  }

  /// Ключ кнопки SOS зависит от экрана: их различают widget-тесты DS-002
  /// (`today_sos_button`, `chats_sos_button`, `profile_sos_button`).
  String _sosKey(BuildContext context) {
    final String location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith(AppRoutes.chats)) return 'chats_sos_button';
    if (location.startsWith(AppRoutes.admin)) return 'admin_sos_button';
    if (location.startsWith(AppRoutes.profile)) return 'profile_sos_button';
    return 'today_sos_button';
  }

  @override
  Widget build(BuildContext context) {
    final SessionState session = ref.watch(sessionProvider);
    final List<_ShellTab> tabs = _tabsFor(session.role);
    final int index = _indexFor(context, tabs);
    // Индикатор непрочитанных на табе «Чаты» (`chat.md` §1.1). Счётчик не
    // запускает загрузку списка сам: он обновляется контроллером списка, иначе
    // запрос уходил бы с любого экрана каркаса.
    final int unread = ref.watch(chatUnreadBadgeProvider);
    return Scaffold(
      body: widget.child,
      floatingActionButton: FloatingActionButton.extended(
        key: Key(_sosKey(context)),
        onPressed: () => context.push(AppRoutes.sos),
        backgroundColor: Theme.of(context).colorScheme.error,
        foregroundColor: Theme.of(context).colorScheme.onError,
        icon: const Icon(Icons.emergency),
        label: const Text('SOS'),
      ),
      bottomNavigationBar: NavigationBar(
        key: const Key('shell_bottom_nav'),
        selectedIndex: index,
        onDestinationSelected: (value) => context.go(tabs[value].path),
        destinations: tabs
            .map(
              (tab) => NavigationDestination(
                key: tab.key,
                icon: _tabIcon(tab.icon, tab.path == AppRoutes.chats ? unread : 0),
                selectedIcon: _tabIcon(tab.selectedIcon, tab.path == AppRoutes.chats ? unread : 0),
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

class _ShellTab {
  const _ShellTab(this.path, this.icon, this.selectedIcon, this.label, this.key);

  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Key key;
}
