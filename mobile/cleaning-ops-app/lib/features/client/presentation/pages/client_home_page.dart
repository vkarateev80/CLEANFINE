import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/session_provider.dart';

/// Портал заказчика в приложении «CLEANFINE Команда» (роль CLIENT).
///
/// Первый шаг: экран-заглушка с планом разделов. Содержимое переносится из
/// веб-портала (`frontend/web-client`: статус объекта, заявки, отчёты, чат)
/// следующими итерациями; чат уже доступен вкладкой «Чаты».
class ClientHomePage extends ConsumerWidget {
  const ClientHomePage({super.key});

  static const String title = 'Мой объект';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SessionState session = ref.watch(sessionProvider);
    return Scaffold(
      key: const Key('client_home_page'),
      appBar: AppBar(title: const Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: <Widget>[
          Text(
            session.fullName == null || session.fullName!.isEmpty
                ? 'Здравствуйте!'
                : 'Здравствуйте, ${session.fullName}!',
            style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.sm),
          const Text(
            'Здесь будут статус вашего объекта, заявки и отчёты. '
            'Пока эти разделы доступны на портале cleanfine.ru/client, '
            'а переписка с менеджером — во вкладке «Чаты».',
            style: TextStyle(color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          const _PlannedSection(
              icon: Icons.apartment_outlined,
              title: 'Статус объекта',
              hint: 'уборки сегодня, последние отчёты'),
          const _PlannedSection(
              icon: Icons.assignment_outlined, title: 'Заявки', hint: 'создать заявку, следить за статусом'),
          const _PlannedSection(
              icon: Icons.insert_chart_outlined, title: 'Отчёты', hint: 'качество и объёмы за период'),
        ],
      ),
    );
  }
}

class _PlannedSection extends StatelessWidget {
  const _PlannedSection({required this.icon, required this.title, required this.hint});

  final IconData icon;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: ListTile(
        leading: Icon(icon, color: AppPalette.primary),
        title: Text(title),
        subtitle: Text(hint),
        trailing: const Chip(label: Text('скоро'), visualDensity: VisualDensity.compact),
      ),
    );
  }
}
