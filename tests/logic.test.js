
'use strict';

// Orbit Notes v0.16
// Lightweight source-level regression checks.
// Device gesture and animation testing remains manual.

const fs = require('node:fs');
const assert = require('node:assert/strict');

const read = (filename) =>
  fs.readFileSync(filename, 'utf8');

const layout = read('layout.ts');
const geometry = read('mapGeometry.ts');
const trash = read('trash.ts');
const app = read('App.tsx');
const richEditor=read('RichNoteEditor.tsx');
const themeTokens=read('orbitThemeTokens.ts');
const iconPaths=read('orbitIcons.ts');
const libraryColumns=read('libraryColumns.ts');
const settingsUi=read('OrbitSettings.tsx');
const deletedViewer=read('DeletedMapReader.tsx');
const security=read('appLock.ts');
const store=read('storage.ts');
const exp = read('export.ts');
const localSave = read('localSave.ts');

function check(condition, message) {
  assert.ok(condition, message);
}

// Layout helpers
for (const name of [
  'radialLayout',
  'overviewLayout'
]) {
  check(
    layout.includes(name),
    `Missing layout helper: ${name}`
  );
}

for (const name of ['radialTree','fitMap','circularDragAngle','screenToWorld']) check(geometry.includes(`function ${name}`), `Missing map geometry helper: ${name}`);
console.log('PASS: map layout helpers');

// Recently Deleted and recovery
for (const name of [
  'deleteBranches',
  'restoreBatch',
  'pruneTrash'
]) {
  check(
    trash.includes(`function ${name}`),
    `Missing trash helper: ${name}`
  );
}

check(
  app.includes('No notes in Deleted') && app.includes('showTrash'),
  'Missing Deleted recovery interface'
);

console.log('PASS: deletion and recovery wiring');

// Map gestures
check(
  app.includes('Gesture.Exclusive(long,triple,double,single)'),
  'Missing long-press, triple-tap, double-tap and single-tap gestures'
);

check(
  app.includes('Gesture.Simultaneous(pan,pinch,rotate,rotateChildren)'),
  'Missing two-finger pan, pinch, map rotation and one-finger branch rotation gestures'
);

check(
  app.includes('showNodeActions'),
  'Missing long-press note actions'
);

check(
  app.includes('reparent'),
  'Missing note level movement'
);

console.log('PASS: map gesture wiring');

// Continuous camera transitions
check(
  app.includes('const moveTo='),
  'Missing map focus navigation'
);

check(
  app.includes('withTiming(-scale.value*(point.x*Math.cos(angle)-point.y*Math.sin(angle))'),
  'Focus navigation must preserve zoom while moving horizontally'
);

check(
  app.includes('withTiming(-scale.value*(point.x*Math.sin(angle)+point.y*Math.cos(angle))'),
  'Focus navigation must preserve zoom while moving vertically'
);

check(
  app.includes('},[canvasW,canvasH]);') &&
  !app.includes('[menu,focused,preferredFit]') &&
  app.includes('useEffect(()=>{if(!menu)scale.value=withTiming(preferredFit*1.1,{duration:300});},[menu]);'),
  'Zoom reference must not change when nodes or focus change'
);

check(
  app.includes('scale.value=withTiming(fit.scale*1.1)'),
  'Manual Fit must still update zoom'
);

check(
  app.includes('const preferredFit=useMemo(()=>{const fit=fitMap([{x:-313.5,y:0},{x:313.5,y:0}]') &&
  !app.includes('const preferredFit=useMemo(()=>{const points=visible'),
  'The 100% zoom baseline must remain independent of visible node count'
);

check(
  app.includes('tx.value=withTiming(-scale.value*(focusPoint?.x||0))') &&
  app.includes('ty.value=withTiming(-scale.value*(focusPoint?.y||0))'),
  'Recenter must not override the current zoom'
);

check(
  app.includes('duration:560'),
  'Missing configured focus transition'
);

check(
  app.includes('const visible=useMemo'),
  'Missing persistent map layout calculation'
);

console.log('PASS: continuous transition wiring');

