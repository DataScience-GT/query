type HeldVote = {
  id: string;
  path: string;
  body: unknown;
};

const DB_NAME = "panel";
const STORE = "votes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function holdVote(body: { visitId?: string; eventId: string }) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      id: body.visitId ?? crypto.randomUUID(),
      path: "/v1/session/vote",
      body,
    } satisfies HeldVote);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function flushHeld(
  send: (path: string, body: unknown) => Promise<void>,
): Promise<number> {
  const db = await openDb();
  const rows = await new Promise<HeldVote[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as HeldVote[]);
    request.onerror = () => reject(request.error);
  });
  let sent = 0;
  for (const row of rows) {
    await send(row.path, row.body);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(row.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    sent += 1;
  }
  db.close();
  return sent;
}
