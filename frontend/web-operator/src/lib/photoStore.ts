/**
 * Хранилище фото для оффлайн-очереди (offline.md §5.3): Blob'ы в IndexedDB,
 * ключ — id записи очереди. localStorage для бинарных данных не подходит
 * (лимит ~5 МБ), поэтому отдельная база.
 */
const DB_NAME = 'cleanfine-operator';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступна'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB: ошибка открытия'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB: ошибка операции'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export function savePhoto(key: string, blob: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(blob, key)).then(() => undefined);
}

export function loadPhoto(key: string): Promise<Blob | null> {
  return run<Blob | undefined>('readonly', (store) => store.get(key)).then(
    (value) => value ?? null,
  );
}

export function deletePhoto(key: string): Promise<void> {
  return run('readwrite', (store) => store.delete(key)).then(() => undefined);
}

export function clearPhotos(): Promise<void> {
  return run('readwrite', (store) => store.clear()).then(() => undefined);
}
