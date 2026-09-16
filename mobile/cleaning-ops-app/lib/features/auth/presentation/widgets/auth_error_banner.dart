import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

/// Блок ошибки экранов входа — один на экран (`auth.md` §4.1, §4.6).
///
/// Граница и иконка `danger500`, текст `danger600` `sizeSM`, `Semantics(liveRegion: true)` —
/// чтобы скринридер прочитал ошибку без перехода к ней.
class AuthErrorBanner extends StatelessWidget {
  const AuthErrorBanner({super.key, required this.message, this.textKey});

  final String message;

  /// Ключ текста: `login_error_text`, `pin_error_text`, `pin_setup_error_text`.
  final Key? textKey;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: const Color(AppColors.danger500)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Icon(Icons.error_outline, size: 20, color: Color(AppColors.danger500)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                message,
                key: textKey,
                style: const TextStyle(
                  fontFamily: AppTypography.fontSans,
                  fontSize: AppTypography.sizeSM,
                  color: Color(AppColors.danger600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
