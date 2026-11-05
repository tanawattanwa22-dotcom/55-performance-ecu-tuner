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
assert.match(p,/setItem\('block',Number\.isInteger\(plan\?\.blockBytes\)/,
 'Real plan remains the only verified Block Size source');
assert.match(p,/Number\.isInteger\(binEstimate\?\.binBlockBytes\)/,
 'Read-only Block Size preview comes from BIN and cannot manufacture a verified plan');
assert.match(p,/binEstimate\?\.binProfile\?binEstimate\.binProfile\+' • BIN เท่านั้น'/,
 'Read-only C# profile preview is labelled as BIN-only');
assert(p.includes('sourceBinPreview')&&p.includes("verified:false,origin:'BIN_ONLY'"),
 'Dashboard BIN offset preview never carries physical verification');
assert(p.includes("const actions=make('div','n24-actions n24-main-check-actions')")&&
 p.includes('stage.append(actions);')&&
 !p.includes('fastLabel,actions);'),
 'ECU read and Preflight controls are visible in the main Fast Flash page, not trapped inside advanced details');
assert(p.includes("()=>runCheck({requestConfirmation:true})"),
 'Manual Preflight action must request explicit technician confirmation for source 3-byte BIN IDs');
assert(p.includes('if(!requestConfirmation&&!previouslyApproved)')&&p.includes('confirmedPart:\'CONFIRM \'+id'),
 'Auto Preflight may calculate partial BIN-ID source plan; manual check remains available and real Flash still asks for approval');
// The purchased Shindengen source has no full-read route. Its absence must
// never be silently represented as a completed physical ECU backup.
const writer=get('flash_port/honda-write-engine.js');
assert(writer.includes('backupUnavailableAcknowledged=false')&&
 writer.includes('const backupWaiverAllowed=!!backupUnavailableAcknowledged&&!plan.recovery;'),
 'Normal flash accepts an explicit backup-unavailable acknowledgement; Recovery remains stricter');
assert(writer.includes('!externalPowerConfirmed||!recoveryReady'),
 'Lack of full backup must NOT waive power and recovery checks');
assert(index.includes('const hasThisEcuBackup=confirm(')&&
 index.includes('const noBackupAck=!hasThisEcuBackup&&confirm(')&&
 index.includes('physicalBackupConfirmed:hasThisEcuBackup,')&&
 index.includes('backupUnavailableAcknowledged:noBackupAck,'),
 'Flash UI must accurately distinguish existing original backup from risk acknowledgement');
assert(index.includes('ui/neon-preflight-v24.js?v=411')&&
 index.includes('honda-write-engine.js?v=395'),
 'Chrome must reload the current engine and honest no-backup flow');
assert(p.includes("if(!requestConfirmation&&!previouslyApproved){")&&
 p.includes("confirmedPart:'CONFIRM '+last.identity.ecuId")&&
 p.includes("message='Auto Preflight:"),
 'Auto Preflight must calculate the C# source partial-ID BIN plan without manual button presses');
assert(p.includes("if(current().valid&&(last?.identity?.sourceMatched||proof))await runCheck({requestConfirmation:false})"),
 'Automatic ECU read must attempt read-only plan for source physical family ACK');
assert(p.includes("TX / RX LOG • Fast Flash")&&
 p.includes("window.__55FlashLogRefresh=()=>")&&
 p.includes("window.__55ExportFlashLog?.()"),
 'Actual Fast Flash screen must expose live TX/RX and downloadable logs');
assert(index.includes('window.__55FlashLogRefresh?.()')&&
 index.includes('window.__55ExportFlashLog=inlineFlashExportLog')&&
 index.includes('ui/neon-preflight-v24.js?v=412'),
 'Flash engine log must feed the visible Fast Flash screen with a refreshed browser module');
const engine=get('flash_port/honda-write-engine.js');
assert(engine.includes("stage:'TX',tx:toHex(frame)")&&
 engine.includes("stage:'RX',rx:toHex(reply)"),
 'Flash engine must emit original transmitted and validated received bytes');
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
