
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
  app.includes('withTiming(-point.x'),
  'Missing animated horizontal camera movement'
);

check(
  app.includes('withTiming(-point.y'),
  'Missing animated vertical camera movement'
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

console.log('PASS: PDF export module');

console.log(
  'PASS: All Orbit Notes v0.15 source checks'
);
