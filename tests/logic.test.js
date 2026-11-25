
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
  "balancedLibraryPositions(chunk,libraryCardHeights,grid,layoutColumnRef.current,mapPrefs.customColumns||{})",
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
  'onSaveCredential={async(value,kind)=>',
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
for(const marker of ['archiveSelection','showArchive','selectedTrash','acknowledgeTrashRetention','RichNoteEditor','storedCredentialType','mapPrefs.themeMode','retentionNotice','bioPrompted.current'])
  check(app.includes(marker),`Missing Stage 4 approved feature: ${marker}`);
check(!app.includes("Updated {activeReader?stamp"),'Note reader must not show modification date');
check(!app.includes("selected.includes(n.id)?'☑':'☐'"),'Card selection checkboxes must remain removed');
check(store.includes('trashRetentionAcknowledged')&&store.includes('archived:'),'Archived status and retention consent must persist');
check(richEditor.includes('contenteditable="true"')&&richEditor.includes('onShouldStartLoadWithRequest'),'Rich editor should format text directly and block remote navigation');
check(richEditor.includes('insertOrderedList')&&richEditor.includes('insertUnorderedList'),'Native list continuation requires editable list elements');
check(security.includes('export async function credentialKind')&&security.includes("kind==='password'")&&security.includes("kind==='pin'"),'Credential migration should preserve old PINs and support password mode');
console.log('PASS: Stage 4 new feature guards');

check(app.includes("focused:notes.some(n=>n.id===focused)?focused:'root'"),'Persistence must not save a missing focused note');
check(app.includes("const wholeMap=note.parentId==='root'")&&app.includes("setPendingBranch(result.batch)")&&app.includes("branchUndoDeadline.current=Date.now()+5000"), 'Branch deletion must use temporary Undo and preserve whole-map recovery');
check(app.includes('const remaining=branchUndoDeadline.current===null?5000:Math.max(0,branchUndoDeadline.current-Date.now())')&&app.includes('const timer=setTimeout(()=>{'), 'Undo notification must auto-dismiss after five seconds, including expired branch deadlines');
check(app.includes('This map and its descendants can be restored from Deleted for seven days.')&&app.includes('They will not appear in Deleted.'), 'Deletion confirmation must distinguish maps from permanently deleted branches');
check(app.includes('accessibilityLabel="Restore selected deleted maps"')&&app.includes("label={selectedTrash.length?'Delete forever':'Empty bin'}"), 'Deleted header selection and empty-bin controls must remain available');
check(app.includes('label="clearFormat" accessibilityLabel="Remove formatting"')&&richEditor.includes("clear:'removeFormat'"), 'Remove formatting must be available in the local rich editor');
check(app.includes('accessibilityLabel="Edit labels"')&&app.includes('accessibilityLabel="Rename label"'), 'Label-management flow must support inline rename');
check(app.includes('label="parentNote" accessibilityLabel="Go to parent note"')&&app.includes('label="centerFocus" accessibilityLabel="Center focused note"'), 'Map quick actions must use accessible vector icons');
check(app.includes('branchUndoDeadline.current=Date.now()+5000')&&app.includes('branchUndoDeadline.current=null;'), 'Branch deletion must finalize after Undo expires or is dismissed');
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
check(app.includes("setUndoBatch(result.batch.id)")&&app.includes("setTrash(existing=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...existing]):[result.batch,...existing])"),'Whole-map deletion must retain seven-day Deleted recovery');
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
  exp.includes('roots.map(root=>pdfMapPage(root,notes,colors,theme))') &&
  exp.includes("pages.join('')") &&
  app.includes('await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes,mapPrefs.colors,effectiveTheme)'),
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
check(themeTokens.includes("background:'#191F29'")&&themeTokens.includes("surface:'#222B36'")&&keepTheme.includes('ORBIT_DARK_PRESETS'),'Dark mode must use approved Option A slate and coordinated card presets');
check(app.includes("useLegacyScreen?'#AFC3F9':'#3C5367'")&&app.includes('selectedSidebarText'),'Dark selected navigation must use a blue highlight with contrasting text');
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
check(iconPaths.includes("'allMaps':'M5 12L20 2M5 12H20M5 12L20 22'"),'Approved LIB-03 icon required');
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

// Final acceptance and historical-code removal: no PPTX implementation or duplicate archive UI.
check(!exp.includes('exportPPTX')&&!exp.includes("from 'jszip'")&&!exp.includes('diagramShapes('),
 'Removed PPTX generator must not reappear in the PDF export module');
check(!localSave.includes("pptx: 'application/")&&localSave.includes("export type ExportFormat = 'pdf'"),
 'Local export must support PDF only');
