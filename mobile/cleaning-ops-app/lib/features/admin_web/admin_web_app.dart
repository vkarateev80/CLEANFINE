import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../../core/theme/app_theme.dart';
import 'admin_web_links.dart';

/// Адрес админки; для локального стенда — `--dart-define=ADMIN_WEB_URL=…`.
const String _adminWebUrl = String.fromEnvironment('ADMIN_WEB_URL', defaultValue: 'https://cleanfine.ru');

/// «CLEANFINE Админ» (решение владельца 01.11.2026): вся веб-админка в отдельном
/// приложении — тот же подход, что у десктопа `desktop/manager`. Вход, права и
/// экраны — на сайте; вход сохраняется между запусками в хранилище браузера.
/// Приложение добавляет то, чего встроенному браузеру не хватает: выбор файла
/// на Android, сохранение выгрузок, внешние ссылки, «назад» и экран ошибки связи.
class AdminWebApp extends StatelessWidget {
  const AdminWebApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CLEANFINE Админ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const AdminWebPage(),
    );
  }
}

class AdminWebPage extends StatefulWidget {
  const AdminWebPage({super.key});

  @override
  State<AdminWebPage> createState() => _AdminWebPageState();
}

class _AdminWebPageState extends State<AdminWebPage> {
  static final Uri _base = Uri.parse(_adminWebUrl);

  late final WebViewController _controller;
  int _progress = 0;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..addJavaScriptChannel(adminDownloadChannel, onMessageReceived: _onDownload)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            if (mounted) setState(() => _progress = progress);
          },
          onPageFinished: (String _) => _controller.runJavaScript(adminDownloadScript),
          onNavigationRequest: _onNavigationRequest,
          onWebResourceError: _onError,
        ),
      );
    final Object platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      // Без обработчика кнопка выбора файла на Android не делает ничего.
      platform.setOnShowFileSelector(_pickFiles);
      // Крупный шрифт телефона ломал бы вёрстку таблиц; масштаб остаётся жестом.
      platform.setTextZoom(100);
    }
    if (platform is WebKitWebViewController) {
      // На iPhone нет кнопки «назад» — привычный свайп от края экрана.
      platform.setAllowsBackForwardNavigationGestures(true);
    }
    _controller.loadRequest(_base);
  }

  Future<NavigationDecision> _onNavigationRequest(NavigationRequest request) async {
    final Uri? target = Uri.tryParse(request.url);
    if (!request.isMainFrame || target == null) return NavigationDecision.navigate;
    if (adminLinkAction(target, _base) == AdminLinkAction.stay) return NavigationDecision.navigate;
    await launchUrl(target, mode: LaunchMode.externalApplication);
    return NavigationDecision.prevent;
  }

  void _onError(WebResourceError error) {
    if (error.isForMainFrame != true) return;
    // Отменённый переход (ссылка ушла во внешний браузер) — не ошибка связи.
    const Set<int> cancelled = <int>{-999, 102, -3};
    if (cancelled.contains(error.errorCode)) return;
    if (mounted) setState(() => _failed = true);
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final List<PlatformFile> files = await FilePicker.pickFiles();
    final List<String> uris = files
        .map((PlatformFile file) => file.path)
        .whereType<String>()
        .map((String path) => Uri.file(path).toString())
        .toList();
    return params.mode == FileSelectorMode.openMultiple ? uris : uris.take(1).toList();
  }

  Future<void> _onDownload(JavaScriptMessage message) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final AdminDownload? download = AdminDownload.parse(message.message);
    if (download == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось сохранить файл')));
      return;
    }
    try {
      final Uri? saved = await FilePicker.saveFile(
        dialogTitle: 'Сохранить файл',
        fileName: download.name,
        bytes: download.bytes,
        mimeType: download.mimeType,
      );
      if (saved != null) messenger.showSnackBar(SnackBar(content: Text('Сохранено: ${download.name}')));
    } on Exception {
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось сохранить файл')));
    }
  }

  Future<void> _goBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  void _retry() {
    setState(() {
      _failed = false;
      _progress = 0;
    });
    _controller.loadRequest(_base);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? _) {
        if (!didPop) _goBack();
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: _failed
              ? _ConnectionError(onRetry: _retry)
              : Stack(
                  children: <Widget>[
                    WebViewWidget(controller: _controller),
                    if (_progress < 100) LinearProgressIndicator(value: _progress == 0 ? null : _progress / 100),
                  ],
                ),
        ),
      ),
    );
  }
}

class _ConnectionError extends StatelessWidget {
  const _ConnectionError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off_outlined, size: 48),
            const SizedBox(height: 16),
            Text('Нет связи с сервером', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text('Проверьте интернет и попробуйте ещё раз.', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}
