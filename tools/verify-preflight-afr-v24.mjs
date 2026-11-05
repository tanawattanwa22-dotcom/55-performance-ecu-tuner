import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=x=>fs.readFileSync(x,'utf8');
const index=get('index.html'),p=get('ui/neon-preflight-v24.js'),ui=get('ui/neon-v20.js');
const live=get('ui/neon-live-v21.js'),main=get('flash_port/main-source-live-v19.js');
const source=get('flash_port/main-source-diagnostic.js');
assert(index.includes('ui/neon-preflight-v24.js'),'V24 read-only preflight entry loaded');
assert(index.includes('ui/neon-preflight-v24.css'),'Preflight theme loaded');
assert(/ui\/neon-live-v21\.js\?v=\d+/.test(index)&&index.includes('ui/neon-main-live-v25.js'),'Main C# Neon Live assets are cached correctly');
assert(ui.includes('window.__55FlashPreflight.mount(stage)'),'Flash route mounts new V24 page');
assert(ui.includes("flash:[],recovery:[],live:"),'old Flash page UI hidden instead of duplicating');
assert(p.includes('engine.identify({programmingPreflight:true})'),'real physical ECU ID from C# programming preflight');
assert.match(p,/const restored=await shared\.restoreCable\?\.\(\)/,
 'Preflight recovers only the approved FT232R handle after a WebUSB transferIn loss');
assert.match(p,/physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'/,
 'Original FormMain unknown ID path may continue only after fresh physical family ACK');
assert.match(p,/if\(current\(\)\.valid&&\(last\?\.identity\?\.sourceMatched\|\|proof\)\)await runCheck\(\)/,
 'Unlisted ECU with source ACK must reach read-only BIN / Memory Map check');
assert.doesNotMatch(p,/sourceMatched\)await runCheck\(\)/,
 'Do not skip Main source-backed unknown ECU solely because Part Code catalog has no row');

assert.match(p,/const physicalFamilyAck=identity\?\.programmingSessionVerified===true&&/,
 'Supplementary ECM.dat must not erase the real physical Family ACK state');
assert.match(p,/else if\(!identity\.sourceMatched&&!physicalFamilyAck\)/,
 'Preflight must not say Family is unverified when original source count ACK is confirmed');
assert.match(p,/originalEcmAuto&&binEstimate\?\.startOffsetHex/,
 'ECM.dat AUTO start field should display BIN-only inferred offset without write approval');
assert.match(p,/originalEcmAuto&&binEstimate\?\.checksumOffsetHex/,
 'ECM.dat AUTO checksum field should display BIN-only inferred checksum without write approval');
assert.match(p,/BIN ให้รหัส ECU เพียง 3 ไบต์ตาม FormMain/,
 'Partial BIN ECU ID must remain explicitly unverified before any erase');
assert(p.includes('last.engine.makePlan(c.bytes.slice()'),'strict C# plan from saved BIN snapshot');
assert(p.includes('sourceMatched'),'catalog and family source matching enforced');
assert(p.includes('S.saved')&&p.includes('TuneBinFlow.matches'),'preflight uses saved immutable BIN only');
assert(p.includes('Date.now()-last.at<TTL'),'physical ID freshness required');
assert(p.includes('target.click()'),'flash action delegates to original button');
assert(!/\.(?:flash|khPreErase|shPreErase|writeRaw|erase)\s*\(/.test(p),'UI module must not contain a destructive operation');
assert(p.includes("hardware:false"),'physical backup, supply and wiring MUST NOT self-pass');
assert(!/99%|0xA1B2C3D4/.test(p),'no mock ECU ID / offset / confidence displayed; valid 512KB BIN size is allowed');
assert(live.includes('"afr"')&&live.includes('n21-afr-provenance'),'nine sensors including AFR and provenance');
assert(index.includes('const afrSupported=!!(liveProfile?._afrOk&&liveProfile.afr)'),'legacy ADX bridge still blocks unverified Wideband values outside Main source');
assert(get('ui/neon-main-live-v25.js').includes('s.group!==7'),'new Main C# bridge rejects unsupported A/F from Group 7');
assert(source.includes("n('A/F',af(b(46))")&&source.includes("n('A/F',af(b(60))"),'Main C# A/F retained for groups 1 and 4');
assert(!source.slice(source.lastIndexOf('return [...base,')).includes("n('A/F'"),'group 7 cannot fabricate unsupported A/F');
assert(main.includes("'A/F'")&&main.includes('ordered.slice(0,9)'),'source A/F shown in full C# live reader');
console.log('PASS V24 Preflight real-data-only, saved BIN gating, C# sensor source mapping and original engine delegation');
