// Compiles pure TypeScript functions to a temporary directory, then executes them.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-tests-'));
try{
 execFileSync('tsc',['layout.ts','trash.ts','mapGeometry.ts','noteFormatting.ts','--module','commonjs','--target','es2020','--outDir',temp,'--skipLibCheck','--noEmitOnError','false'],{stdio:'pipe'});
}catch(e){if(!fs.existsSync(path.join(temp,'layout.js')))throw e;}
const {radialLayout,overviewLayout}=require(path.join(temp,'layout.js'));
const {deleteBranches,restoreBatch,pruneTrash}=require(path.join(temp,'trash.js'));
for(const n of [1,10,50,100]){
 const pts=radialLayout(n);assert.equal(pts.length,n);
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)assert.ok(Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y)>85,'overlapping circles');
 const l=overviewLayout(Array.from({length:Math.min(n,20)},(_,i)=>i%7));
 assert.equal(l.parents.length,Math.min(n,20));
}
const notes=[{id:'root',parentId:null},{id:'a',parentId:'root'},{id:'b',parentId:'a'},{id:'c',parentId:'root'}];
const {remaining,batch}=deleteBranches(notes,['a']);assert.deepEqual(remaining.map(x=>x.id),['root','c']);
assert.deepEqual(restoreBatch(remaining,batch).map(x=>x.id),['root','c','a','b']);
assert.throws(()=>restoreBatch(notes,batch),/conflicting/);
assert.equal(pruneTrash([{...batch,deletedAt:0}],7*86400000-1).length,1);
assert.equal(pruneTrash([{...batch,deletedAt:0}],7*86400000).length,0);
assert.equal(pruneTrash([{...batch,deletedAt:0}],31*86400000).length,0);
const {radialTree}=require(path.join(temp,'mapGeometry.js'));
const diameters=[120,110,90,80,75,70];
const deepNotes=Array.from({length:9},(_,i)=>({id:'n'+i,parentId:i?'n'+(i-1):null}));
const deepPositions=radialTree(deepNotes[0],deepNotes);
assert.equal(deepPositions.length,deepNotes.length);
for(let i=1;i<deepPositions.length;i++){
 const parent=deepPositions[i-1],child=deepPositions[i];
 const distance=Math.hypot(child.x-parent.x,child.y-parent.y);
 const clearance=distance-(diameters[Math.min(parent.level,5)]+diameters[Math.min(child.level,5)])/2;
 assert.ok(clearance>=29.99,`insufficient connector clearance at level ${child.level}: ${clearance}`);
}
console.log('PASS: GEO-03 deep-level connector clearance');
const {formatSelection,parseRichLine,plainNoteText}=require(path.join(temp,'noteFormatting.js'));
assert.equal(formatSelection('hello world',0,5,'bold'),'**hello** world');
assert.equal(formatSelection('hello world',0,5,'italic'),'*hello* world');
assert.equal(formatSelection('one\ntwo',0,7,'bullets'),'• one\n• two');
assert.equal(formatSelection('one\ntwo',0,7,'numbers'),'1. one\n2. two');
assert.equal(formatSelection('hello',0,5,'underline'),'__hello__');
assert.deepEqual(parseRichLine('hello **bold** and *italic*').filter(x=>x.bold||x.italic).map(x=>x.text),['bold','italic']);
assert.equal(parseRichLine('__underlined__')[0].underline,true);
assert.equal(plainNoteText('__underlined__'),'underlined');
// Previous checklist text remains readable but is not interactive.
assert.equal(parseRichLine('☐ existing unchecked note')[0].text,'☐ existing unchecked note');
assert.equal(plainNoteText('**bold** *italic*'),'bold italic');
assert.deepEqual(parseRichLine('**bold *and italic* still bold**').filter(run=>run.text).map(run=>({text:run.text,bold:run.bold,italic:run.italic})),[
 {text:'bold ',bold:true,italic:false},
 {text:'and italic',bold:true,italic:true},
 {text:' still bold',bold:true,italic:false}
]);
assert.equal(plainNoteText('literal **unclosed'),'literal **unclosed');
assert.equal(plainNoteText('**bold *and italic* still bold**'),'bold and italic still bold');
console.log('PASS: local rich-text helpers and checklist behavior');
console.log('PASS: executable layout and trash tests');
