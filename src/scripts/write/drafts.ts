// 쓰는 중인 글을 브라우저에 임시 저장한다. 글(속성·본문)은 localStorage, 붙여넣은 사진은 IndexedDB.
import type { Kind, Meta } from './post';

export interface Draft {
  kind: Kind;
  slug: string;
  meta: Meta;
  body: string;
  isNew: boolean; // 아직 저장소에 없는 글
  images: string[]; // 아직 올리지 않은 사진 파일 이름
  updatedAt: number;
}

const key = (kind: Kind, slug: string) => `write:draft:${kind}/${slug}`;

export function loadDraft(kind: Kind, slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(kind, slug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(key(d.kind, d.slug), JSON.stringify({ ...d, updatedAt: Date.now() }));
  } catch {
    /* 저장 공간이 없으면 임시 저장만 건너뛴다 */
  }
}

export function removeDraft(kind: Kind, slug: string) {
  try {
    localStorage.removeItem(key(kind, slug));
  } catch {
    /* noop */
  }
}

export function listDrafts(): Draft[] {
  const out: Draft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('write:draft:')) out.push(JSON.parse(localStorage.getItem(k)!));
    }
  } catch {
    /* noop */
  }
  return out;
}

// ---------- 사진 (IndexedDB) ----------
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('write-images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const store = (await db()).transaction('images', mode).objectStore('images');
  return new Promise<T>((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const putImage = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).catch(() => undefined);
export const getImage = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
export const deleteImage = (id: string) => tx('readwrite', (s) => s.delete(id)).catch(() => undefined);
