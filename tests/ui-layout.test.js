import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');

test('HD.Rip-style theater retains real controls and source management', () => {
  const ids = [
    'video', 'videoBox', 'videoEmpty', 'emptyImport', 'importBtn',
    'modal', 'modalBody', 'modalClose', 'notice', 'themeBtn', 'shareBtn',
    'githubBtn', 'manageBtn', 'search', 'channelList', 'loadMore',
    'pageTitle', 'pageSubtitle', 'playBtn', 'prevBtn', 'nextBtn',
    'favBtn', 'retryBtn', 'pipBtn', 'fullBtn', 'lineSelect',
    'nextLineBtn', 'bindLineBtn', 'statusDot', 'statusText', 'currentName',
    'currentGroup', 'statChannels', 'statFav', 'statSources', 'infoImport',
    'playingLogo', 'playbackKind', 'codecText', 'resolutionText',
    'bufferText', 'bitrateText', 'topCount'
  ];
  for (const id of ids) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' missing from HTML');
    assert.ok(js.includes("'" + '#' + id + "'") || js.includes("'" + id + "'"), id + ' has no JS handler');
  }
  assert.match(html, /class="metrics"/);
  assert.match(html, /id="videoBox"[\s\S]*id="videoEmpty"/);
  assert.match(css, /\.channel-list\{[^}]*overflow:auto/);
});

test('sidebar only shows the search input and uninterrupted channel list', () => {
  const sidebar = html.split('<aside class="sidebar"')[1].split('</aside>')[0];
  assert.match(sidebar, /id="search"/);
  assert.match(sidebar, /id="channelList"/);
  for (const forbidden of ['id="filters"', 'id="groups"', 'id="sourceFilter"', 'id="clearGroup"',
    'id="allCount"', 'id="favCount"', 'id="recentCount"', 'id="sideGithubBtn"']) {
    assert.ok(!sidebar.includes(forbidden), forbidden + ' is not in HD.Rip UI');
  }
  assert.ok(!js.includes('renderGroups()'));
  assert.ok(!js.includes('renderSources()'));
  assert.ok(!js.includes('ui.group'));
  assert.ok(!js.includes('ui.filter'));
  assert.ok(!js.includes('ui.source'));
  assert.match(css, /#app \.sidebar \.channel-main\{[^}]*width:100%/);
  assert.match(js, /String\(channel\.referenceId \|\| index \+ 1\)/);
});

test('cache-busted CSS and JS never pair older styles with a newer HTML page', () => {
  const cssVersion = html.match(/href="\/src\/styles\.css\?v=([^"]+)"/)?.[1];
  const jsVersion = html.match(/src="\/src\/main\.js\?v=([^"]+)"/)?.[1];
  assert.ok(cssVersion);
  assert.equal(cssVersion, jsVersion);
  assert.match(headers, /\/src\/\*[\s\S]*Cache-Control: no-cache, must-revalidate/);
  assert.match(css, /#app \.now-card\{display:flex;flex-direction:column/);
  assert.match(css, /#app \.now-card \.metrics\{display:flex;flex-flow:row wrap/);
  assert.match(css, /#app \.screen-footer\{display:none!important\}/);
});

test('mobile UI places search plus channel list above the video player', () => {
  assert.match(css, /@media\(max-width:780px\)/);
  assert.match(css, /#app \.sidebar\{order:0;flex:0 0 338px/);
  assert.match(css, /#app \.main\{order:1;min-height:0/);
  assert.match(css, /#app \.video-box\{aspect-ratio:16\/9/);
});

test('branding, icon and accurate playback state are preserved', () => {
  assert.match(html, /<title>MediaHub Live/);
  assert.match(html, /class="brand-mark"><img src="\/media\.png"/);
  assert.match(html, /rel="icon" href="\/media\.png"/);
  assert.doesNotMatch(html, /Fox IPTV|P2P 已启用|187 个在线频道/);
  assert.match(html, /频道节目表、P2P 和弹幕尚未接入/);
  assert.match(js, /video\.videoWidth/);
  assert.match(js, /video\.buffered/);
  assert.match(js, /level\.bitrate/);
});
