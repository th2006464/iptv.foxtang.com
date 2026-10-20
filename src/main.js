import { parseM3U, makeManualChannel, safeHttpUrl, MAX_IMPORT_BYTES, signedStreamExpiry, isExpiredSignedStream } from './playlist.js';
import { EMPTY_STATE, loadState, saveState, appendSource, removeSource, toggleFavorite, recordRecent } from './store.js';
import { PlayerController } from './player.js';
import { GITHUB_PLAYLISTS } from './github-sources.js';
import { PUBLIC_SOURCE_ID, getPublicChannels } from './public-catalog.js';
import { HD_REFERENCE_SOURCE_ID, installReferenceCatalog, addReferenceStream, matchOwnPlaylist, findReferenceId } from './hd-reference-catalog.js';
import { mergeBackendCatalog } from './backend-catalog.js';
import { nextFallbackIndex, MAX_AUTOMATIC_BACKUPS } from './line-failover.js';

const $ = (selector, root = document) => root.querySelector(selector);
const settingsKey = 'fox-iptv-settings-v1';
let prefs = { theme: 'dark', logos: true, volume: 0.8, muted: false };
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
  if (['dark', 'light'].includes(saved.theme)) prefs.theme = saved.theme;
  if (typeof saved.logos === 'boolean') prefs.logos = saved.logos;
  if (typeof saved.volume === 'number') prefs.volume = Math.max(0, Math.min(1, saved.volume));
  if (typeof saved.muted === 'boolean') prefs.muted = saved.muted;
} catch { /* Bad preferences must not break startup. */ }
let state = EMPTY_STATE();
let ui = { search: '', selected: null, visible: 250, pending: null, importMode: 'file' };
let canPersist = true;
let noticeTimeout;
const video = $('#video');
video.volume = prefs.volume;
video.muted = prefs.muted;
const controller = new PlayerController(video, updatePlayback);
const failover = { channelId: null, attempted: new Set(), retries: 0, generation: 0, pending: false };
function resetFailover(channelId, selectedIndex = 0) {
  failover.channelId = channelId;
  failover.generation++;
  failover.attempted = new Set([selectedIndex]);
  failover.retries = 0;
  failover.pending = false;
}
function onFatalPlaybackError() {
  const channel = state.channels.find(c => c.id === ui.selected);
  if (!channel || channel.id !== failover.channelId || failover.pending) return;
  const candidates = availableStreams(channel);
  const select = $('#lineSelect');
  const current = Number(select.value || 0);
  const next = nextFallbackIndex(candidates, current, failover.attempted, failover.retries);
  if (next < 0) return;
  failover.retries++;
  failover.attempted.add(current);
  failover.attempted.add(next);
  failover.pending = true;
  const generation = failover.generation;
  setTimeout(() => {
    if (failover.generation !== generation || channel.id !== ui.selected) return;
    failover.pending = false;
    const fresh = availableStreams(state.channels.find(c => c.id === channel.id));
    if (!fresh[next]) return;
    select.value = String(next);
    $('#statusText').textContent = '当前线路失败，尝试备用线 ' + failover.retries
      + '/' + MAX_AUTOMATIC_BACKUPS;
    $('#statusDot').className = 'state-dot loading';
    controller.load(fresh[next]);
  }, 450);
}
function notify(message, kind = 'info') {
  const n = $('#notice'); n.textContent = message; n.dataset.kind = kind; n.hidden = false;
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => { n.hidden = true; }, 6000);
}
function updatePlayback(status, message) {
  $('#statusText').textContent = message;
  $('#statusDot').className = 'state-dot ' + status;
  $('#playBtn').textContent = status === 'playing' ? 'Ⅱ' : '▶';
  if (status === 'error') onFatalPlaybackError();
}
function savePrefs() {
  try { localStorage.setItem(settingsKey, JSON.stringify(prefs)); }
  catch { notify('浏览器未允许保存界面偏好', 'warn'); }
}
function theme() {
  document.documentElement.dataset.theme = prefs.theme;
  $('#themeBtn').textContent = prefs.theme === 'dark' ? '☾' : '☀';
  $('#themeBtn').title = prefs.theme === 'dark' ? '切换浅色主题' : '切换深色主题';
}
async function commit(next) {
  if (canPersist) {
    try { await saveState(next); }
    catch { canPersist = false; notify('本地存储不可用；修改只在当前页面有效', 'error'); }
  }
  state = next; render();
}
const PRIVATE_HD_SNAPSHOT_ID = 'personal-hd-reference-snapshot-v1';
function availableStreams(channel, now = Date.now()) {
  return (channel?.streams || []).filter(item => !isExpiredSignedStream(item.url, now));
}
function activeChannels() {
  const enabled = new Set(state.sources.filter(s => s.enabled).map(s => s.id));
  const active = state.channels.filter(c => enabled.has(c.sourceId));
  const references = new Set(active.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID).map(c => c.id));
  // A personal playlist supplies line(s) for an existing reference station.
  // Keep the source in IndexedDB and source management, not a duplicate TV row.
  return active.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID ||
    !references.has('ref-' + findReferenceId(c)));
}
function visibleChannels() {
  const term = ui.search.toLocaleLowerCase();
  const channels = activeChannels();
  if (!term) return channels;
  return channels.filter(c => (c.name + ' ' + (c.referenceId || '') + ' ' + (c.tvgId || '')).toLocaleLowerCase().includes(term));
}
function node(type, className, label) {
  const el = document.createElement(type);
  if (className) el.className = className;
  if (label !== undefined) el.textContent = label;
  return el;
}
function renderList() {
  const filtered = visibleChannels(), list = $('#channelList');
  list.replaceChildren();
  for (const [index, channel] of filtered.slice(0, ui.visible).entries()) {
    const row = node('div', 'channel-row' + (ui.selected === channel.id ? ' selected' : ''));
    const main = node('button', 'channel-main'); main.type = 'button'; main.title = channel.name;
    const number = node('span', 'channel-number', String(channel.referenceId || index + 1));
    const thumb = node('span', 'channel-thumb', channel.name.slice(0, 2).toUpperCase());
    if (prefs.logos && channel.logo) {
      const img = document.createElement('img'); img.src = channel.logo; img.alt = '';
      img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove();
      thumb.append(img);
    }
    const info = node('span', 'channel-info');
    info.append(node('span', 'channel-title', channel.name));
    const usable = availableStreams(channel);
    const kind = usable[0]?.kind || 'auto';
    if (!usable.length) {
      const wasSigned = (channel.streams || []).some(item => signedStreamExpiry(item.url) !== null);
      info.append(node('span', 'codec-tag missing-tag', wasSigned ? '签名已到期' : '待绑定'));
    } else if (['hls', 'mpegts', 'flv'].includes(kind)) info.append(node('span', 'codec-tag', kind === 'hls' ? 'HLS' : kind === 'mpegts' ? 'TS' : 'FLV'));
    info.append(node('small', 'channel-group', channel.group));
    main.append(number, thumb, info);
    main.addEventListener('click', () => selectChannel(channel.id, true));
    row.append(main); list.append(row);
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

}
function renderCurrent() {
  const channel = state.channels.find((c) => c.id === ui.selected);
  $('#pageTitle').textContent = channel ? channel.name : '网络电视直播';
  $('#pageSubtitle').textContent = channel ? '来源：' + (state.sources.find(s => s.id === channel.sourceId)?.name || '本地清单') : '从左侧选择频道开始播放';
  $('#currentName').textContent = channel ? channel.name : '选择一个频道开始播放';
  const validCount = availableStreams(channel).length;
  $('#currentGroup').textContent = channel ? (validCount ? validCount + ' 条有效候选线路' : '暂无有效播放线路 · 可导入私人清单') : '选择左侧频道开始播放';
  const logoBox = $('#playingLogo');
  logoBox.replaceChildren();
  logoBox.textContent = channel ? channel.name.slice(0, 2).toUpperCase() : '▶';
  if (prefs.logos && channel?.logo) {
    const image = document.createElement('img');
    image.src = channel.logo; image.alt = ''; image.referrerPolicy = 'no-referrer';
    image.onerror = () => image.remove();
    logoBox.replaceChildren(image);
  }
  const lines = availableStreams(channel);
  const hasLines = lines.length > 0;
  const expired = !hasLines && Boolean(channel?.streams?.some(line => signedStreamExpiry(line.url) !== null));
  $('#videoEmpty').hidden = hasLines;
  $('#videoEmpty strong').textContent = channel && !hasLines ? (expired ? '播放链接已到期' : '尚未绑定播放线路') : 'MediaHub Live';
  $('#videoEmpty p').textContent = channel && !hasLines
    ? (expired ? '此频道的临时签名链接已失效，请导入新的有效授权清单。' : channel.name + ' 已在频道表中。可添加有权使用的私人播放地址，或导入 M3U 后匹配。')
    : '在左侧选择频道，或导入自己的 M3U 播放列表';
  $('#emptyImport').textContent = channel && !hasLines ? '＋ 为此频道绑定线路' : '＋ 导入播放列表';
  $('#favBtn').textContent = channel && state.favorites.includes(channel.id) ? '★ 已收藏' : '☆ 收藏';
  $('#favBtn').disabled = !channel;
  for (const id of ['prevBtn', 'nextBtn']) $('#' + id).disabled = !channel;
  for (const id of ['playBtn', 'retryBtn', 'pipBtn', 'fullBtn']) $('#' + id).disabled = !hasLines;
  $('#bindLineBtn').disabled = !channel || channel.sourceId !== HD_REFERENCE_SOURCE_ID;
  $('#bindLineBtn').textContent = !channel ? '＋ 添加频道线路' : hasLines ? '＋ 添加线路' : '＋ 绑定频道线路';
  $('#nextLineBtn').disabled = lines.length < 2;
  $('#nextLineBtn').textContent = lines.length > 1 ? '⇄ 换线路（' + lines.length + '条）' : hasLines ? '只有一条线路' : '暂无线路';
  const select = $('#lineSelect'), current = select.value;
  select.replaceChildren();
  if (channel) {
    lines.forEach((stream, i) => select.add(new Option((stream.label || '线路 ' + (i + 1)) + ' · ' + (stream.kind || 'auto').toUpperCase(), String(i))));
    if ([...select.options].some((o) => o.value === current)) select.value = current;
    select.disabled = lines.length < 2;
  } else { select.add(new Option('无可用线路', '')); select.disabled = true; }
  if (!hasLines) { select.replaceChildren(new Option('尚未绑定播放地址', '')); select.disabled = true; }
  const stream = lines[Number(select.value) || 0] || lines[0];
  $('#playbackKind').textContent = stream ? (stream.kind === 'hls' ? 'HLS' : stream.kind === 'mpegts' ? 'TS' : stream.kind === 'flv' ? 'FLV' : stream.kind === 'file' ? 'FILE' : 'AUTO') : '—';
  refreshMetrics();
}
function refreshMetrics() {
  const exists = Boolean(state.channels.find(c => c.id === ui.selected));
  const w = video.videoWidth, h = video.videoHeight;
  $('#resolutionText').textContent = exists && w && h ? w + '×' + h : '—';
  let bufferedSeconds = 0;
  if (exists && Number.isFinite(video.currentTime) && video.buffered?.length) {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
        bufferedSeconds = Math.max(0, video.buffered.end(i) - video.currentTime);
        break;
      }
    }
  }
  $('#bufferText').textContent = bufferedSeconds.toFixed(1) + 's';
  let codec = '—';
  let declaredBitrate = '—';
  const hls = controller.kind === 'hls' && controller.instance && Array.isArray(controller.instance.levels)
    ? controller.instance : null;
  if (exists && hls && hls.levels.length) {
    const level = hls.levels[hls.currentLevel >= 0 ? hls.currentLevel : 0];
    if (level) {
      const videoCodec = level.videoCodec || '';
      codec = /^(hvc1|hev1)/i.test(videoCodec) ? 'H.265' : /^(avc1|avc3)/i.test(videoCodec) ? 'H.264' : videoCodec ? videoCodec.slice(0, 18) : '—';
      if (Number.isFinite(level.bitrate) && level.bitrate > 0) declaredBitrate = (level.bitrate / 1e6).toFixed(2) + ' Mbps';
    }
  }
  $('#codecText').textContent = codec;
  $('#bitrateText').textContent = declaredBitrate;
}
function render() {
  const enabled = activeChannels();
  $('#topCount').textContent = enabled.length.toLocaleString() + ' 个频道';
  $('#statChannels').textContent = String(enabled.length);
  $('#statFav').textContent = String(state.favorites.length);
  $('#statSources').textContent = String(state.sources.length);
  renderList();
  renderCurrent();
}
async function selectChannel(id, autoplay) {
  const channel = state.channels.find((c) => c.id === id);
  if (!channel) return;
  if (ui.selected !== id) {
    ui.selected = id; resetFailover(id); controller.reset(); $('#lineSelect').value = '0';
    updatePlayback('idle', availableStreams(channel).length ? '已选择频道，点击播放' : '暂无有效播放线路');
    refreshMetrics();
  }
  history.replaceState(null, '', location.pathname + '?ch=' + encodeURIComponent(id));
  await commit(recordRecent(state, id));
  if (autoplay && availableStreams(channel).length) playSelected();
}
function playSelected() {
  const channel = state.channels.find((c) => c.id === ui.selected);
  if (!channel) return;
  const active = availableStreams(channel);
  const stream = active[Number($('#lineSelect').value) || 0] || active[0];
  if (stream) {
    resetFailover(channel.id, Number($('#lineSelect').value) || 0);
    controller.load(stream);
  }
  else { updatePlayback('idle', '暂无有效播放线路'); notify('该台缺少有效线路，或已过签名有效期。请重新导入授权清单。', 'warn'); }
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
// Public sources are centrally configured in Cloudflare Pages Functions.
// Browser-specific personal tokens and playlists are never sent to this API.
async function syncPublicBackend({ showNotice = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch('/api/channels?rev=20261020-freehls13', {
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal
    });
    if (!response.ok) throw new Error('频道接口 HTTP ' + response.status);
    const payload = await response.json();
    const currentReference = state.channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID);
    const before = currentReference.reduce((count, c) => count + c.streams.length, 0);
    const updated = mergeBackendCatalog(state, payload);
    await commit(updated);
    const after = updated.channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID)
      .reduce((count, c) => count + c.streams.length, 0);
    if (showNotice) notify('后台频道已同步：' + payload.channelCount
      + ' 台，' + payload.playableCount + ' 台有公开候选线路；新增 '
      + Math.max(0, after - before) + ' 条', 'success');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
function sourceRow(source) {
  const row = node('div', 'source-row'), info = node('div', 'source-info');
  info.append(node('strong', '', source.name), node('small', '', state.channels.filter((c) => c.sourceId === source.id).length + ' 个频道 · ' + ({ remote: 'HTTPS 订阅', paste: '粘贴文本', file: '本地文件', manual: '手动添加', builtin: '精选电视台 · 多条公开线路' }[source.type] || source.type)));
  const buttons = node('div', 'source-actions');
  const toggle = node('button', 'btn small subtle', source.enabled ? '停用' : '启用');
  toggle.addEventListener('click', async () => {
    await commit({ ...state, sources: state.sources.map((s) => s.id === source.id ? { ...s, enabled: !s.enabled } : s) }); openManage();
  });
  buttons.append(toggle);
  if (source.id === HD_REFERENCE_SOURCE_ID) {
    const refresh = node('button', 'btn small secondary', '↻ 更新公共线路');
    refresh.addEventListener('click', async () => {
      refresh.disabled = true; refresh.textContent = '更新中…';
      try {
        await syncPublicBackend({ showNotice: true });
        openManage();
      } catch (error) {
        notify(error instanceof Error ? error.message : '无法更新公共线路', 'error');
        refresh.disabled = false; refresh.textContent = '↻ 更新公共线路';
      }
    });
    buttons.append(refresh);
  }
  if (source.type === 'remote' && source.sourceUrl) {
    const refresh = node('button', 'btn small subtle', '更新');
    refresh.addEventListener('click', async () => {
      openImport(); ui.importMode = 'url'; changeImportMode();
      $('#importUrl').value = source.sourceUrl;
      await prepareImport({ mode: 'url', url: source.sourceUrl, replaceSource: source });
    });
    buttons.append(refresh);
  }
  if (source.id !== HD_REFERENCE_SOURCE_ID) {
  const del = node('button', 'btn small danger', '删除');
  del.addEventListener('click', async () => {
    if (!confirm('确认删除“' + source.name + '”及其全部频道？其他来源不受影响。')) return;
    if (ui.selected && state.channels.some((c) => c.id === ui.selected && c.sourceId === source.id)) {
      ui.selected = null; controller.reset(); updatePlayback('idle', '已移除当前频道');
      history.replaceState(null, '', location.pathname);
    }
    await commit(removeSource(state, source.id)); openManage();
  });
  buttons.append(del);
  }
  row.append(info, buttons);
  return row;
}
function openManage() {
  openModal('<div class="modal-eyebrow">MY SOURCES</div><h2>播放源管理</h2><p class="modal-lead">数据仅保存在当前浏览器，停用来源不会删除频道。</p><div id="sourceRows" class="source-rows"></div><div class="settings-row"><div><strong>外部频道图标</strong><small>默认关闭，开启后浏览器将直接请求图标站点</small></div><label class="switch"><input id="logoToggle" type="checkbox"><span></span></label></div><div class="manage-actions"><button class="btn secondary" id="backupBtn">↓ 导出私人备份</button><button class="btn secondary" id="restoreBtn">↑ 导入备份</button><button class="btn secondary" id="matchOwnBtn">⇄ 匹配我的 M3U</button><button class="btn secondary" id="githubManageBtn">◈ GitHub 频道库</button><button class="btn primary" id="addSourceBtn">＋ 添加频道源</button></div><p class="security-note">备份可能包含访问令牌的私人播放地址，请勿提交到 GitHub 或分享。</p>');
  const rows = $('#sourceRows');
  for (const source of state.sources) rows.append(sourceRow(source));
  if (!state.sources.length) rows.append(node('p', 'muted', '暂无来源，点击添加频道源开始。'));
  $('#logoToggle').checked = prefs.logos;
  $('#logoToggle').addEventListener('change', (e) => { prefs.logos = e.target.checked; savePrefs(); renderList(); });
  $('#backupBtn').addEventListener('click', exportBackup);
  $('#restoreBtn').addEventListener('click', openRestore);
  $('#addSourceBtn').addEventListener('click', openImport);
  $('#githubManageBtn').addEventListener('click', openGitHubLibrary);
  $('#matchOwnBtn').addEventListener('click', async () => {
    const result = matchOwnPlaylist(state);
    await commit(result.state);
    notify('已匹配 ' + result.matchedStations + ' 个参考频道，新增 ' + result.addedLines + ' 条私人线路', 'success');
    openManage();
  });
}
function changeImportMode() {
  for (const btn of document.querySelectorAll('[data-import]')) btn.classList.toggle('active', btn.dataset.import === ui.importMode);
  for (const pane of document.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== ui.importMode;
  $('#importPreview').hidden = true; ui.pending = null;
}
function openImport() {
  ui.importMode = 'file';
  openModal('<div class="modal-eyebrow">ADD PLAYLIST</div><h2>导入你的私人频道</h2><p class="modal-lead">仅导入你有权观看的频道，播放地址不上传到本站服务器。</p><div class="tabbar"><button data-import="file" class="active">本地文件</button><button data-import="paste">粘贴 M3U</button><button data-import="url">订阅 URL</button><button data-import="manual">单个频道</button></div><div class="import-form"><div data-pane="file"><label class="dropzone"><span class="upload-symbol">⇧</span><strong>选择 .m3u / .txt 文件</strong><small>仅浏览器解析 · 最大 20 MB</small><input type="file" id="importFile" accept=".m3u,.m3u8,.txt,text/plain,application/x-mpegURL"></label></div><div data-pane="paste" hidden><label class="form-label">M3U 清单文本<textarea id="importText" rows="7" placeholder="#EXTM3U&#10;#EXTINF:-1,示例频道&#10;https://example.com/live.m3u8"></textarea></label></div><div data-pane="url" hidden><label class="form-label">HTTPS M3U 订阅地址<input type="url" id="importUrl" placeholder="https://example.com/my-playlist.m3u"></label><p class="security-note">需要源站支持 CORS。订阅链接可能含私密令牌，仅保存在本设备。</p></div><div data-pane="manual" hidden><label class="form-label">频道名称<input id="manualName" placeholder="我的频道"></label><label class="form-label">频道分组<input id="manualGroup" placeholder="自定义"></label><label class="form-label">直播地址<input type="url" id="manualUrl" placeholder="https://example.com/live.m3u8"></label><label class="form-label">流类型<select id="manualKind"><option value="auto">自动 / 原生播放</option><option value="hls">HLS (.m3u8)</option><option value="mpegts">MPEG-TS</option><option value="flv">FLV</option><option value="file">MP4 / 媒体文件</option></select></label></div><div id="importPreview" class="import-preview" hidden><strong id="previewTitle"></strong><p id="previewNames"></p><p class="security-note" id="previewExpiry" hidden></p></div><div class="form-actions"><button type="button" class="btn secondary" id="importCancel">取消</button><button type="button" class="btn primary" id="prepareBtn">解析并预览</button><button type="button" class="btn primary" id="confirmImport" hidden>确认导入</button></div></div>');
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
      // Captured lists with HD.Rip's numeric TVG IDs are a private local snapshot,
      // not a second copy of the public channel directory. A second import replaces
      // the earlier snapshot and its short-lived signed URLs.
      const matchedIds = channels.filter(c => /^[1-9]\d{0,5}$/.test(c.tvgId)
        && Number(c.tvgId) === findReferenceId(c)).length;
      const matchedSnapshot = ['file','paste'].includes(mode)
        && channels.length >= 100 && matchedIds >= Math.ceil(channels.length * 0.95);
      if (matchedSnapshot) {
        const existing = state.sources.find(item => item.id === PRIVATE_HD_SNAPSHOT_ID);
        summary = parseM3U(text, PRIVATE_HD_SNAPSHOT_ID);
        channels = summary.channels;
        source = {
          id: PRIVATE_HD_SNAPSHOT_ID, name: '本机 HD.Rip 频道快照',
          type: mode, enabled: existing?.enabled ?? true,
          createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now()
        };
      } else {
        source = { id, name, type: mode, enabled: replaceSource?.enabled ?? true,
          createdAt: replaceSource?.createdAt || Date.now(), updatedAt: Date.now() };
      }
      if (mode === 'url') source.sourceUrl = safeHttpUrl(url || $('#importUrl').value);
    }
    ui.pending = { source, channels, replace: Boolean(replaceSource) || source.id === 'manual-source' || source.id === PRIVATE_HD_SNAPSHOT_ID, skipped: summary.skipped, duplicates: summary.duplicates };
    $('#importPreview').hidden = false;
    const matched = channels.filter(c => findReferenceId(c) !== null).length;
    $('#previewTitle').textContent = channels.length + ' 个频道可导入 · 自动匹配 ' + matched
      + ' 台 · 跳过 ' + summary.skipped + ' 条 · 合并 ' + summary.duplicates + ' 条';
    $('#previewNames').textContent = channels.slice(0, 8).map(c => c.name).join(' / ') + (channels.length > 8 ? ' …' : '');
    const expiryDates = channels.flatMap(c => c.streams.map(line => signedStreamExpiry(line.url))).filter(Boolean);
    const warning = $('#previewExpiry');
    if (expiryDates.length) {
      const earliest = Math.min(...expiryDates), latest = Math.max(...expiryDates);
      warning.hidden = false;
      warning.textContent = '注意：这份清单有 ' + expiryDates.length + ' 条临时签名线路，'
        + (latest <= Date.now() ? '签名现已全部到期，请重新获取有权使用的有效清单。'
          : '预计于 ' + new Date(earliest).toLocaleString('zh-CN') + ' 起到期。')
        + ' 本站不会自动续签；链接只存储于当前浏览器，不会上传到网站或 GitHub。';
    } else warning.hidden = true;
    $('#confirmImport').hidden = false;
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入失败', 'error');
    if ($('#importPreview')) $('#importPreview').hidden = true;
  } finally { if (button) { button.disabled = false; button.textContent = '解析并预览'; } }
}
function openBindLine() {
  const channel = state.channels.find(c => c.id === ui.selected && c.sourceId === HD_REFERENCE_SOURCE_ID);
  if (!channel) { openImport(); return; }
  openModal('<div class="modal-eyebrow">CHANNEL LINE</div><h2>为电视台绑定线路</h2><p class="modal-lead">频道：<strong id="bindChannelName"></strong></p><label class="form-label">你的直播地址<input id="bindLineUrl" type="url" placeholder="https://example.com/live.m3u8" autocomplete="off" spellcheck="false"></label><p class="security-note">仅使用你有权访问的来源。地址及令牌只保存在此设备的 IndexedDB，不提交 GitHub 或本站后端。部分线路需要 DRM、Cookie 或地区权限，网页播放器不提供绕过功能。</p><div class="form-actions"><button type="button" class="btn secondary" id="bindCancel">取消</button><button type="button" class="btn primary" id="bindConfirm">保存并测试</button></div>');
  $('#bindChannelName').textContent = channel.name;
  $('#bindCancel').addEventListener('click', closeModal);
  $('#bindConfirm').addEventListener('click', async () => {
    const button = $('#bindConfirm');
    button.disabled = true;
    try {
      const before = state.channels.find(c => c.id === channel.id)?.streams.length || 0;
      const next = addReferenceStream(state, channel.id, $('#bindLineUrl').value.trim());
      const after = next.channels.find(c => c.id === channel.id)?.streams.length || 0;
      await commit(next);
      closeModal();
      if (after > 0) {
        $('#lineSelect').value = String(after > before ? after - 1 : after - 1);
        playSelected();
      }
      notify(after > before ? '私人频道线路已保存，可继续切换或测试' : '此线路已存在', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : '播放地址无效', 'error');
      button.disabled = false;
    }
  });
  $('#bindLineUrl').focus();
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
  const matched = matchOwnPlaylist(next, { preferSourceId: source.id });
  await commit(matched.state); closeModal();
  notify('已在本机保存 ' + channels.length + ' 个频道，匹配 ' + matched.matchedStations + ' 台（新增 ' + matched.addedLines + ' 条线路）。如需使用请从频道表选台测试。', 'success');
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
  const sources = value.data.sources.filter((s) => typeof s.id === 'string' && s.id.length <= 100 && typeof s.name === 'string' && s.name.length <= 160 && (['file', 'paste', 'remote', 'manual'].includes(s.type) || (s.type === 'builtin' && [PUBLIC_SOURCE_ID, HD_REFERENCE_SOURCE_ID].includes(s.id))))
    .map((s) => ({ id: s.id, name: s.name, type: s.type, enabled: s.enabled !== false, createdAt: Number(s.createdAt) || Date.now(), updatedAt: Number(s.updatedAt) || Date.now(),
      ...(s.type === 'remote' && safeHttpUrl(s.sourceUrl)?.startsWith('https://') ? { sourceUrl: safeHttpUrl(s.sourceUrl) } : {}) }));
  const ids = new Set(sources.map((s) => s.id));
  const channels = value.data.channels.filter((c) => c && typeof c.id === 'string' && c.id.length <= 120 && ids.has(c.sourceId) && Array.isArray(c.streams))
    .map((c) => ({ id: c.id, sourceId: c.sourceId, name: String(c.name || '未命名频道').slice(0, 160),
      group: String(c.group || '未分类').slice(0, 160), logo: safeHttpUrl(c.logo) || '', tvgId: String(c.tvgId || '').slice(0, 160),
      addedAt: Number(c.addedAt) || Date.now(), streams: c.streams.slice(0, 10)
        .filter((s) => s && safeHttpUrl(s.url)).map((s) => ({ url: safeHttpUrl(s.url), kind: ['hls', 'mpegts', 'flv', 'file', 'auto'].includes(s.kind) ? s.kind : 'auto', label: String(s.label || '线路').slice(0, 40) })) }))
    .filter((c) => (c.streams.length || c.sourceId === HD_REFERENCE_SOURCE_ID) && c.sourceId !== PUBLIC_SOURCE_ID);
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
      const restored = installReferenceCatalog(sanitizeBackup(JSON.parse(await file.text())));
      if (!confirm('确认替换本设备现有的 ' + state.channels.length + ' 个频道？')) return;
      controller.reset(); ui.selected = null; ui.search = ''; $('#search').value = '';
      await commit(restored); closeModal(); notify('备份恢复成功，已导入 ' + restored.channels.length + ' 个频道', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : '备份恢复失败', 'error'); }
  });
}
function setupEvents() {
  $('#importBtn').addEventListener('click', openImport);
  $('#emptyImport').addEventListener('click', () => {
    const channel = state.channels.find(c => c.id === ui.selected);
    if (channel?.sourceId === HD_REFERENCE_SOURCE_ID && !availableStreams(channel).length) openBindLine();
    else openImport();
  });
  $('#bindLineBtn').addEventListener('click', openBindLine);
  $('#infoImport').addEventListener('click', openGitHubLibrary);
  $('#manageBtn').addEventListener('click', openManage);
  $('#shareBtn').addEventListener('click', async () => {
    const address = new URL(window.location.href);
    address.search = '';
    if (ui.selected) address.searchParams.set('ch', ui.selected);
    try {
      await navigator.clipboard.writeText(address.href);
      notify(ui.selected ? '频道链接已复制。另一设备需要导入相同清单才能播放。' : '网站链接已复制', 'success');
    } catch { notify('无法自动复制，请从浏览器地址栏复制链接', 'warn'); }
  });
  $('#githubBtn').addEventListener('click', openGitHubLibrary);
  $('#themeBtn').addEventListener('click', () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; theme(); savePrefs(); });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
  $('#search').addEventListener('input', e => { ui.search = e.target.value.trim(); ui.visible = 250; renderList(); });
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
  $('#nextLineBtn').addEventListener('click', () => {
    const channel = state.channels.find(c => c.id === ui.selected);
    const candidates = availableStreams(channel);
    if (candidates.length < 2) return;
    const select = $('#lineSelect');
    select.value = String((Number(select.value || 0) + 1) % candidates.length);
    playSelected();
    notify('已切换到：' + candidates[Number(select.value)].label, 'info');
  });
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
  for (const event of ['loadedmetadata', 'progress', 'durationchange', 'timeupdate', 'emptied']) video.addEventListener(event, refreshMetrics);
  setInterval(refreshMetrics, 1200);
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
  // Bundle the full public HD.Rip reference directory; preserve user-owned playlists.
  await commit(installReferenceCatalog(state));
  const sharedId = new URL(location.href).searchParams.get('ch');
  if (sharedId && state.channels.some((c) => c.id === sharedId)) {
    ui.selected = sharedId; updatePlayback('idle', '已载入分享频道，点击播放');
  } else if (sharedId) notify('此设备没有分享频道的数据，请先导入相同的播放清单', 'warn');
  else if (state.recent.length && state.channels.some((c) => c.id === state.recent[0])) {
    ui.selected = state.recent[0]; updatePlayback('idle', '已恢复最近频道，点击播放');
  }
  render();
  // Nonblocking central public catalog; local snapshot remains as offline fallback.
  void syncPublicBackend().catch(error => {
    console.warn('Public catalog API unavailable; bundled channels still work:', error?.message || error);
  });
}
init();