check(!app.includes('const enablePin=')&&!app.includes('const disablePin=')&&!app.includes('const confirmPinChange='),
 'Obsolete PIN flow must remain removed; active OrbitSettings handles credential changes');
check(app.includes('data={libraryChunks}')&&(app.match(/<FlatList\s+ref=/g)||[]).length===1,
 'Library must have exactly one virtualized scrolling list');
check(app.includes('M58 56v23m-10-10 10 10 10-10')&&!app.includes('M58 11v40'),
 'Empty Archive must keep only the approved internal arrow illustration');
console.log('PASS: final cleanup, unified scrolling and approved Archive illustration guards');
check(app.includes("const wholeMap=note.parentId==='root'") &&
 app.includes('setPendingBranch(result.batch)') &&
 app.includes('branchUndoDeadline.current=Date.now()+5000') &&
 app.includes("setUndoBatch(null);") &&
 app.includes("This branch and its descendants will be permanently deleted after five seconds"),
 'Nested-branch deletion must permanently remove descendants after temporary Undo');
const permanentBranchBlock=app.slice(app.indexOf('}else{\n        // Exclude branch deletion'),app.indexOf('setUndoOpen(true);',app.indexOf('}else{\n        // Exclude branch deletion')));
check(!permanentBranchBlock.includes('setTrash('),'Temporary branch deletion must never enter Deleted');
check(app.includes('const clearUndoNotification=()=>')&&app.includes('onDismiss={clearUndoNotification}')&&app.includes('runOnJS(onDismiss)()'),
 'Swiping Undo away must invalidate the temporary restore snapshot');
check(app.includes("setNotes(existing=>restoreBatch(existing,pendingBranch))")&&app.includes('branchUndoDeadline.current!==null&&Date.now()>=branchUndoDeadline.current'),
 'Undo must restore the full branch only before deadline');
check(app.includes("color:'#fbbc04'")&&app.includes('const SwipeUndoNotice=')&&app.split('onUndo={undoDeletion}').length===3,
 'Branch Undo must use the same yellow as whole-map Undo');
check(!app.includes('label="Undo deletion"')&&!app.includes('accessibilityLabel="Undo deletion"'),
 'Undo action label must be Undo in both map and library contexts');
console.log('PASS: RC branch-only permanent deletion, deadline, matching Undo and map recovery');

check(app.includes("const LibraryGestureCard=")&&app.includes('onArchive={()=>archiveOne(n.id,true)}')&&app.includes("Math.abs(e.translationX)>cardWidth.value*0.65"),'Library cards must support a deliberate swipe-to-archive threshold');
check(app.includes("const reorderCard=")&&app.includes("measureInWindow")&&app.includes("customOrder:next"),'Custom drag reordering must persist in map preferences');
check(app.includes("['custom','created','modified','title']")&&app.includes('toggleLibraryDirection')&&app.includes("sortDirection==='asc'"),'Keep sort sheet must support Custom and both directions');
check(app.includes('const SwipeUndoNotice=')&&app.includes('runOnJS(onDismiss)()')&&app.includes('Math.abs(e.translationX)>90')&&app.includes('e.translationX>0?W+50:-W-50'),'Every Undo popup uses shared right-only swipe animation');
check(app.includes("onDragMove={(dx,dy)=>{")&&app.includes("setDragOrigin({id:n.id,top,left:column*(cellWidth+gutter),chunk:chunkIndex})"),'Custom reorder must update while dragging and allow selection');
check(app.includes("backgroundColor:librarySort==='created'||librarySort==='modified'?palette.background:'transparent'"),'Sort icon uses shade in date sorting');
console.log('PASS: Keep sort, drag, swipe archive and Undo gesture guards');

check(app.includes("const mapCount=ids.length")&&app.includes("Move ${mapCount} map${mapCount===1?'':'s'} to Deleted?"),
 'Multi-map deletion confirmation must count selected maps, not descendant notes');
check(app.includes("splitDeletedMaps([result.batch])")&&app.includes("setUndoMapIds(deletedMaps.map(batch=>batch.id))"),
 'Multi-map deletion must create separate per-map records with one Undo action');
check(app.includes("splitDeletedMaps(preferences.trashRetentionAcknowledged?pruneTrash(existing.trash):existing.trash)")&&app.includes("splitDeletedMaps(restored.trash)"),
 'Legacy grouped Deleted records must be normalized on load and backup restore');
check(app.includes("setTrash(existing=>existing.filter(batch=>!undoMapIds.includes(batch.id)))"),
 'Multi-map Undo must remove every restored recovery record');