// Stage 3 accepted UX: map controls, accessible labels, reliable touch targets and help.
for (const marker of [
  'accessibilityLabel="Back to library"',
  'accessibilityLabel="Fit map to screen"',
  'accessibilityLabel="More map actions"',
  'Open sidebar',
  'accessibilityLabel="Create new map"',
  'label="Help"',
  'accessibilityLabel="Go to parent note"',
  'accessibilityLabel="Center focused note"',
  'Show mini-map',
  'minHeight:48'
]) {
  check(app.includes(marker), `Missing Stage 3 UI control: ${marker}`);
}
check(
  !app.includes('label="↖"') && !app.includes('label="⌖"') && !app.includes('label="▣"'),
  'Ambiguous map action symbols must not return to the header'
);
check(
  app.includes('scale.value=withTiming(fit.scale*1.1)') &&
  app.includes('Gesture.Simultaneous(pan,pinch,rotate,rotateChildren)'),
  'Stage 3 must preserve Fit and gesture behavior'
);
console.log('PASS: Stage 3 approved UX control wiring');

for (const marker of [
  'accessibilityLabel="Note title"',
  
  "accessibilityLabel={draftChildId===reader?'Discard new child note':'Close note'}",
  'styles.editorField',
  'styles.editorLabel',
  'No notes in Deleted',
  'No maps in this label',
  'No maps match this search.'
]) {
  check(app.includes(marker), `Missing approved UX-06 change: ${marker}`);
}
check(
  app.includes('onPress={saveEdit}') && app.includes('onPress={cancelReader}') &&
  app.includes('onPress={restoreSelectedTrash}'),
  'UX-06 must retain existing save, close and restore operations'
);
check(richEditor.includes('accessibilityLabel="Note content"'),'Offline rich editor must retain accessible note content label');
console.log('PASS: Stage 3 UX-06 editor and empty-state wiring');

for (const marker of [
  'PaletteContext.Provider',
  "effectiveTheme==='dark'",'const mapPreview=(root:Note,previewNotes:Note[]=notes)=>',
  "mapPrefs.viewMode==='grid'&&mapPreview(n)",
  'Change selected card colors',
  "Filter '+item.name", 'Create new map',
  'FadeInLeft.duration(220)', "No maps in this label",
  'formatSelection(value,textSelection.start',
  'parseRichLine(line)', 'label="bullets" active={editorFormats.bullets} accessibilityLabel="Bulleted list"',
  "onRequestClose={cancelReader}", 'label="palette" accessibilityLabel="Note color"'
]) check(app.includes(marker), `Missing approved Keep redesign wiring: ${marker}`);
check(themeTokens.includes('export const LIGHT=')&&themeTokens.includes('export const DARK='),'Keep colours must remain in shared theme module');
check(iconPaths.includes('export const ICON_PATHS'),'Vector paths must remain available in shared module');
check(app.includes('FlatList')&&libraryColumns.includes('partitionLibraryColumns'),'Library virtualization and masonry order must remain available');
check(!app.includes('label="Reminders"')&&app.includes('showArchive'),'Archive must be explicitly separated from active library and Reminders must remain absent');
console.log('PASS: approved Keep-inspired redesign wiring');

// Targeted device feedback regression: pinned cards and new child draft lifecycle.
check(
  app.includes('accessibilityLabel="Pin or unpin selected maps"') &&
  app.includes('accessibilityLabel="Unpin map"') &&
  app.includes("selected.length===0&&mapPrefs.pinned.includes(n.id)") &&
  app.includes("fill={palette.accent}") &&
  !app.includes("label={mapPrefs.pinned.includes(n.id)?'★':'☆'}"),
  'Pinned maps need a visible corner pin; unpinned maps use selection actions'
);
check(
  app.includes('const closeReaderWithCross=()=>') &&
  app.includes('onPress={closeReaderWithCross}') &&
  app.includes('if(draftChildId&&draftChildId===reader)') &&
  !app.includes("draftChildId===reader&&!title.trim()&&!body.trim()") &&
  app.includes('if(editing){saveEdit();return;}'),
  'New children must persist on Done or Back and disappear only on explicit cross'
);
console.log('PASS: pinned map and child note persistence regression');

