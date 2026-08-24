// 本地文件栏：File System Access API（Chromium）封装。
// 浏览器沙箱无法直接枚举用户磁盘（RustDesk 桌面版可以列 C:\ 等，Web 做不到），
// 只能通过系统选择器授权一个目录句柄后，在该目录内浏览/新建/删除/读写。
// 授权句柄存入 IndexedDB，下次会话「默认目录」可直接复用，无需重新选择。
// 非 Chromium 浏览器（Firefox/Safari）不支持本 API → 由 UI 层降级为只读浏览。

export type LocalEntry = {
  name: string;
  kind: "file" | "dir";
  size: number;         // 文件字节数；目录为 0
  modifiedTime: number; // epoch 秒；目录可能为 0
  handle: FileSystemHandle;
};

const DB_NAME = "sundesk-localfs";
const DB_VERSION = 1;
const STORE = "handles";
const KEY = "root";

let rootHandle: FileSystemDirectoryHandle | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function saveRootHandle(h: FileSystemDirectoryHandle) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(h, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[sundesk] save local handle failed", e);
  }
}

async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const h = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return h || null;
  } catch (e) {
    return null;
  }
}

export function isLocalFSSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === "function";
}

/** 用户授权选择本地文件夹（系统选择器，需用户手势触发）。返回是否成功。 */
export async function pickRootDir(): Promise<boolean> {
  if (!isLocalFSSupported()) return false;
  try {
    const picked = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    if (!picked) return false;
    rootHandle = picked as FileSystemDirectoryHandle;
    await saveRootHandle(rootHandle);
    return true;
  } catch (e) {
    console.warn("[sundesk] pick local dir cancelled/failed", e);
    return false;
  }
}

/** 取根目录句柄：优先内存，其次 IndexedDB 持久化句柄（自动确认读写权限）。 */
export async function getRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (rootHandle) return rootHandle;
  const h = await loadRootHandle();
  if (h) {
    try {
      const perm = await (h as any).queryPermission({ mode: "readwrite" });
      if (perm === "granted") rootHandle = h;
    } catch (e) {
      console.warn("[sundesk] query local handle permission failed", e);
    }
  }
  return rootHandle;
}

/** 按路径（name 数组，空 = 根）逐级取目录句柄 */
async function resolveDir(
  handle: FileSystemDirectoryHandle,
  path: string[]
): Promise<FileSystemDirectoryHandle> {
  let cur = handle;
  for (const seg of path) {
    cur = await cur.getDirectoryHandle(seg);
  }
  return cur;
}

/** 列出目录内容 */
export async function listDir(
  handle: FileSystemDirectoryHandle,
  path: string[]
): Promise<LocalEntry[]> {
  const dir = await resolveDir(handle, path);
  const out: LocalEntry[] = [];
  for await (const [name, h] of (dir as any).entries()) {
    if (h.kind === "file") {
      const fh = h as FileSystemFileHandle;
      let size = 0, mt = 0;
      try {
        const f = await fh.getFile();
        size = f.size;
        mt = Math.floor(f.lastModified / 1000);
      } catch (e) {
        // 文件被删/无权限：按 0 处理
      }
      out.push({ name, kind: "file", size, modifiedTime: mt, handle: h });
    } else {
      out.push({ name, kind: "dir", size: 0, modifiedTime: 0, handle: h });
    }
  }
  return out;
}

/** 在当前目录下新建文件夹 */
export async function mkdir(
  handle: FileSystemDirectoryHandle,
  path: string[],
  name: string
): Promise<boolean> {
  try {
    const dir = await resolveDir(handle, path);
    await dir.getDirectoryHandle(name, { create: true });
    return true;
  } catch (e) {
    console.warn("[sundesk] local mkdir failed", e);
    return false;
  }
}

/** 删除条目（目录递归删除；Chrome 支持 removeEntry recursive） */
export async function removeEntry(
  handle: FileSystemDirectoryHandle,
  path: string[],
  name: string,
  kind: "file" | "dir"
): Promise<boolean> {
  try {
    const dir = await resolveDir(handle, path);
    await dir.removeEntry(name, { recursive: kind === "dir" });
    return true;
  } catch (e) {
    console.warn("[sundesk] local remove failed", e);
    return false;
  }
}

/** 读取文件内容（上传用） */
export async function readFile(
  handle: FileSystemDirectoryHandle,
  path: string[]
): Promise<Uint8Array> {
  const dir = await resolveDir(handle, path.slice(0, -1));
  const fh = await dir.getFileHandle(path[path.length - 1]);
  const f = await fh.getFile();
  return new Uint8Array(await f.arrayBuffer());
}

/** 写入文件（接收下载用，自动创建父目录与文件） */
export async function writeFile(
  handle: FileSystemDirectoryHandle,
  path: string[],
  data: Uint8Array
): Promise<boolean> {
  try {
    let dir = handle;
    for (const seg of path.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
    const fh = await dir.getFileHandle(path[path.length - 1], { create: true });
    const w = await (fh as any).createWritable();
    await w.write(data);
    await w.close();
    return true;
  } catch (e) {
    console.warn("[sundesk] local write failed", e);
    return false;
  }
}
