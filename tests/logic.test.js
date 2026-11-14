// Lightweight source-level regression checks; device gesture QA remains manual.
const fs=require('fs');const assert=require('assert');
const layout=fs.readFileSync('layout.ts','utf8');const trash=fs.readFileSync('trash.ts','utf8');const app=fs.readFileSync('App.tsx','utf8');const exp=fs.readFileSync('export.ts','utf8');
for(const name of ['radialLayout','overviewChildren'])assert(layout.includes(`function ${name}`));
for(const name of ['deleteBranches','restoreBatch','pruneTrash'])assert(trash.includes(`function ${name}`));
assert(app.includes('Recently Deleted'));assert(app.includes('Gesture.Exclusive(double,single)'));
assert(exp.includes('diagramShapes'));assert(exp.includes('prst="ellipse"'));
console.log('PASS: layout, recovery, gestures, and PPTX diagram wiring');

const localSave=fs.readFileSync('localSave.ts','utf8');
assert(localSave.includes('requestDirectoryPermissionsAsync'));
assert(localSave.includes('createFileAsync'));
assert(localSave.includes('writeAsStringAsync'));
assert(app.includes('confirmExport'));
assert(!app.includes('Sharing.shareAsync'));
console.log('PASS: Android local export SAF wiring');
