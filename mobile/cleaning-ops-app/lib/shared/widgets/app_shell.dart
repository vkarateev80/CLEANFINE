import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
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

  static const List<_ShellTab> _tabs = <_ShellTab>[
    _ShellTab(AppRoutes.today, Icons.today_outlined, Icons.today, 'Сегодня', Key('shell_tab_today')),
    _ShellTab(
      AppRoutes.chats,
      Icons.chat_bubble_outline,
      Icons.chat_bubble,
      'Чаты',
      Key('shell_tab_chats'),
    ),
    _ShellTab(
      AppRoutes.profile,
      Icons.person_outline,
      Icons.person,
      'Профиль',
      Key('shell_tab_profile'),
    ),
  ];

  int _indexFor(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _tabs.indexWhere((tab) => location.startsWith(tab.path));
    return index < 0 ? 0 : index;
  }

  /// Ключ кнопки SOS зависит от экрана: их различают widget-тесты DS-002
  /// (`today_sos_button`, `chats_sos_button`, `profile_sos_button`).
  String _sosKey(BuildContext context) => switch (_indexFor(context)) {
        1 => 'chats_sos_button',
        2 => 'profile_sos_button',
        _ => 'today_sos_button',
      };

  @override
  Widget build(BuildContext context) {
    final index = _indexFor(context);
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
        onDestinationSelected: (value) => context.go(_tabs[value].path),
        destinations: _tabs
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
