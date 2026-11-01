import 'dart:convert';
import 'dart:typed_data';

/// Куда вести переход из встроенного браузера «CLEANFINE Админ».
enum AdminLinkAction { stay, openExternally }

/// Разделы сайта, которые не входят в админку: файлы (фото, PDF — встроенный
/// браузер Android их не показывает), API, рабочее место оператора и портал.
const List<String> _externalPaths = <String>['/minio', '/api', '/app', '/client'];

AdminLinkAction adminLinkAction(Uri target, Uri base) {
  if (target.scheme == 'about' || target.scheme == 'blob') return AdminLinkAction.stay;
  final bool sameOrigin = target.scheme == base.scheme && target.host == base.host && target.port == base.port;
  if (!sameOrigin) return AdminLinkAction.openExternally;
  final bool external = _externalPaths.any(
    (String prefix) => target.path == prefix || target.path.startsWith('$prefix/'),
  );
  return external ? AdminLinkAction.openExternally : AdminLinkAction.stay;
}

/// Имя JS-канала, по которому страница передаёт скачиваемый файл.
const String adminDownloadChannel = 'CleanfineDownload';

/// Выгрузки админки (CSV отчётов и экспликаций) — это `blob:`-ссылка с атрибутом
/// `download`, а встроенный браузер такие ссылки молча игнорирует. Скрипт
/// передаёт файл приложению. Blob помнит сам: страница отзывает ссылку сразу
/// после `click()`, и прочитать её по адресу уже нельзя.
const String adminDownloadScript = '''
(function () {
  if (window.__cleanfineDownloads) return;
  window.__cleanfineDownloads = true;
  var blobs = new Map();
  var createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (object) {
    var url = createObjectURL(object);
    if (object instanceof Blob) {
      blobs.set(url, object);
      if (blobs.size > 5) blobs.delete(blobs.keys().next().value);
    }
    return url;
  };
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var blob = this.download ? blobs.get(this.href) : null;
    if (!blob) return click.call(this);
    var name = this.download;
    var reader = new FileReader();
    reader.onload = function () {
      $adminDownloadChannel.postMessage(JSON.stringify({ name: name, dataUrl: reader.result }));
    };
    reader.readAsDataURL(blob);
  };
})();
''';

/// Файл, который страница отдала на сохранение.
class AdminDownload {
  const AdminDownload({required this.name, required this.mimeType, required this.bytes});

  final String name;
  final String mimeType;
  final Uint8List bytes;

  /// Сообщение канала `{name, dataUrl}`; `null` для нечитаемого.
  static AdminDownload? parse(String message) {
    try {
      final Object? decoded = jsonDecode(message);
      if (decoded is! Map<String, dynamic>) return null;
      final Object? name = decoded['name'];
      final Object? dataUrl = decoded['dataUrl'];
      if (name is! String || dataUrl is! String) return null;
      final int comma = dataUrl.indexOf(',');
      if (comma < 0 || !dataUrl.startsWith('data:')) return null;
      final String header = dataUrl.substring('data:'.length, comma);
      if (!header.endsWith(';base64')) return null;
      final String mimeType = header.split(';').first;
      final String safeName = name.replaceAll(RegExp(r'[/\\]'), '_').trim();
      return AdminDownload(
        name: safeName.isEmpty ? 'cleanfine-export' : safeName,
        mimeType: mimeType.isEmpty ? 'application/octet-stream' : mimeType,
        bytes: base64Decode(dataUrl.substring(comma + 1)),
      );
    } on FormatException {
      return null;
    }
  }
}