check(exp.includes('pdfNodeStyle(n.note.id,n.level,isRoot,colors,theme)') &&
 exp.includes('nodeStyle.fill') && exp.includes('nodeStyle.text'),
 'SVG PDF circles and labels must use saved node colours and contrasting text');
check(app.includes('await exportPDF(root,notes,mapPrefs.colors,effectiveTheme)') &&
 app.includes('await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes,mapPrefs.colors,effectiveTheme)'),
 'Separate and combined PDF exports must retain selected map node colours');
console.log('PASS: independent deleted maps, grouped recovery compatibility, and PDF node colour preservation');




check(!exp.includes('fill="#f8fafc"')&&!exp.includes('<rect x="${minX}"')&&exp.includes('${edges}${circles}'),
 'All PDF export pages must have a white page background without a blue diagram rectangle');
check(app.includes('LinearTransition.duration(480)')&&app.includes('strongest.overlap>=0.70')&&app.includes('customOrder:next,customColumns:cols'),
 'Custom cards should move only after entering a new card and animate neighboring moves slowly');
check(app.includes('M9.1 12V4')&&app.includes('M14.9 12v8'),
 'Sorting glyph arrow shafts must stay compact');
check(settingsUi.includes("centerSpark")&&settingsUi.includes("centerDot")&&settingsUi.includes('opacity={dark?0.30:0.19}'),
 'App Info motif must continue behind content in both light and dark modes');
console.log('PASS: PDF background, Custom motion, sort icon, App Info regression checks');

check(app.includes('const libraryToolbar=(')&&app.includes('ListHeaderComponent={selected.length>0?<View style={{height:60}}/>:libraryToolbar}')&&app.includes('extraData={libraryCardHeights}'),
 'Library search and sidebar controls should scroll with the card content, and measured masonry cards should update the list');
check(app.includes("position:{top:number;left:number;width:number}")&&app.includes("position={{top:dragOrigin?.id===n.id"),
 'Cards must keep their identity when transitioning between masonry columns');
check(app.includes("navigationBarTranslucent")&&app.includes("edges={['top']}")&&app.includes("bottom:48,width:60,height:60"),
 'Library cards must extend behind the navigation footer while the Add button remains above it');
check(app.indexOf("accessibilityLabel={mapPrefs.viewMode==='grid'?'Switch to list view'")<app.indexOf('accessibilityLabel="Sort maps"'),
 'View toggle must precede Sort in the Library search control');
check(iconPaths.includes("'listView':'M4 6h16v5H4zM4 14h16v5H4z'")&&iconPaths.includes("'gridView':'M3 5h8v6H3z"),
 'List and grid icons must use smaller boxes');
console.log('PASS: continuous masonry, scrolling Library header and navigation-footer regressions');

check(app.includes('strongest.overlap>=0.70')&&app.includes('dragOrigin?.id===n.id')&&app.includes('setDragOrigin(null)'),
 'Custom drag must use 70-percent card coverage and freeze its origin until release');
check(app.includes('balancedLibraryPositions(chunk,libraryCardHeights,grid,layoutColumnRef.current,mapPrefs.customColumns||{})'),
 'Variable-height cards must use balanced masonry with stable prior column placement');
check(app.includes("selected.length>0&&<View style={{position:'absolute'")&&app.includes('ListHeaderComponent={selected.length>0?<View'),
 'Multi-selection toolbar must be fixed while regular Library toolbar scrolls');
check(app.includes("customOrder:[...new Set([...(p.customOrder||[]),...shown.map(n=>n.id),newId])]"),
 'New maps must append to Custom order without reshuffling existing maps');
console.log('PASS: responsive 70-percent drag, stable column balancing, selected toolbar and new map placement');

check(app.includes('{showTrash&&libraryToolbar}')&&!app.includes('{(showTrash||showArchive)&&libraryToolbar}'),
 'Archive must render its heading exactly once');
check(app.includes('cardWidth.value*0.07')&&app.includes('setSelected([]);setSelectionMenu(false);setCardMenuId(null);'),
 'Stationary long press must select; completed drag must clear selection');
check(app.includes('libraryListRef.current?.scrollToOffset')&&app.includes("targetKey=atEnd?'__end__':target"),
 'Library must auto-scroll while dragging and accept an end-of-list target');
check(app.includes('customColumns:cols')&&store.includes('customColumns?:Record<string,0|1>'),
 'Custom sort must preserve explicit column targets offline');
check(app.includes('minWidth:42,minHeight:42')&&app.includes('borderRadius:21'),
 'Sort circle must fit within the search pill');
console.log('PASS: latest drag thresholds, Archive header, custom columns and navigation corrections');

