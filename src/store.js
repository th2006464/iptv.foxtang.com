export const EMPTY_STATE = () => ({ version: 1, sources: [], channels: [], favorites: [], recent: [] });
const DB_NAME = 'fox-iptv-db';
const STORE = 'app';
let databasePromise;
function database() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('浏览器不支持 IndexedDB'));
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error || new Error('无法访问本地数据'));
    open.onsuccess = () => resolve(open.result);
  });
  return databasePromise;
}
async function transaction(mode, runner) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = runner(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('保存失败'));
    tx.onerror = () => reject(tx.error || new Error('本地数据库操作失败'));
    tx.onabort = () => reject(tx.error || new Error('本地数据库事务被取消'));
  });
}
export async function loadState() {
  const saved = await transaction('readonly', (store) => store.get('state'));
  return saved && saved.version === 1 ? saved : EMPTY_STATE();
}
export async function saveState(state) {
  await transaction('readwrite', (store) => store.put(state, 'state'));
}
export function appendSource(state, source, channels, replace = false) {
  const sources = replace ? state.sources.filter((s) => s.id !== source.id) : state.sources;
  const oldChannels = replace ? state.channels.filter((c) => c.sourceId !== source.id) : state.channels;
  const nextChannels = [...oldChannels, ...channels];
  const valid = new Set(nextChannels.map((c) => c.id));
  return {
    ...state,
    sources: [...sources, source],
    channels: nextChannels,
    favorites: state.favorites.filter((id) => valid.has(id)),
    recent: state.recent.filter((id) => valid.has(id))
  };
}
export function removeSource(state, id) {
  const channels = state.channels.filter((c) => c.sourceId !== id);
  const valid = new Set(channels.map((c) => c.id));
  return { ...state, channels, sources: state.sources.filter((s) => s.id !== id),
    favorites: state.favorites.filter((v) => valid.has(v)), recent: state.recent.filter((v) => valid.has(v)) };
}
export function recordRecent(state, id) {
  return { ...state, recent: [id, ...state.recent.filter((x) => x !== id)].slice(0, 20) };
}
export function toggleFavorite(state, id) {
  return { ...state, favorites: state.favorites.includes(id)
    ? state.favorites.filter((v) => v !== id) : [...state.favorites, id] };
}