// Approved recording follow-up requirements.
for(const marker of [
  'thumbnailHeight=Math.min(332',
  "mapPrefs.viewMode==='grid'?[0,1]:[0]",
  "label={mapPrefs.viewMode==='grid'?'listView':'gridView'}",
  'accessibilityLabel="Sort maps"',
  'label="palette" accessibilityLabel="Node color"',
  "label={mapPrefs.collapsed[focused]?'expandBranch':'collapseBranch'}",
  'visible={gestureHelp}',
  'height:150,marginHorizontal:12',
  'accessibilityLabel="Settings"',
  'Rename label',
  'Delete label?',
  'setFolders(fs=>fs.map',
  'const confirmPinChange=async()=>',
  'onSaveCredential={async(value,kind)=>',
  "isPinLockEnabled()",
  'label="numbers" active={editorFormats.numbers} accessibilityLabel="Numbered list"',
  'label="underline" active={editorFormats.underline} accessibilityLabel="Underline text"'
]) check(app.includes(marker),`Missing approved recording improvement: ${marker}`);
for(const obsolete of [
  'label="Reset rotation"',
  "'Map gesture guide'",
  'label="App lock & settings"',
  "applyNoteFormat('checklist')",
  'toggleChecklistLine(n.body,index)',
  'new Date(n.updatedAt).toLocaleDateString'
]) check(!app.includes(obsolete),`Removed functionality resurfaced: ${obsolete}`);
check(app.includes('accessibilityLabel="Center focused note"'),'Working recenter action must remain');
console.log('PASS: 26 approved recording changes and scope exclusions');
for(const marker of ['archiveSelection','showArchive','selectedTrash','acknowledgeTrashRetention','RichNoteEditor','credentialType','mapPrefs.themeMode','retentionNotice','bioPrompted.current'])
  check(app.includes(marker),`Missing Stage 4 approved feature: ${marker}`);
check(!app.includes("Updated {activeReader?stamp"),'Note reader must not show modification date');
check(!app.includes("selected.includes(n.id)?'☑':'☐'"),'Card selection checkboxes must remain removed');
check(store.includes('trashRetentionAcknowledged')&&store.includes('archived:'),'Archived status and retention consent must persist');
check(richEditor.includes('contenteditable="true"')&&richEditor.includes('onShouldStartLoadWithRequest'),'Rich editor should format text directly and block remote navigation');
check(richEditor.includes('insertOrderedList')&&richEditor.includes('insertUnorderedList'),'Native list continuation requires editable list elements');
check(security.includes('export async function credentialKind')&&security.includes("kind==='password'")&&security.includes("kind==='pin'"),'Credential migration should preserve old PINs and support password mode');
console.log('PASS: Stage 4 new feature guards');

check(app.includes("focused:notes.some(n=>n.id===focused)?focused:'root'"),'Persistence must not save a missing focused note');
check(app.includes('setTrash(t=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...t]):[result.batch,...t])')&&app.includes('setUndoBatch(result.batch.id)')&&app.includes('setUndoOpen(true)'), 'Branch deletion must enter seven-day Recently Deleted with Undo');
check(app.includes('setTimeout(()=>{setUndoOpen(false)')&&app.includes('},5000)'), 'Undo notification must auto-dismiss after five seconds');
check(app.includes('remain recoverable for seven days before permanent removal'), 'Retention information must be shown during deletion');
check(app.includes('accessibilityLabel="Restore selected deleted maps"')&&app.includes("label={selectedTrash.length?'Delete forever':'Empty bin'}"), 'Deleted header selection and empty-bin controls must remain available');
check(app.includes('label="clearFormat" accessibilityLabel="Remove formatting"')&&richEditor.includes("clear:'removeFormat'"), 'Remove formatting must be available in the local rich editor');
check(app.includes('accessibilityLabel="Edit labels"')&&app.includes('accessibilityLabel="Rename label"'), 'Label-management flow must support inline rename');
check(app.includes('label="parentNote" accessibilityLabel="Go to parent note"')&&app.includes('label="centerFocus" accessibilityLabel="Center focused note"'), 'Map quick actions must use accessible vector icons');
check(!app.includes('permanently deleted after the five-second Undo period'), 'Branch deletion must not bypass seven-day recovery');
console.log('PASS: Stage 4 correction regression guards');

