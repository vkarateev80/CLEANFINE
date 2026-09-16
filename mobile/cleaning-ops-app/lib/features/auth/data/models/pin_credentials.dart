/// Данные устройства, нужные для входа по PIN (`auth.md` §2, §9).
///
/// `POST /api/auth/pin` требует email **или** телефон (`PinLoginDto`), поэтому
/// после первого входа по паролю устройство запоминает их, а также длину PIN —
/// для автоотправки, когда все цифры введены (§4.3).
class PinCredentials {
  const PinCredentials({this.email, this.phone, this.length});

  final String? email;
  final String? phone;

  /// Длина установленного PIN; `null` — неизвестна (чужое или новое устройство),
  /// автоотправки в этом случае нет.
  final int? length;

  bool get isEmpty => !hasIdentity && length == null;

  bool get hasIdentity =>
      (email != null && email!.isNotEmpty) || (phone != null && phone!.isNotEmpty);
}
