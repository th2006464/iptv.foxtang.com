import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE } from '../src/store.js';
import { HD_REFERENCE_CHANNELS } from '../src/hd-reference-channels.js';
import {
  HD_REFERENCE_SOURCE_ID, LEGACY_DEFAULT_SOURCE_IDS, getReferenceChannels,
  installReferenceCatalog, addReferenceStream, matchOwnPlaylist,
  findReferenceId, refreshReferencePublicStreams
} from '../src/hd-reference-catalog.js';

const all = getReferenceChannels();
const station = number => all.find(x => x.referenceId === number);

test('HD.Rip public JSON-LD reference directory contains exactly 184 numbered stations', () => {
  assert.equal(HD_REFERENCE_CHANNELS.length, 184);
  assert.equal(all.length, 184);
  assert.equal(HD_REFERENCE_CHANNELS[0].id, 155);
  assert.equal(HD_REFERENCE_CHANNELS[0].name, '阿里郎 Arirang');
  assert.equal(new Set(all.map(x => x.referenceId)).size, 184);
  assert.equal(station(84)?.name, 'HBO');
  assert.equal(station(219)?.name, 'HBO Malaysia');
  assert.equal(station(62)?.name, '爱尔达体育1台');
  assert.equal(station(165)?.name, '博斯网球');
  assert.equal(station(141)?.name, '无线翡翠台 (香港)');
  assert.equal(station(197)?.name, 'TVBS新闻台');
  assert.equal(station(148)?.name, '中视');
  assert.equal(station(149)?.name, '中视');
  assert.equal(all[0].id, 'ref-155');
  assert.equal(all[all.length-1].id, 'ref-150');
  for (const row of all) {
    assert.equal(row.sourceId, HD_REFERENCE_SOURCE_ID);
    assert.ok(Array.isArray(row.streams));
    assert.ok(row.group);
  }
});

test('pay-TV stations are displayed but never assigned an unverified free stream', () => {
  for (const id of [84, 81, 85, 86, 219, 62, 61, 108, 365, 24, 164, 165, 136, 82]) {
    assert.ok(station(id), 'missing TV station ' + id);
    assert.equal(station(id).streams.length, 0, 'unexpected stream for pay-TV reference ' + id);
  }
  assert.ok(station(155).streams.length >= 2);
  assert.ok(station(181).streams.length >= 1);
  assert.ok(station(169).streams.length >= 1);
  assert.ok(station(114).streams.length >= 1);
  assert.ok(station(402).streams.length >= 1);
  assert.ok(!JSON.stringify(all).includes('https://hd.rip/'));
});

test('install migrates older defaults while keeping user M3U, favorites and history', () => {
  const mine = {
    id:'user-personal',sourceId:'private',name:'我的频道',group:'私人',
    tvgId:'Personal.tv',streams:[{url:'https://example.org/private.m3u8',kind:'hls'}]
  };
  const old = {
    ...EMPTY_STATE(),
    sources:[
      {id:'mediahub-curated-v2',name:'旧台',type:'builtin',enabled:true},
      {id:'private',name:'私人列表',type:'file',enabled:true},
      {id:'github-iptv-org-default-v1',name:'旧全球列表',type:'url',enabled:true}
    ],
    channels:[
      {id:'curated-arirang',sourceId:'mediahub-curated-v2',name:'阿里郎 Arirang',tvgId:'ArirangTV.kr',streams:[{url:'https://example.org/arirang.m3u8',kind:'hls'}]},
      {id:'giant-legacy',sourceId:'github-iptv-org-default-v1',name:'其他源',streams:[]},
      mine
    ],
    favorites:['curated-arirang','user-personal'],recent:['curated-arirang','user-personal']
  };
  const result = installReferenceCatalog(old, 200);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].id, HD_REFERENCE_SOURCE_ID);
  assert.equal(result.channels.length, 185);
  assert.ok(result.channels.find(c=>c.id==='user-personal'));
  assert.ok(!result.channels.find(c=>c.id==='curated-arirang'||c.id==='giant-legacy'));
  assert.ok(result.favorites.includes('ref-155'));
  assert.ok(result.favorites.includes('user-personal'));
  assert.ok(result.recent.includes('ref-155'));
  assert.ok(result.channels.find(c=>c.id==='ref-155').streams.some(s=>s.url==='https://example.org/arirang.m3u8'));
  const second=installReferenceCatalog(result,300);
  assert.equal(second.channels.length,185);
  assert.ok(second.favorites.includes('ref-155'));
  for(const id of LEGACY_DEFAULT_SOURCE_IDS)assert.ok(!second.sources.some(s=>s.id===id));
});