// REF-01 through REF-07: approved interaction parity without new note backgrounds.
for(const marker of [
  "const ActionRow=", "icon={showArchive?'unarchive':'archive'}",
  'accessibilityLabel="Edit labels"', 'accessibilityRole="checkbox"',
  'selected.includes(n.id)?3:1', 'labelIds(n).map(',
  'accessibilityLabel="Restore selected deleted maps"',
  'onFormatStateChange={state=>setEditorFormats(previous=>({...previous,...state}))}', "CARD_PALETTE.map((color,index)=>"
]) check(app.includes(marker),'Missing approved REF visual/interaction guard: '+marker);
check(app.includes('accessibilityState={{selected:chosen}}'),'Selected palette swatch must have visible and accessible state');
check(app.includes('backgroundColor:all?palette.accent'),'Label checkboxes must show multi-selection state');
check(!app.includes("selected.includes(n.id)?'☑':'☐'"),'Map cards must not reintroduce selection checkboxes');
for(const marker of [
  "selected.length+' maps selected'",
  "accessibilityLabel={\'Delete label \'+item.name}",
  'fontFamily:\'Roboto\'',
  "icon=\"upLevel\"",
  "icon=\"downLevel\"",
  "icon=\"exportIcon\"",
  "icon=\"helpIcon\"",
  'fontWeight:\'600\'',
  "backgroundColor:'#202124'",
  "showArchive?("
]) check(app.includes(marker),'Missing consolidated candidate interaction parity: '+marker);
check(app.includes("setUndoBatch(result.batch.id)")&&app.includes("setTrash(t=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...t]):[result.batch,...t])"),'Note deletion must enter Recently Deleted, never bypass seven-day recovery');
for(const token of [
  'mapPreview(batch.notes.find(n=>n.parentId',
  "previewNotes:Note[]=notes",
  "key={batch.id}",
  "label={showArchive?'Unarchive':'Archive'}",
  'borderBottomColor:palette.border,backgroundColor:editingFolderId'
]) check(app.includes(token),'Missing visible REF recovery/label UI: '+token);
console.log('PASS: REF Deleted recovery previews, action affordances and label edit states');
console.log('PASS: REF parity actions, labels, selected colors and scope exclusions');



// Upright labels during rotation
check(
  app.includes('const Upright='),
  'Missing upright label component'
);

check(
  app.includes('-angle.value'),
  'Missing counter-rotation for labels'
);

console.log('PASS: upright label wiring');

// Library and note editing
check(
  app.includes('const newMap='),
  'Missing new map action'
);

check(
  app.includes("parentId:'root'"),
  'Missing top-level map creation'
);

check(
  app.includes('const saveEdit='),
  'Missing note save action'
);

check(
  app.includes('setSelected'),
  'Missing multi-selection support'
);

check(
  app.includes('setSidebar'),
  'Missing folder sidebar'
);

console.log('PASS: library and editor wiring');

// PDF export
check(
  app.includes('exportPDF'),
  'Missing PDF export integration'
);

check(
  app.includes('confirmExport'),
  'Missing export confirmation handler'
);

check(
  app.includes("exportOne('pdf'"),
  'Missing PDF export action'
);

check(
  !app.includes("exportOne('pptx'"),
  'PowerPoint export should not appear in the interface'
);

console.log('PASS: PDF export wiring');

// Android local file saving
for (const name of [
  'requestDirectoryPermissionsAsync',
  'createFileAsync',
  'writeAsStringAsync'
]) {
  check(
    localSave.includes(name),
    `Missing Android local save API: ${name}`
  );
}

check(
  app.includes('saveExportToAndroid'),
  'Missing Android save integration'
);

check(
  !app.includes('Sharing.shareAsync'),
  'Export should use local saving instead of sharing'
);

console.log('PASS: Android local export wiring');

