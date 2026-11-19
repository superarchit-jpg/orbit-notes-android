
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
  app.includes('Recently Deleted'),
  'Missing Recently Deleted interface'
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
  'accessibilityLabel="Open folders and tools"',
  'accessibilityLabel="Create new map"',
  'label="Gesture help"',
  'label="Go to parent note"',
  'label="Center focused note"',
  'label="Reset rotation"',
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
  'accessibilityLabel="Note content"',
  "accessibilityLabel={editing?'Cancel editing':'Close note'}",
  'styles.editorField',
  'styles.editorLabel',
  'No deleted notes. Notes moved here will appear for recovery.',
  'No maps in this folder',
  'No maps match this search.'
]) {
  check(app.includes(marker), `Missing approved UX-06 change: ${marker}`);
}
check(
  app.includes('onPress={saveEdit}') && app.includes('onPress={cancelReader}') &&
  app.includes('onPress={()=>restore(b)}'),
  'UX-06 must retain existing save, close and restore operations'
);
console.log('PASS: Stage 3 UX-06 editor and empty-state wiring');

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

console.log(
  'PASS: All Orbit Notes v0.16 source checks'
);