test('user can bind personal HBO line locally, then preserve it across refresh', () => {
  const original=installReferenceCatalog(EMPTY_STATE(),100);
  const url='https://example.org/my-hbo.m3u8?access_key=private';
  const updated=addReferenceStream(original,'ref-84',url,'我的合法订阅');
  assert.equal(updated.channels.find(c=>c.id==='ref-84').streams.length,1);
  assert.equal(updated.channels.find(c=>c.id==='ref-84').streams[0].url,url);
  const twice=addReferenceStream(updated,'ref-84',url);
  assert.equal(twice.channels.find(c=>c.id==='ref-84').streams.length,1);
  assert.equal(installReferenceCatalog(twice,500).channels.find(c=>c.id==='ref-84').streams[0].url,url);
  assert.throws(()=>addReferenceStream(original,'ref-999','https://example.org/z.m3u8'),/只能为参考频道/);
  assert.throws(()=>addReferenceStream(original,'ref-84','javascript:alert(1)'),/有效/);
});

test('paid HBO and ELTA stations match names and TVG IDs from user playlists', () => {
  assert.equal(findReferenceId({name:'HBO',tvgId:'HBO.tw@SD'}),84);
  assert.equal(findReferenceId({name:'ELTA Sports 1',tvgId:'ELTASports1.tw@HD'}),62);
  assert.equal(findReferenceId({name:'博斯网球',tvgId:'BossTennis.tw'}),165);
  assert.equal(findReferenceId({name:'中视',tvgId:''}),null,'ambiguous duplicate name must not auto-match');
  const base=installReferenceCatalog(EMPTY_STATE());
  const input={...base,sources:[...base.sources,{id:'personal-list',type:'file',name:'我的 M3U',enabled:true}],
    channels:[...base.channels,
      {id:'p1',sourceId:'personal-list',name:'HBO',tvgId:'HBO.tw@SD',streams:[{url:'https://example.org/hbo.m3u8',kind:'hls'}]},
      {id:'p2',sourceId:'personal-list',name:'ELTA Sports 1',tvgId:'ELTASports1.tw@HD',streams:[{url:'https://example.org/elta.m3u8',kind:'hls'}]}
    ]};
  const matched=matchOwnPlaylist(input);
  assert.equal(matched.addedLines,2);
  assert.equal(matched.matchedStations,2);
  assert.ok(matched.state.channels.find(c=>c.id==='ref-84').streams.some(s=>s.url.includes('/hbo')));
  assert.ok(matched.state.channels.find(c=>c.id==='ref-62').streams.some(s=>s.url.includes('/elta')));
  assert.ok(matched.state.channels.find(c=>c.id==='p1'),'original private source must remain untouched');
  assert.equal(matchOwnPlaylist(matched.state).addedLines,0);
});

test('public refresh updates whitelisted free channels only, never HBO', async () => {
  const base=installReferenceCatalog(EMPTY_STATE(),100);
  const sample=[
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="ABCNews.us",ABC News',
    'https://abcnews-streams.akamaized.net/hls/live/99999/abcnews/master.m3u8',
    '#EXTINF:-1 tvg-id="HBO.tw",HBO',
    'https://fake.example.org/pirate-hbo.m3u8'
  ].join('\n');
  const response=await refreshReferencePublicStreams(base,async()=>({
    ok:true,headers:{get:()=>String(sample.length)},text:async()=>sample
  }));
  assert.ok(response.newLines>=1);
  assert.equal(response.state.channels.find(c=>c.id==='ref-84').streams.length,0);
  assert.ok(response.state.channels.find(c=>c.id==='ref-2').streams.some(s=>s.url.includes('/99999/')));
  assert.equal(response.state.channels.length,base.channels.length);
});