// Verify that PDF export module is connected.
check(
  exp.includes('exportPDF'),
  'Missing PDF export implementation'
);

check(
  exp.includes('for(const n of nodes)') && !exp.includes('Math.min(...nodes.map') && !exp.includes('Math.max(...nodes.map'),
  'Large-map PDF bounds must avoid spreading node arrays into Math.min/Math.max'
);

check(
  exp.includes('export async function exportMultipleMapsPDF') &&
  exp.includes('roots.map(root=>pdfMapPage(root,notes))') &&
  exp.includes("pages.join('')") &&
  app.includes('await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes)'),
  'Combined PDF export must render every selected map as its own page'
);
console.log('PASS: PDF export module and large-map bounds');


const librarySearch=read('librarySearch.ts');
const richMarkup=read('richTextMarkup.ts');
check(app.includes('matchesMapQuery(n,notes,librarySearch)')&&librarySearch.includes('while(pending.length)'), 'Search must traverse all descendant note titles and bodies');
check(app.includes('librarySearching||librarySearch.length>0')&&app.includes('accessibilityLabel="Clear search"'), 'Search mode must hide sort and view controls');
check(app.includes('if(selected.length){setSelected([]);return true;}')&&app.includes('else if(selected.length)setSelected([])'), 'Back must clear selected maps before exiting');
check(app.includes("setDeletedPreview(batch)")&&app.includes('onLongPress={()=>setSelectedTrash'), 'Deleted maps require tap preview and long press selection');
check(app.includes('visible={deletedPreview!==null}')&&app.includes('<DeletedMapReader')&&deletedViewer.includes('Read only'), 'Deleted preview must open nonmutating gesture-enabled reader');
check(app.includes('accessibilityLabel="New label name"')&&app.includes("setLabelManager(true)"), 'Label creation must share inline editing');
check(app.includes("colorTarget==='node'")&&!app.includes('Custom hex color')&&app.includes('accessibilityLabel="Dismiss color palette"'), 'Palettes use presets only and dismiss outside');
check(app.includes("accessibilityLabel={'More actions for '")&&app.includes("setCardMenuPosition({top:")&&app.includes("cardMenuId&&<View"), 'Library and Archive cards require anchored overflow menus');
check(app.includes("setCardMenuId(null)")&&app.includes("setSelected([cardMenuId!])"), 'Card menu must dismiss safely while supporting labels and color actions');
check(app.includes('accessibilityLabel="Text formatting"')&&app.includes('accessibilityLabel="Close formatting toolbar"'), 'Formatting controls must use a persistent popover');
check(richEditor.includes('flatMap(block)')&&richEditor.includes("clear:'removeFormat'"), 'Rich editor must serialize nested lists and support clear formatting');
check(richMarkup.includes("'<ol start="), 'Numbered-list storage should retain semantic ol elements');
check(!app.includes('<Button label="Close" onPress={()=>setGestureHelp(false)}/>'), 'Guide must not show Close');
check(!app.includes('<Button label="Cancel" onPress={()=>setColorTarget(null)}/>'), 'Palettes must not show Cancel');
const keepTheme=read('keepTheme.ts');
check(app.includes("const DARK={background:KEEP_DARK_BACKGROUND")&&keepTheme.includes("KEEP_DARK_SELECTED='#ADC3F9'"),'Dark mode must use the blue reference palette');
check(app.includes("selectedSidebarColor=darkSelection?'#AFC3F9'")&&app.includes('selectedSidebarText'),'Dark selected navigation must use a blue highlight with contrasting text');
check(app.includes('displayKeepColor(mapPrefs.cardColors[n.id],effectiveTheme,palette.surface)')&&app.includes('keepChipStyle(displayKeepColor('),'Cards and label chips must adapt to Dark mode');
check(app.includes('displayKeepColor(mapPrefs.colors[n.id],effectiveTheme')&&app.includes('noteDisplayColor'),'Node and note colors must adapt to Dark mode');
check(app.includes('visible={moveFolderMenu} animationType="slide"')&&app.includes('accessibilityRole="checkbox"')&&app.includes('Search or create labels'),'Label assignment must use searchable checkbox modal');
check(app.includes("selected.includes(note.id)?{...addLabel(note,newId)"),'Label creation must assign new label to the selected maps');
check(app.includes('if(name===\'restoreIcon\')return <Svg')&&app.includes('fill={color}'),'Restore must use a filled history-clock icon');
check(app.includes("name==='format'")&&app.includes("name==='clearFormat'"),'Editor must use underlined-A and slashed-T reference icons');
check(!app.includes('accessibilityLabel="Unarchive map"'),'Unarchive must not appear as a standalone card action');
const securitySource=read('appLock.ts');
check(settingsUi.includes("modeButton('light','Light')")&&settingsUi.includes("modeButton('dark','Dark')")&&settingsUi.includes("modeButton('system','System')"),'Theme must use three in-page pills');
check(settingsUi.includes('<Switch accessibilityLabel="Enable app lock"')&&settingsUi.includes('<Switch accessibilityLabel="Biometric Unlock"'),'Lock and biometric settings must be genuine switches');
check(settingsUi.includes('visible={credentialModal!==null}')&&settingsUi.includes("rgba(0,0,0,0.62)"),'Credential setup must be centered over a dimmed screen');
check(settingsUi.includes("stage==='verify'")&&settingsUi.includes('onVerify(oldValue)'), 'Credential replacement must verify existing credential');
check(securitySource.includes('/^\\d{4,}$/')&&securitySource.includes('Array.from(value).length<6'),'Credentials require minimum lengths without ceilings');
check(settingsUi.includes("row('Backup & Restore'")&&settingsUi.includes("row('Create Backup'")&&settingsUi.includes("row('Restore Backup'"),'Manual encrypted backup and restore must remain available');
check(!settingsUi.includes('App information and version')&&!settingsUi.includes('Encrypted local backup')&&!settingsUi.includes('Use device biometrics first'),'Removed settings help subtitles must not reappear');
check(app.includes('setCredentialFallback(false)')&&app.includes('Use PIN instead')&&app.includes('Use Password instead'),'Lock screen must have biometric-first and credential fallback options');
check(deletedViewer.includes('Gesture.Simultaneous(pan,pinch,rotate)')&&deletedViewer.includes('setReading')&&deletedViewer.includes('setCollapsed'),'Deleted viewer must support gestures and read-only hierarchy navigation');
check(!app.includes('Deleted {stamp(batch.deletedAt)}')&&!app.includes("accessibilityLabel={'Restore '+"),'Deleted cards must not show timestamp or restore controls');
check(app.includes("width:mapPrefs.viewMode==='grid'?'48.2%':'100%'"),'Deleted list/grid layout must follow library preference');
check(app.includes('miniRotationStyle')&&app.includes('<Animated.View style={miniRotationStyle}>'),'Mini-map must rotate with the main map');
check(app.includes("'allMaps':'M5 12L20 2M5 12H20M5 12L20 22'"),'Approved LIB-03 icon required');
check(richEditor.includes('Empty formatted spans are editor artifacts'),'Rich editor must preserve blank lines without formatting tokens');
console.log('PASS: REG-07, DEL-05/06, COL-03, MAP-11 and EDT-04 source regression guards');
console.log('PASS: Google Keep video-reference styling, controls and icons');
console.log('PASS: outstanding correction functional wiring guards');

console.log(
  'PASS: All Orbit Notes v0.16 source checks'
);

// Latest acceptance changes: X discards unsaved text, editor Undo/Redo are local,
// and the map-wide control does not mutate persisted hierarchy.
check(app.includes('const closeReaderWithCross=()=>') && app.includes('setEditing(false);\n  setDraftChildId(null);\n  setReader(null);'), 'The editor X must dismiss without saving');
check(!app.includes('Debounced local autosave preserves edits'), 'Editing must not silently persist drafts');
check(app.includes('label="undo"') && app.includes('label="redo"'), 'Editor-only Undo and Redo controls must exist');
check(app.includes('showEntireMap?completeMap') && app.includes('label={showEntireMap?'), 'Expand/Collapse whole-map control must exist');
console.log('PASS: latest acceptance correction guards');