check(iconPaths.includes("'Fit':'M3 7V5")&&iconPaths.includes("'parentNote':'M5 3h14")&&iconPaths.includes("'centerFocus':'M12 3a9 9"),
 'Approved scan-line, preceding-level and crosshair paths must be registered');
check(iconPaths.includes("'expandBranch':'M7 9l5-5")&&iconPaths.includes("'collapseBranch':'M7 5l5 5"),
 'Approved inward and outward chevrons must distinguish branch states');
check(iconPaths.includes("'miniMapIcon':'M12 8v4")&&app.includes("if(name==='miniMapIcon')return <Svg"),
 'The mini-map icon must display the selected network graph');
check(app.includes('Icon Guide')&&app.includes("['Fit','Fit map'")&&app.includes("['miniMapIcon','Mini-map'")&&app.includes("['parentNote','Preceding level'"),
 'Map Help must describe the same icons used in the map controls');
check(app.includes('accessibilityLabel="Fit map to screen" onPress={fitCurrentMap}')&&
 app.includes('accessibilityLabel="Go to parent note" onPress={()=>{if(parent)moveTo(parent.id);}}')&&
 app.includes('accessibilityLabel={showMiniMap?"Hide mini-map":"Show mini-map"}'),
 'Approved icon changes must not alter map-control actions');
console.log('PASS: map-control icon approvals and Help symbol guide');

check(themeTokens.includes("background:'#F8F6F0'")&&themeTokens.includes("surface:'#FFFCF7'")&&
 themeTokens.includes("accent:'#536F86'")&&themeTokens.includes("background:'#191F29'"),
 'UI-01 approved warm Option A colors must drive both semantic themes');
check(keepTheme.includes('ORBIT_LIGHT_PRESETS')&&keepTheme.includes('ORBIT_DARK_PRESETS')&&
 app.includes('const CARD_PALETTE=[...ORBIT_LIGHT_PRESETS]')&&
 keepTheme.includes('KEEP_LIGHT_PRESETS.findIndex'),
 'UI-01 updated color swatches must preserve compatibility with saved legacy colors');
check(app.includes('const hold=Gesture.LongPress().enabled(canDrag).minDuration(480).maxDistance(8)')&&
 app.includes('Gesture.Race(Gesture.Simultaneous(drag,hold),swipe)')&&
 app.includes("librarySort!=='custom'&&setSelected(v=>")&&
 !app.includes('setDraggingMapId(n.id);setSelected('),
 'CUSTOM-07 stationary long press selects separately from card drag; drag never opens selection header');
check(app.includes('const iconSize=compact?21:23')&&
 iconPaths.includes("'centerFocus':'M12 3a9 9")&&
 iconPaths.includes("'collapseBranch':'M7 5l5 5")&&
 app.includes("}>Icon Guide</Text>"),
 'Approved icon size and stroke corrections and renamed Help guide must be present');
console.log('PASS: Option A global design, preserved saved colors, stationary selection and icon refinements');

check(themeTokens.includes('export const LEGACY_LIGHT=')&&themeTokens.includes("background:'#ECEEFF'")&&
 themeTokens.includes('export const LEGACY_DARK=')&&themeTokens.includes("background:'#11182A'")&&
 app.includes('const useLegacyScreen=(menu&&!showTrash)||(!!reader&&!editing)')&&
 app.includes('const palette=useLegacyScreen?oldPalette:optionAPalette'),
 'Selective palette reversion must affect Library, Archive and reading, not Deleted or Editor');
check(app.includes('palette={optionAPalette}')&&settingsUi.includes("page==='backup'?(optionAPalette.background===DARK.background?LEGACY_DARK:LEGACY_LIGHT):optionAPalette"),
 'Settings and App Lock stay Option A, while Backup/Restore uses the previous colors');
check(app.includes("top:Math.max(StatusBar.currentHeight||24,24)+4")&&
 app.includes('ListHeaderComponent={selected.length>0?<View style={{height:Math.max(StatusBar.currentHeight||24,24)+68}}/>:libraryToolbar}'),
 'Sticky multi-selection toolbar must clear the Android system status bar');
check(iconPaths.includes("'archive':'M3 4h18v5")&&iconPaths.includes("'unarchive':'M3 4h18v5")&&
 iconPaths.includes("'collapseBranch':'M7 5l5 5")&&
 iconPaths.includes("M12 3v3.6M12 17.4V21"),
 'Archive/Unarchive icon pair and smaller crosshair with separated chevrons must be present');
console.log('PASS: selective palette reversion, Android status bar clearance, and approved icon revisions');
