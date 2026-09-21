import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../providers/route_providers.dart';

/// План этажа с точками маршрута: `InteractiveViewer` + `Stack` по координатам
/// помещений (пиксели изображения плана) — как задано в `route_map.md` §3.
///
/// Картинка берётся из файлового кэша (`plans_dir/{floorId}.img`), если он есть:
/// так план открывается без сети. Сети нет и кэша нет — остаётся [Image.network],
/// который покажет заглушку «План этажа недоступен».
class RoutePlanView extends StatefulWidget {
  const RoutePlanView({
    super.key,
    required this.day,
    required this.transformationController,
    this.onPointTap,
  });

  final RouteDay day;
  final TransformationController transformationController;
  final void Function(RoutePointState point)? onPointTap;

  @override
  State<RoutePlanView> createState() => _RoutePlanViewState();
}

class _RoutePlanViewState extends State<RoutePlanView> {
  bool _planFailed = false;

  @override
  Widget build(BuildContext context) {
    final double width = (widget.day.floor?.width ?? 1000).toDouble();
    final double height = (widget.day.floor?.height ?? 1000).toDouble();

    return InteractiveViewer(
      transformationController: widget.transformationController,
      minScale: 0.5,
      maxScale: 3.0,
      boundaryMargin: const EdgeInsets.all(80),
      constrained: false,
      child: SizedBox(
        width: width,
        height: height,
        child: Stack(
          children: <Widget>[
            if (!_planFailed) _plan(width, height) else _PlanPlaceholder(width: width, height: height),
            for (final RoutePointState point in widget.day.points)
              if (point.point.hasCoords)
                Positioned(
                  left: (point.point.coordsX ?? 0).toDouble(),
                  top: (point.point.coordsY ?? 0).toDouble(),
                  child: _RoomOutline(point: point, isActive: point.status == RoutePointStatus.active),
                ),
            for (final RoutePointState point in widget.day.points)
              if (point.point.hasCoords)
                Positioned(
                  left: (point.point.coordsX ?? 0).toDouble() - 14,
                  top: (point.point.coordsY ?? 0).toDouble() - 14,
                  child: _PointMarker(
                    point: point,
                    onTap: () => widget.onPointTap?.call(point),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  /// Картинка плана: файл из кэша — приоритетно, иначе сеть.
  Widget _plan(double width, double height) {
    final String? cachedPath = widget.day.planFilePath;
    if (cachedPath != null && cachedPath.isNotEmpty) {
      return Image.file(
        File(cachedPath),
        key: const Key('route_floor_plan_image'),
        width: width,
        height: height,
        // `fill`, а не `contain`: иначе маркеры «уедут» относительно стен.
        fit: BoxFit.fill,
        errorBuilder: (BuildContext context, Object error, StackTrace? stack) =>
            _PlanPlaceholder(width: width, height: height),
      );
    }

    return Image.network(
      widget.day.floor!.planImageUrl!,
      key: const Key('route_floor_plan_image'),
      width: width,
      height: height,
      fit: BoxFit.fill,
      loadingBuilder: (BuildContext context, Widget child, ImageChunkEvent? progress) {
        if (progress == null) return child;
        return const Center(child: CircularProgressIndicator());
      },
      errorBuilder: (BuildContext context, Object error, StackTrace? stack) {
        // План не скачался: показываем подложку и список точек под ней.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && !_planFailed) setState(() => _planFailed = true);
        });
        return _PlanPlaceholder(width: width, height: height);
      },
    );
  }
}

class _PlanPlaceholder extends StatelessWidget {
  const _PlanPlaceholder({required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('route_plan_placeholder'),
      width: width,
      height: height,
      color: AppPalette.surfaceMuted,
      alignment: Alignment.center,
      child: const Text(
        'План этажа недоступен',
        style: TextStyle(color: AppPalette.textSecondary),
      ),
    );
  }
}

/// Тонкий контур области помещения; у активной точки — заливка `primary100`.
class _RoomOutline extends StatelessWidget {
  const _RoomOutline({required this.point, required this.isActive});

  final RoutePointState point;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final double? width = point.point.coordsWidth?.toDouble();
    final double? height = point.point.coordsHeight?.toDouble();
    if (width == null || height == null) return const SizedBox.shrink();
    return IgnorePointer(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: isActive ? AppPalette.primaryLight.withValues(alpha: 0.45) : null,
          border: Border.all(color: AppPalette.primary, width: 1),
        ),
      ),
    );
  }
}

/// Маркер точки: кружок 28 dp с номером и невидимый хитбокс 48×48.
class _PointMarker extends StatelessWidget {
  const _PointMarker({required this.point, required this.onTap});

  final RoutePointState point;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool isActive = point.status == RoutePointStatus.active;
    final Widget marker = Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: point.status.color,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: <BoxShadow>[
          BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        '${point.point.orderIndex + 1}',
        style: const TextStyle(
          fontSize: AppTypography.sizeXS,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );

    return Semantics(
      label: 'Точка ${point.point.orderIndex + 1}, ${point.point.title}, ${point.status.label}',
      button: true,
      container: true,
      // Номер внутри маркера — часть подписи, отдельным узлом он не нужен.
      excludeSemantics: true,
      child: GestureDetector(
        key: Key('route_point_marker_${point.point.id}'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Center(
            child: isActive
                // Текущая точка пульсирует, чтобы её было видно в перчатках.
                ? TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 1, end: 1.15),
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeInOut,
                    builder: (BuildContext context, double scale, Widget? child) =>
                        Transform.scale(scale: scale, child: child),
                    onEnd: () {},
                    child: marker,
                  )
                : marker,
          ),
        ),
      ),
    );
  }
}
