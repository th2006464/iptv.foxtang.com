import { parseM3U, makeManualChannel, safeHttpUrl, MAX_IMPORT_BYTES } from './playlist.js';
import { EMPTY_STATE, loadState, saveState, appendSource, removeSource, toggleFavorite, recordRecent } from './store.js';
import { PlayerController } from './player.js';
import { PUBLIC_SOURCE, PUBLIC_SOURCE_ID, PUBLIC_BOOTSTRAP_FLAG, getPublicChannels } from './public-catalog.js';
import { GITHUB_PLAYLISTS } from './github-sources.js';

const $ = (selector, root = document) => root.querySelector(selector);
const settingsKey = 'fox-iptv-settings-v1';
let prefs = { theme: 'dark', logos: false, volume: 0.8, muted: false };
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
  if (['dark', 'light'].includes(saved.theme)) prefs.theme = saved.theme;
  if (typeof saved.logos === 'boolean') prefs.logos = saved.logos;
  if (typeof saved.volume === 'number') prefs.volume = Math.max(0, Math.min(1, saved.volume));
  if (typeof saved.muted === 'boolean') prefs.muted = saved.muted;
} catch { /* Bad preferences must not break startup. */ }
let state = EMPTY_STATE();
let ui = { filter: 'all', group: 'all', source: 'all', search: '', selected: null, visible: 150, pending: null, importMode: 'file' };
let canPersist = true;
let noticeTimeout;
const video = $('#video');
video.volume = prefs.volume;
video.muted = prefs.muted;
const controller = new PlayerController(video, updatePlayback);
function notify(message, kind = 'info') {
  const n = $('#notice'); n.textContent = message; n.dataset.kind = kind; n.hidden = false;
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => { n.hidden = true; }, 6000);
}
function updatePlayback(status, message) {
  $('#statusText').textContent = message;
  $('#statusDot').className = 'state-dot ' + status;
  $('#playBtn').textContent = status === 'playing' ? 'Ⅱ' : '▶';
}
function savePrefs() {
  try { localStorage.setItem(settingsKey, JSON.stringify(prefs)); }
  catch { notify('浏览器未允许保存界面偏好', 'warn'); }
}
function theme() {
  document.documentElement.dataset.theme = prefs.theme;
  $('#themeBtn').textContent = prefs.theme === 'dark' ? '☀ 浅色' : '☾ 深色';
}
async function commit(next) {
  if (canPersist) {
    try { await saveState(next); }
    catch { canPersist = false; notify('本地存储不可用；修改只在当前页面有效', 'error'); }
  }
  state = next; render();
}
function activeChannels() {
  const enabled = new Set(state.sources.filter((s) => s.enabled).map((s) => s.id));
  return state.channels.filter((c) => enabled.has(c.sourceId));
}
function visibleChannels() {
  let channels = activeChannels();
  if (ui.filter === 'favorites') channels = channels.filter((c) => state.favorites.includes(c.id));
  if (ui.filter === 'recent') {
    const order = new Map(state.recent.map((id, i) => [id, i]));
    channels = channels.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  }
  if (ui.source !== 'all') channels = channels.filter((c) => c.sourceId === ui.source);
  if (ui.group !== 'all') channels = channels.filter((c) => c.group === ui.group);
  const search = ui.search.toLocaleLowerCase();
  if (search) channels = channels.filter((c) => (c.name + ' ' + c.group).toLocaleLowerCase().includes(search));
  return channels;
}
function node(type, className, label) {
  const el = document.createElement(type);
  if (className) el.className = className;
  if (label !== undefined) el.textContent = label;
  return el;
}
function renderSources() {
  const select = $('#sourceFilter'), current = ui.source;
  select.replaceChildren(new Option('全部来源', 'all'));
  for (const source of state.sources) select.add(new Option((source.enabled ? '' : '⏸ ') + source.name, source.id));
  if (current !== 'all' && !state.sources.some((s) => s.id === current)) ui.source = 'all';
  select.value = ui.source;
}
function renderGroups() {
  const counts = new Map();
  for (const c of activeChannels()) {
    if (ui.source !== 'all' && c.sourceId !== ui.source) continue;
    counts.set(c.group, (counts.get(c.group) || 0) + 1);
  }
  const target = $('#groups'); target.replaceChildren();
  for (const [name, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 32)) {
    const btn = node('button', 'group-pill' + (ui.group === name ? ' active' : ''));
    btn.type = 'button'; btn.title = name;
    btn.append(node('span', 'truncate', name), node('small', '', String(count)));
    btn.addEventListener('click', () => { ui.group = ui.group === name ? 'all' : name; ui.visible = 150; render(); });
    target.append(btn);
  }
  if (!counts.has(ui.group)) ui.group = 'all';
  if (!counts.size) target.append(node('div', 'sidebar-hint', '导入后会自动显示频道分组'));
}
function renderList() {
  const filtered = visibleChannels(), list = $('#channelList');
  list.replaceChildren();
  for (const channel of filtered.slice(0, ui.visible)) {
    const row = node('div', 'channel-row' + (ui.selected === channel.id ? ' selected' : ''));
    const main = node('button', 'channel-main'); main.type = 'button'; main.title = channel.name;
    const thumb = node('span', 'channel-thumb', channel.name.slice(0, 2).toUpperCase());
    if (prefs.logos && channel.logo) {
      const img = document.createElement('img'); img.src = channel.logo; img.alt = '';
      img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove();
      thumb.append(img);
    }
    const info = node('span', 'channel-info');
    info.append(node('span', 'channel-title', channel.name), node('small', 'channel-group', channel.group));
    main.append(thumb, info);
    main.addEventListener('click', () => selectChannel(channel.id, true));
    const starred = state.favorites.includes(channel.id);
    const star = node('button', 'channel-star' + (starred ? ' is-starred' : ''), starred ? '★' : '☆');
    star.type = 'button'; star.title = '切换收藏'; star.setAttribute('aria-label', '收藏 ' + channel.name);
    star.addEventListener('click', () => commit(toggleFavorite(state, channel.id)));
    row.append(main, star); list.append(row);
  }
  if (!filtered.length) {
    const empty = node('div', 'list-empty');
    empty.append(node('span', 'empty-icon', state.channels.length ? '⌕' : '＋'),
      node('strong', '', state.channels.length ? '没有匹配的频道' : '还没有播放列表'),
      node('p', '', state.channels.length ? '试试更改搜索或筛选条件' : '导入 M3U 清单即可开始'));
    if (!state.channels.length) {
      const b = node('button', 'btn secondary', '导入 M3U');
      b.addEventListener('click', openImport); empty.append(b);
    }
    list.append(empty);
  }
  $('#loadMore').hidden = filtered.length <= ui.visible;
  $('#visibleCount').textContent = filtered.length.toLocaleString();
}
function renderCurrent() {
  const channel = state.channels.find((c) => c.id === ui.selected);
  $('#pageTitle').textContent = channel ? channel.name : '你的私人直播空间';
  $('#pageSubtitle').textContent = channel ? '频道分组 · ' + channel.group : '选择公共频道，或从 GitHub 频道库导入更多直播清单。';
  $('#currentName').textContent = channel ? channel.name : '尚未选择频道';
  $('#currentGroup').textContent = channel ? channel.group : '添加你有权观看的直播源';
  $('#videoEmpty').hidden = Boolean(channel);
  $('#favBtn').textContent = channel && state.favorites.includes(channel.id) ? '★' : '☆';
  $('#favBtn').disabled = !channel;
  for (const id of ['prevBtn', 'nextBtn', 'playBtn', 'retryBtn', 'pipBtn', 'fullBtn']) $('#' + id).disabled = !channel;
  const select = $('#lineSelect'), current = select.value;
  select.replaceChildren();
  if (channel) {
    channel.streams.forEach((stream, i) => select.add(new Option((stream.label || '线路 ' + (i + 1)) + ' · ' + stream.kind.toUpperCase(), String(i))));
    if ([...select.options].some((o) => o.value === current)) select.value = current;
    select.disabled = channel.streams.length < 2;
  } else { select.add(new Option('无可用线路', '')); select.disabled = true; }
}
function render() {
  const enabled = activeChannels();
  $('#topCount').textContent = enabled.length.toLocaleString() + ' 个频道';
  $('#libraryCount').textContent = String(enabled.length);
  $('#allCount').textContent = String(enabled.length);
  $('#favCount').textContent = String(state.favorites.length);
  $('#recentCount').textContent = String(state.recent.length);
  $('#statChannels').textContent = enabled.length.toLocaleString();
  $('#statFav').textContent = String(state.favorites.length);
  $('#statSources').textContent = String(state.sources.length);
  for (const btn of $('#filters').querySelectorAll('[data-filter]')) btn.classList.toggle('active', btn.dataset.filter === ui.filter);
  renderSources(); renderGroups(); renderList(); renderCurrent();
}
async function selectChannel(id, autoplay) {
  const channel = state.channels.find((c) => c.id === id);
  if (!channel) return;
  if (ui.selected !== id) {
    ui.selected = id; controller.reset(); $('#lineSelect').value = '0';
    updatePlayback('idle', '已选择频道，点击播放');
  }
  history.replaceState(null, '', location.pathname + '?ch=' + encodeURIComponent(id));
  await commit(recordRecent(state, id));
  if (autoplay) playSelected();
}
function playSelected() {
  const channel = state.channels.find((c) => c.id === ui.selected);
  if (!channel) return;
  const stream = channel.streams[Number($('#lineSelect').value) || 0] || channel.streams[0];
  if (stream) controller.load(stream);
}
function adjacentChannel(step) {
  const channels = visibleChannels();
  if (!channels.length) return;
  const current = channels.findIndex((c) => c.id === ui.selected);
  const next = (current + step + channels.length) % channels.length;
  selectChannel(channels[next].id, true);
}
function openModal(markup) {
  $('#modalBody').innerHTML = markup; // Only static, hard-coded templates are passed here.
  $('#modal').hidden = false; $('#modalClose').focus();
}
function closeModal() { $('#modal').hidden = true; ui.pending = null; }
function sourceRow(source) {
  const row = node('div', 'source-row'), info = node('div', 'source-info');
  info.append(node('strong', '', source.name), node('small', '', state.channels.filter((c) => c.sourceId === source.id).length + ' 个频道 · ' + ({ remote: 'HTTPS 订阅', paste: '粘贴文本', file: '本地文件', manual: '手动添加', builtin: '默认公共频道 · 第三方来源' }[source.type] || source.type)));
  const buttons = node('div', 'source-actions');
  const toggle = node('button', 'btn small subtle', source.enabled ? '停用' : '启用');
  toggle.addEventListener('click', async () => {
    await commit({ ...state, sources: state.sources.map((s) => s.id === source.id ? { ...s, enabled: !s.enabled } : s) }); openManage();
  });
  buttons.append(toggle);
  if (source.type === 'remote' && source.sourceUrl) {
    const refresh = node('button', 'btn small subtle', '更新');
    refresh.addEventListener('click', async () => {
      openImport(); ui.importMode = 'url'; changeImportMode();
      $('#importUrl').value = source.sourceUrl;
      await prepareImport({ mode: 'url', url: source.sourceUrl, replaceSource: source });
    });
    buttons.append(refresh);
  }
  const del = node('button', 'btn small danger', '删除');
  del.addEventListener('click', async () => {
    if (!confirm('确认删除“' + source.name + '”及其全部频道？其他来源不受影响。')) return;
    if (ui.selected && state.channels.some((c) => c.id === ui.selected && c.sourceId === source.id)) {
      ui.selected = null; controller.reset(); updatePlayback('idle', '已移除当前频道');
      history.replaceState(null, '', location.pathname);
    }
    await commit(removeSource(state, source.id)); openManage();
  });
  buttons.append(del); row.append(info, buttons);
  return row;
}
function openManage() {
  openModal('<div class="modal-eyebrow">MY SOURCES</div><h2>播放源管理</h2><p class="modal-lead">数据仅保存在当前浏览器，停用来源不会删除频道。</p><div id="sourceRows" class="source-rows"></div><div class="settings-row"><div><strong>外部频道图标</strong><small>默认关闭，开启后浏览器将直接请求图标站点</small></div><label class="switch"><input id="logoToggle" type="checkbox"><span></span></label></div><div class="manage-actions"><button class="btn secondary" id="backupBtn">↓ 导出私人备份</button><button class="btn secondary" id="restoreBtn">↑ 导入备份</button><button class="btn secondary" id="githubManageBtn">◈ GitHub 频道库</button><button class="btn primary" id="addSourceBtn">＋ 添加频道源</button></div><p class="security-note">备份可能包含访问令牌的私人播放地址，请勿提交到 GitHub 或分享。</p>');
  const rows = $('#sourceRows');
  for (const source of state.sources) rows.append(sourceRow(source));
  if (!state.sources.length) rows.append(node('p', 'muted', '暂无来源，点击添加频道源开始。'));
  $('#logoToggle').checked = prefs.logos;
  $('#logoToggle').addEventListener('change', (e) => { prefs.logos = e.target.checked; savePrefs(); renderList(); });
  $('#backupBtn').addEventListener('click', exportBackup);
  $('#restoreBtn').addEventListener('click', openRestore);
  $('#addSourceBtn').addEventListener('click', openImport);
  $('#githubManageBtn').addEventListener('click', openGitHubLibrary);
}
function changeImportMode() {
  for (const btn of document.querySelectorAll('[data-import]')) btn.classList.toggle('active', btn.dataset.import === ui.importMode);
  for (const pane of document.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== ui.importMode;
  $('#importPreview').hidden = true; ui.pending = null;
}
function openImport() {
  ui.importMode = 'file';
  openModal('<div class="modal-eyebrow">ADD PLAYLIST</div><h2>导入你的私人频道</h2><p class="modal-lead">仅导入你有权观看的频道，播放地址不上传到本站服务器。</p><div class="tabbar"><button data-import="file" class="active">本地文件</button><button data-import="paste">粘贴 M3U</button><button data-import="url">订阅 URL</button><button data-import="manual">单个频道</button></div><div class="import-form"><div data-pane="file"><label class="dropzone"><span class="upload-symbol">⇧</span><strong>选择 .m3u / .txt 文件</strong><small>仅浏览器解析 · 最大 20 MB</small><input type="file" id="importFile" accept=".m3u,.m3u8,.txt,text/plain,application/x-mpegURL"></label></div><div data-pane="paste" hidden><label class="form-label">M3U 清单文本<textarea id="importText" rows="7" placeholder="#EXTM3U&#10;#EXTINF:-1,示例频道&#10;https://example.com/live.m3u8"></textarea></label></div><div data-pane="url" hidden><label class="form-label">HTTPS M3U 订阅地址<input type="url" id="importUrl" placeholder="https://example.com/my-playlist.m3u"></label><p class="security-note">需要源站支持 CORS。订阅链接可能含私密令牌，仅保存在本设备。</p></div><div data-pane="manual" hidden><label class="form-label">频道名称<input id="manualName" placeholder="我的频道"></label><label class="form-label">频道分组<input id="manualGroup" placeholder="自定义"></label><label class="form-label">直播地址<input type="url" id="manualUrl" placeholder="https://example.com/live.m3u8"></label><label class="form-label">流类型<select id="manualKind"><option value="auto">自动 / 原生播放</option><option value="hls">HLS (.m3u8)</option><option value="mpegts">MPEG-TS</option><option value="flv">FLV</option><option value="file">MP4 / 媒体文件</option></select></label></div><div id="importPreview" class="import-preview" hidden><strong id="previewTitle"></strong><p id="previewNames"></p></div><div class="form-actions"><button type="button" class="btn secondary" id="importCancel">取消</button><button type="button" class="btn primary" id="prepareBtn">解析并预览</button><button type="button" class="btn primary" id="confirmImport" hidden>确认导入</button></div></div>');
  for (const btn of document.querySelectorAll('[data-import]')) btn.addEventListener('click', () => { ui.importMode = btn.dataset.import; changeImportMode(); });
  $('#importCancel').addEventListener('click', closeModal);
  $('#prepareBtn').addEventListener('click', () => prepareImport({ mode: ui.importMode }));
  $('#confirmImport').addEventListener('click', confirmImport);
  $('#importFile').addEventListener('change', (e) => { if (e.target.files?.[0]) prepareImport({ mode: 'file', file: e.target.files[0] }); });
}
async function readLimited(response) {
  if (!response.ok) throw new Error('订阅服务器未返回成功响应（HTTP ' + response.status + '）');
  if (Number(response.headers.get('content-length') || 0) > MAX_IMPORT_BYTES) throw new Error('清单超过 20 MB 限制');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('清单超过 20 MB 限制');
    return text;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let result = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) throw new Error('清单超过 20 MB 限制');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.cancel().catch(() => {}); }
}
async function prepareImport({ mode, file, url, replaceSource, displayName } = {}) {
  const button = $('#prepareBtn');
  if (button) { button.disabled = true; button.textContent = '正在解析…'; }
  $('#confirmImport').hidden = true; ui.pending = null;
  try {
    const id = replaceSource?.id || crypto.randomUUID();
    let source, channels, summary = { skipped: 0, duplicates: 0 };
    if (mode === 'manual') {
      channels = [makeManualChannel({ name: $('#manualName').value, group: $('#manualGroup').value, url: $('#manualUrl').value.trim(), kind: $('#manualKind').value }, 'manual-source')];
      source = state.sources.find((s) => s.id === 'manual-source') || { id: 'manual-source', name: '手动添加', type: 'manual', enabled: true, createdAt: Date.now() };
    } else {
      let text, name;
      if (mode === 'file') {
        const chosen = file || $('#importFile').files[0];
        if (!chosen) throw new Error('请先选择 M3U 文件');
        if (chosen.size > MAX_IMPORT_BYTES) throw new Error('文件超过 20 MB 限制');
        text = await chosen.text(); name = chosen.name.slice(0, 100);
      } else if (mode === 'paste') {
        text = $('#importText').value; name = '粘贴清单 · ' + new Date().toLocaleDateString();
      } else if (mode === 'url') {
        const remoteUrl = safeHttpUrl(url || $('#importUrl').value);
        if (!remoteUrl || !remoteUrl.startsWith('https://')) throw new Error('远程订阅仅接受 HTTPS 地址');
        const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
        try {
          text = await readLimited(await fetch(remoteUrl, { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }));
        } catch (e) {
          if (e?.name === 'AbortError') throw new Error('请求超时（15 秒）');
          if (e instanceof TypeError) throw new Error('订阅无法读取：可能由 CORS 或网络限制导致');
          throw e;
        } finally { clearTimeout(timeout); }
        name = replaceSource?.name || displayName || '订阅 · ' + new URL(remoteUrl).hostname;
      } else throw new Error('未知导入方式');
      summary = parseM3U(text, id); channels = summary.channels;
      source = { id, name, type: mode, enabled: replaceSource?.enabled ?? true,
        createdAt: replaceSource?.createdAt || Date.now(), updatedAt: Date.now() };
      if (mode === 'url') source.sourceUrl = safeHttpUrl(url || $('#importUrl').value);
    }
    ui.pending = { source, channels, replace: Boolean(replaceSource) || source.id === 'manual-source', skipped: summary.skipped, duplicates: summary.duplicates };
    $('#importPreview').hidden = false;
    $('#previewTitle').textContent = channels.length + ' 个频道可导入 · 跳过 ' + summary.skipped + ' 条 · 合并 ' + summary.duplicates + ' 条';
    $('#previewNames').textContent = channels.slice(0, 8).map((c) => c.name).join(' / ') + (channels.length > 8 ? ' …' : '');
    $('#confirmImport').hidden = false;
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入失败', 'error');
    if ($('#importPreview')) $('#importPreview').hidden = true;
  } finally { if (button) { button.disabled = false; button.textContent = '解析并预览'; } }
}
async function confirmImport() {
  if (!ui.pending) return;
  const { source, channels, replace } = ui.pending;
  let next;
  if (source.id === 'manual-source' && state.sources.some((s) => s.id === source.id)) {
    const old = state.channels.filter((c) => c.sourceId === source.id);
    next = appendSource(state, { ...source, updatedAt: Date.now() },
      [...old.filter((c) => !channels.some((n) => n.id === c.id)), ...channels], true);
  } else next = appendSource(state, source, channels, replace);
  await commit(next); closeModal(); notify('已导入 ' + channels.length + ' 个频道', 'success');
}
function exportBackup() {
  if (!confirm('备份文件可能包含私人订阅令牌和直播 URL。确认下载到本设备并妥善保管？')) return;
  const blob = new Blob([JSON.stringify({ format: 'fox-iptv-backup-v1', data: state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a');
  a.href = url; a.download = 'mediahub-live-private-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sanitizeBackup(value) {
  if (value?.format !== 'fox-iptv-backup-v1' || !value.data || !Array.isArray(value.data.sources) || !Array.isArray(value.data.channels)) throw new Error('不支持此备份格式');
  if (value.data.sources.length > 300 || value.data.channels.length > 15000) throw new Error('备份的数据量超过上限');
  const sources = value.data.sources.filter((s) => typeof s.id === 'string' && s.id.length <= 100 && typeof s.name === 'string' && s.name.length <= 160 && (['file', 'paste', 'remote', 'manual'].includes(s.type) || (s.type === 'builtin' && s.id === PUBLIC_SOURCE_ID)))
    .map((s) => ({ id: s.id, name: s.name, type: s.type, enabled: s.enabled !== false, createdAt: Number(s.createdAt) || Date.now(), updatedAt: Number(s.updatedAt) || Date.now(),
      ...(s.type === 'remote' && safeHttpUrl(s.sourceUrl)?.startsWith('https://') ? { sourceUrl: safeHttpUrl(s.sourceUrl) } : {}) }));
  const ids = new Set(sources.map((s) => s.id));
  const channels = value.data.channels.filter((c) => c && typeof c.id === 'string' && c.id.length <= 120 && ids.has(c.sourceId) && Array.isArray(c.streams))
    .map((c) => ({ id: c.id, sourceId: c.sourceId, name: String(c.name || '未命名频道').slice(0, 160),
      group: String(c.group || '未分类').slice(0, 160), logo: safeHttpUrl(c.logo) || '', tvgId: String(c.tvgId || '').slice(0, 160),
      addedAt: Number(c.addedAt) || Date.now(), streams: c.streams.slice(0, 10)
        .filter((s) => s && safeHttpUrl(s.url)).map((s) => ({ url: safeHttpUrl(s.url), kind: ['hls', 'mpegts', 'flv', 'file', 'auto'].includes(s.kind) ? s.kind : 'auto', label: String(s.label || '线路').slice(0, 40) })) }))
    .filter((c) => c.streams.length && c.sourceId !== PUBLIC_SOURCE_ID);
  if (sources.some((source) => source.id === PUBLIC_SOURCE_ID)) channels.push(...getPublicChannels());
  const valid = new Set(channels.map((c) => c.id));
  return { version: 1, sources, channels,
    favorites: [...new Set((Array.isArray(value.data.favorites) ? value.data.favorites : []).filter((id) => valid.has(id)))],
    recent: [...new Set((Array.isArray(value.data.recent) ? value.data.recent : []).filter((id) => valid.has(id)))].slice(0, 20) };
}
function openGitHubLibrary() {
  openModal('<div class="modal-eyebrow">GITHUB CHANNEL LIBRARY</div><h2>GitHub 公开频道库</h2><p class="modal-lead">从 iptv-org GitHub 公共项目获取按地区、新闻与专题分类的最新 M3U。所有来源先预览，再由你确认导入；频道实际可播性、版权和地区限制由源站决定。</p><div id="githubPresetRows" class="source-rows public-source-list"></div><p class="security-note">公开目录 ≠ 所有频道已获转播授权。本站只读取索引，不代理或转码；需要 DRM/专用请求头的流可能无法播放。</p>');
  const list = $('#githubPresetRows');
  for (const preset of GITHUB_PLAYLISTS) {
    const row = node('div', 'source-row');
    const info = node('div', 'source-info');
    const installed = state.sources.find(s => s.type === 'remote' && s.sourceUrl === preset.url);
    info.append(node('strong', '', preset.name), node('small', '', preset.description + (installed ? ' · 已导入，可更新' : '')));
    const btn = node('button', 'btn small secondary', installed ? '更新预览' : '预览导入');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      openImport();
      ui.importMode = 'url';
      changeImportMode();
      $('#importUrl').value = preset.url;
      await prepareImport({ mode: 'url', url: preset.url, replaceSource: installed, displayName: preset.name });
    });
    row.append(info, btn);
    list.append(row);
  }
}
function openRestore() {
  openModal('<div class="modal-eyebrow">RESTORE</div><h2>恢复私人备份</h2><p class="modal-lead">导入 .json 备份会替换当前设备中的全部来源、收藏和最近记录。当前数据可以先导出备份。</p><label class="dropzone"><span class="upload-symbol">⇧</span><strong>选择 MediaHub Live 备份文件</strong><input id="restoreFile" type="file" accept=".json,application/json"></label><p class="security-note">仅接受本应用导出的备份格式，文件内容只在浏览器本地处理。</p>');
  $('#restoreFile').addEventListener('change', async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) throw new Error('备份不能超过 20 MB');
      const restored = sanitizeBackup(JSON.parse(await file.text()));
      if (!confirm('确认替换本设备现有的 ' + state.channels.length + ' 个频道？')) return;
      controller.reset(); ui.selected = null; ui.group = 'all'; ui.source = 'all'; ui.filter = 'all';
      await commit(restored); closeModal(); notify('备份恢复成功，已导入 ' + restored.channels.length + ' 个频道', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : '备份恢复失败', 'error'); }
  });
}
function setupEvents() {
  for (const id of ['importBtn', 'emptyImport']) $('#' + id).addEventListener('click', openImport);
  $('#infoImport').addEventListener('click', openGitHubLibrary);
  $('#manageBtn').addEventListener('click', openManage);
  $('#githubBtn').addEventListener('click', openGitHubLibrary);
  $('#themeBtn').addEventListener('click', () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; theme(); savePrefs(); });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
  $('#search').addEventListener('input', (e) => { ui.search = e.target.value.trim(); ui.visible = 150; renderList(); });
  $('#sourceFilter').addEventListener('change', (e) => { ui.source = e.target.value; ui.group = 'all'; ui.visible = 150; render(); });
  $('#filters').addEventListener('click', (e) => {
    const button = e.target.closest('[data-filter]');
    if (button) { ui.filter = button.dataset.filter; ui.visible = 150; render(); }
  });
  $('#clearGroup').addEventListener('click', () => { ui.group = 'all'; render(); });
  $('#loadMore').addEventListener('click', () => { ui.visible += 150; renderList(); });
  $('#prevBtn').addEventListener('click', () => adjacentChannel(-1));
  $('#nextBtn').addEventListener('click', () => adjacentChannel(1));
  $('#playBtn').addEventListener('click', () => {
    if (!video.paused) video.pause();
    else if (video.currentSrc) controller.play();
    else playSelected();
  });
  video.addEventListener('pause', () => { if (ui.selected && $('#statusDot').classList.contains('playing')) updatePlayback('paused', '已暂停'); });
  $('#retryBtn').addEventListener('click', playSelected);
  $('#favBtn').addEventListener('click', () => { if (ui.selected) commit(toggleFavorite(state, ui.selected)); });
  $('#lineSelect').addEventListener('change', playSelected);
  $('#pipBtn').addEventListener('click', async () => {
    try {
      if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) throw new Error('no pip');
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { notify('当前浏览器暂不支持画中画，或需要先播放视频', 'warn'); }
  });
  $('#fullBtn').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (video.webkitEnterFullscreen && !document.fullscreenEnabled) video.webkitEnterFullscreen();
      else await $('#videoBox').requestFullscreen();
    } catch { notify('当前设备不支持此全屏方式，请使用视频自带全屏键', 'warn'); }
  });
  video.addEventListener('volumechange', () => { prefs.volume = video.volume; prefs.muted = video.muted; savePrefs(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    if (!$('#modal').hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); adjacentChannel(e.key === 'ArrowUp' ? -1 : 1); }
  });
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); const file = e.dataTransfer.files[0];
    if (file) { openImport(); prepareImport({ mode: 'file', file }); }
  });
  window.addEventListener('offline', () => notify('当前设备离线，直播可能中断', 'warn'));
  window.addEventListener('beforeunload', () => controller.destroy());
}
async function init() {
  setupEvents(); theme();
  try { state = await loadState(); }
  catch { canPersist = false; notify('IndexedDB 无法使用：频道和收藏只在当前页面有效', 'error'); }
  // Bootstrap defaults just once per browser. Removing the public source is respected.
  const alreadyInstalled = state.sources.some((source) => source.id === PUBLIC_SOURCE_ID);
  if (alreadyInstalled) { try { localStorage.setItem(PUBLIC_BOOTSTRAP_FLAG, '1'); } catch { /* Private mode. */ } }
  let addPublic = !alreadyInstalled;
  try { addPublic = addPublic && localStorage.getItem(PUBLIC_BOOTSTRAP_FLAG) !== '1'; }
  catch { addPublic = addPublic && state.sources.length === 0; }
  if (addPublic) {
    await commit(appendSource(state, { ...PUBLIC_SOURCE, createdAt: Date.now(), updatedAt: Date.now() }, getPublicChannels()));
    try { localStorage.setItem(PUBLIC_BOOTSTRAP_FLAG, '1'); } catch { /* Private mode: no persistent flag. */ }
    notify('已添加 18 个公开直播频道；受地区和浏览器兼容性限制，部分频道可能无法播放', 'success');
  }
  const sharedId = new URL(location.href).searchParams.get('ch');
  if (sharedId && state.channels.some((c) => c.id === sharedId)) {
    ui.selected = sharedId; updatePlayback('idle', '已载入分享频道，点击播放');
  } else if (sharedId) notify('此设备没有分享频道的数据，请先导入相同的播放清单', 'warn');
  else if (state.recent.length && state.channels.some((c) => c.id === state.recent[0])) {
    ui.selected = state.recent[0]; updatePlayback('idle', '已恢复最近频道，点击播放');
  }
  render();
}
init();
