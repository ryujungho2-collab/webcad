let database: Promise<IDBDatabase> | undefined;
export function projectDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned=false;
    const request = indexedDB.open("agent-webcad-storage-operations", 2);
    request.onupgradeneeded = () => {
      for (const name of ["undo", "documents"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onerror = () => { database = undefined; reject(request.error ?? Error("Project database could not open.")); };
    request.onblocked = () => { abandoned=true;database = undefined; reject(Error("Project storage upgrade is blocked. Close other windows and retry.")); };
    request.onsuccess = () => { const db = request.result;if(abandoned){db.close();return;} db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
  });
}
export async function projectDatabaseRequest<T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await projectDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? Error("Project storage transaction failed."));
    tx.onerror = () => {};
  });
}
