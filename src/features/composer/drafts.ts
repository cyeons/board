import { readStore, writeStore } from "../../lib/identity";

export type DraftText = { title: string; body: string };

const textKey = (cardId: string, tab: string) => `board:draft:${cardId}:${tab}`;

export function loadDraftText(cardId: string, tab: string): DraftText | null {
  try {
    return JSON.parse(readStore(textKey(cardId, tab)) ?? "null") as DraftText | null;
  } catch {
    return null;
  }
}

export function saveDraftText(cardId: string, tab: string, draft: DraftText) {
  writeStore(textKey(cardId, tab), draft.title || draft.body ? JSON.stringify(draft) : null);
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("board-drafts", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 첨부 파일은 localStorage에 넣을 수 없어 IndexedDB에 둔다. 막힌 브라우저에서는 글만 임시 저장된다. */
export async function saveDraftFiles(cardId: string, tab: string, files: File[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      if (files.length) tx.objectStore("files").put(files, textKey(cardId, tab));
      else tx.objectStore("files").delete(textKey(cardId, tab));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 파일 임시 저장을 못 해도 글쓰기는 계속된다
  }
}

export async function loadDraftFiles(cardId: string, tab: string): Promise<File[]> {
  try {
    const db = await openDb();
    const files = await new Promise<File[]>((resolve, reject) => {
      const req = db.transaction("files").objectStore("files").get(textKey(cardId, tab));
      req.onsuccess = () => resolve((req.result as File[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return files;
  } catch {
    return [];
  }
}

export function clearDraft(cardId: string, tab: string) {
  writeStore(textKey(cardId, tab), null);
  void saveDraftFiles(cardId, tab, []);
}
