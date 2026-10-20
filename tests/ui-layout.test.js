import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('HD.Rip-inspired two-column theater keeps existing working controls', () => {
  const ids = [
    'video', 'videoBox', 'videoEmpty', 'emptyImport', 'importBtn',
    'modal', 'modalBody', 'modalClose', 'notice', 'themeBtn', 'shareBtn',
    'githubBtn', 'sideGithubBtn', 'manageBtn', 'filters', 'search', 'sourceFilter',
    'clearGroup', 'groups', 'channelList', 'loadMore', 'visibleCount',
    'allCount', 'favCount', 'recentCount', 'topCount', 'libraryCount',
    'pageTitle', 'pageSubtitle', 'playBtn', 'prevBtn', 'nextBtn',
    'favBtn', 'retryBtn', 'pipBtn', 'fullBtn', 'lineSelect',
    'statusDot', 'statusText', 'currentName', 'currentGroup',
    'statChannels', 'statFav', 'statSources', 'infoImport',
    'playingLogo', 'playbackKind', 'codecText', 'resolutionText',
    'bufferText', 'bitrateText'
  ];
  for (const id of ids) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' not found');
    assert.match(js, new RegExp(id), id + ' not used in interaction code');
  }
  assert.match(css, /grid-template-columns:minmax\(292px,25\.75%\) minmax\(0,1fr\)/);
  assert.match(css, /\.channel-list\{[^}]*overflow:auto/);
  assert.match(html, /class="metrics"/);
  assert.match(html, /id="videoBox"[\s\S]*id="videoEmpty"/);
});

test('brand, favicon and capability indicators are accurate', () => {
  assert.match(html, /<title>MediaHub Live/);
  assert.match(html, /class="brand-mark"><img src="\/media\.png"/);
  assert.match(html, /rel="icon" href="\/media\.png"/);
  assert.match(css, /\.brand-mark img\{width:32px;height:32px/);
  assert.doesNotMatch(html, /Fox IPTV|P2P 已启用|187 个在线频道/);
  assert.match(html, /频道节目表、P2P 和弹幕尚未接入/);
  assert.match(js, /video\.videoWidth/);
  assert.match(js, /video\.buffered/);
  assert.match(js, /level\.bitrate/);
  assert.match(js, /codec = '—'/);
});

test('responsive screen places viewer above scrollable channel panel on phones', () => {
  assert.match(css, /@media\(max-width:780px\)/);
  assert.match(css, /\.main\{order:0;gap:10px\}/);
  assert.match(css, /\.sidebar\{order:1;/);
  assert.match(css, /aspect-ratio:16\/9/);
});

test('default mobile and desktop channel list displays all 184 reference stations without pagination', () => {
  assert.match(js, /visible: 250/);
  assert.equal((js.match(/ui\.visible = 150/g) || []).length, 0);
  assert.match(html, /id="bindLineBtn"/);
  assert.match(js, /installReferenceCatalog\(state\)/);
});
