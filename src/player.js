import { streamKind } from './playlist.js';
// Browser-only playback. No server-side proxy, DRM workaround or credential rewriting.
const LIBRARIES = {
  hls: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js',
  mpegts: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js'
};
const loading = new Map();
function loadLibrary(name) {
  if (loading.has(name)) return loading.get(name);
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBRARIES[name];
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('播放器组件加载失败，请检查网络是否允许访问 jsDelivr CDN'));
    document.head.append(script);
  });
  loading.set(name, pending);
  pending.catch(() => loading.delete(name));
  return pending;
}
export class PlayerController {
  constructor(video, onState) {
    this.video = video;
    this.onState = onState;
    this.instance = null;
    this.seq = 0;
    this.kind = '';
    this.active = false;
    this.boundError = () => {
      if (!this.active) return;
      const error = video.error;
      const code = error?.code;
      const details = code === 4 ? '播放格式或编码可能不兼容'
        : code === 3 ? '视频解码失败'
        : code === 2 ? '网络请求失败（可能涉及跨域或直播源不可用）'
        : '播放过程中遇到问题';
      this.onState('error', details);
    };
    this.boundWaiting = () => { if (this.active) this.onState('loading', '正在缓冲直播流…'); };
    this.boundPlaying = () => { if (this.active) this.onState('playing', '正在直播'); };
    this.boundEnded = () => { if (this.active) this.onState('ended', '播放已结束'); };
    video.addEventListener('error', this.boundError);
    video.addEventListener('waiting', this.boundWaiting);
    video.addEventListener('playing', this.boundPlaying);
    video.addEventListener('ended', this.boundEnded);
  }
  async load(stream) {
    this.reset();
    const ticket = this.seq;
    this.active = true;
    const url = stream.url;
    const kind = stream.kind && stream.kind !== 'auto' ? stream.kind : streamKind(url);
    this.kind = kind;
    this.onState('loading', '正在连接直播源…');
    let deferPlay = false;
    try {
      if (url.startsWith('http:') && window.location.protocol === 'https:') {
        throw new Error('这是 HTTP 直播源，HTTPS 网页通常会阻止混合内容；请使用授权的 HTTPS 地址');
      }
      if (kind === 'hls') {
        if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
          this.video.src = url;
        } else {
          await loadLibrary('hls');
          if (ticket !== this.seq) return;
          if (!globalThis.Hls?.isSupported()) throw new Error('当前浏览器不支持 HLS 的 Media Source 播放');
          const hls = new globalThis.Hls({ enableWorker: true, lowLatencyMode: true });
          deferPlay = true;
          hls.on(globalThis.Hls.Events.MANIFEST_PARSED, () => { if (ticket === this.seq) this.video.play().catch(() => this.onState('paused', '请点击播放按钮开始观看')); });
          this.instance = hls;
          hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
            if (ticket !== this.seq || !data.fatal) return;
            this.onState('error', 'HLS 读取失败：可能是源不可用、CORS、网络或编码问题');
          });
          hls.attachMedia(this.video);
          hls.on(globalThis.Hls.Events.MEDIA_ATTACHED, () => {
            if (ticket === this.seq) hls.loadSource(url);
          });
        }
      } else if (kind === 'mpegts' || kind === 'flv') {
        await loadLibrary('mpegts');
        if (ticket !== this.seq) return;
        const engine = globalThis.mpegts;
        if (!engine?.isSupported() || !engine.getFeatureList()?.mseLivePlayback) {
          throw new Error('此浏览器不支持 MPEG-TS / FLV 所需的媒体播放能力');
        }
        const player = engine.createPlayer({ type: kind === 'flv' ? 'flv' : 'mpegts', isLive: true, url },
          { enableWorker: false, liveBufferLatencyChasing: true });
        this.instance = player;
        player.on(engine.Events.ERROR, () => {
          if (ticket === this.seq) this.onState('error', 'TS/FLV 播放失败：请检查浏览器兼容性或直播源');
        });
        player.attachMediaElement(this.video);
        player.load();
      } else {
        this.video.src = url;
      }
      if (ticket !== this.seq || deferPlay) return;
      await this.video.play().catch((error) => {
        if (ticket !== this.seq) return;
        if (error?.name === 'NotAllowedError') {
          this.onState('paused', '浏览器需要播放手势，请点击视频中的播放按钮');
        } else if (error?.name !== 'AbortError') {
          this.onState('error', '无法开始播放：请检查源格式、跨域限制和网络连接');
        }
      });
    } catch (error) {
      if (ticket === this.seq) this.onState('error', error instanceof Error ? error.message : '无法播放此直播源');
    }
  }
  reset() {
    this.seq++;
    this.active = false;
    this.video.pause();
    if (this.instance) {
      try {
        if (typeof this.instance.unload === 'function') this.instance.unload();
        if (typeof this.instance.detachMediaElement === 'function') this.instance.detachMediaElement();
        this.instance.destroy();
      } catch { /* Existing playback might already have failed. */ }
      this.instance = null;
    }
    this.video.removeAttribute('src');
    this.video.load();
  }
  async play() {
    try { await this.video.play(); }
    catch { this.onState('paused', '请点击播放器以继续播放'); }
  }
  destroy() {
    this.reset();
    this.video.removeEventListener('error', this.boundError);
    this.video.removeEventListener('waiting', this.boundWaiting);
    this.video.removeEventListener('playing', this.boundPlaying);
    this.video.removeEventListener('ended', this.boundEnded);
  }
}
