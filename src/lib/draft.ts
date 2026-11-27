import type { ProjectFile } from "./types"

// Draft autosave uses IndexedDB, not localStorage: project files embed base64
// screenshots and routinely exceed the ~5 MB localStorage quota. IndexedDB has
// no such practical ceiling and works from file:// in modern browsers.

const DB_NAME = "liubai-studio-drafts"
const STORE = "drafts"
const KEY = "current"
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("open failed"))
    request.onblocked = () => reject(new Error("open blocked"))
  }).catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

export async function saveDraft(data: ProjectFile): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(data, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("write failed"))
    tx.onabort = () => reject(tx.error ?? new Error("write aborted"))
  })
}

export async function loadDraft(): Promise<ProjectFile | null> {
  try {
    const db = await openDb()
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const request = tx.objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("read failed"))
    })
    if (!value || typeof value !== "object") return null
    const candidate = value as Partial<ProjectFile>
    if (candidate.app !== "liubai-screenshot-studio") return null
    return candidate as ProjectFile
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("delete failed"))
    })
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
