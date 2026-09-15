/**
 * Имя базы сервиса для точечной уборки SQL-ом.
 *
 * Локально базы называются по сервису (`cleaning_ops`, `cleaning_ops_gps`), а в CI
 * auth-база называется `cleaning_ops_e2e` — её создаёт service-контейнер postgres.
 * Из-за жёсткого `cleaning_ops` уборка в CI падала с
 * «database "cleaning_ops" does not exist». Поэтому имя берётся по цепочке:
 * env-override (`E2E_*_DB`) → имя из URL сервиса → локальный дефолт.
 */
export function dbNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const name = new URL(url).pathname.replace(/^\//, '');
    if (name) return name;
  } catch {
    // Пароль со слэшем и т.п. — `new URL` не разберёт, считаем имя строкой ниже.
  }
  const match = /^[a-z+]+:\/\/[^?]*\/([^/?]+)/i.exec(url);
  return match ? match[1] : undefined;
}
