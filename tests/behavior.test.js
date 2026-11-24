// Compiles pure TypeScript functions to a temporary directory, then executes them.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-tests-'));
try{
 execFileSync('tsc',['layout.ts','trash.ts','mapGeometry.ts','noteFormatting.ts','labels.ts','librarySearch.ts','richTextMarkup.ts','keepTheme.ts','libraryColumns.ts','orbitThemeTokens.ts','pdfNodeStyle.ts','--module','commonjs','--target','es2020','--outDir',temp,'--skipLibCheck','--noEmitOnError','false'],{stdio:'pipe'});
}catch(e){if(!fs.existsSync(path.join(temp,'layout.js')))throw e;}
// Audit regressions: alternating masonry order, large collections and theme roles.
const {partitionLibraryColumns,balancedLibraryPositions}=require(path.join(temp,'libraryColumns.js'));
const many=Array.from({length:250},(_,i)=>'map-'+i);
const grid=partitionLibraryColumns(many,true);
assert.equal(grid.length,2);
assert.deepEqual(grid[0].slice(0,3),['map-0','map-2','map-4']);
assert.deepEqual(grid[1].slice(0,3),['map-1','map-3','map-5']);
assert.deepEqual(partitionLibraryColumns(many,false)[0],many);
assert.equal(grid[0].length+grid[1].length,250);
const {LIGHT,DARK,uiRoles}=require(path.join(temp,'orbitThemeTokens.js'));
assert.equal(uiRoles(LIGHT).textPrimary,LIGHT.text);
assert.equal(uiRoles(DARK).surface,DARK.surface);
assert.equal(uiRoles(LIGHT).selectedBackground,LIGHT.accent);
const sample=[{id:'one'},{id:'two'},{id:'three'},{id:'four'}];
const sizes={one:300,two:95,three:100,four:120};
const balanced=balancedLibraryPositions(sample,sizes,true);
assert.deepEqual(balanced.map(p=>p.column),[0,1,1,1],
 'Variable-height maps should fill the shortest column, not alternate blindly');
const kept=balancedLibraryPositions(sample,sizes,true,{one:0,two:1,three:1,four:1});
assert.deepEqual(kept.map(p=>p.column),balanced.map(p=>p.column),
 'Unchanged cards should retain their balanced column placement');
assert.deepEqual(balancedLibraryPositions(sample,sizes,false).map(p=>p.column),[0,0,0,0],
 'List mode must remain one column');
const forced=balancedLibraryPositions([{id:'solo'}],{solo:120},true,{}, {solo:1});
assert.equal(forced[0].column,1,'An odd final card can remain in the right column');
const manual=balancedLibraryPositions([{id:'left'},{id:'right'},{id:'moved'}],{left:200,right:200,moved:100},true,{}, {moved:1});
assert.equal(manual[2].column,1,'Manual cross-column drop is honored before automatic balancing');
console.log('PASS: stable height-balanced Custom library placement');
console.log('PASS: virtualized-library partition and semantic theme roles');

const {radialLayout,overviewLayout}=require(path.join(temp,'layout.js'));
const {deleteBranches,restoreBatch,pruneTrash,splitDeletedMaps}=require(path.join(temp,'trash.js'));
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

const subtreeDelete=deleteBranches([
 {id:'root',parentId:null},{id:'map',parentId:'root'},{id:'branch',parentId:'map'},
 {id:'grandchild',parentId:'branch'},{id:'sibling',parentId:'map'}
],['branch']);
assert.deepEqual(subtreeDelete.remaining.map(n=>n.id),['root','map','sibling']);
assert.deepEqual(subtreeDelete.batch.notes.map(n=>n.id),['branch','grandchild']);
assert.deepEqual(restoreBatch(subtreeDelete.remaining,subtreeDelete.batch).map(n=>n.id),
 ['root','map','sibling','branch','grandchild']);
assert.deepEqual(subtreeDelete.remaining.map(n=>n.id),['root','map','sibling'],'expiry and dismissal finalize removal without adding to Deleted');
const wholeMapDelete=deleteBranches([
 {id:'root',parentId:null},{id:'map',parentId:'root'},{id:'branch',parentId:'map'}
],['map']);
assert.deepEqual(wholeMapDelete.batch.notes.map(n=>n.id),['map','branch']);
assert.equal(pruneTrash([wholeMapDelete.batch],wholeMapDelete.batch.deletedAt+5000).length,1,
 'whole maps remain recoverable beyond five-second Undo');
console.log('PASS: nested branch permanent removal/Undo and independent seven-day whole-map recovery');
// Multi-map deletion must preserve separate card, selection, restore and expiry semantics.
const groupedMapNotes=[
 {id:'root',parentId:null,title:'Root'},
 {id:'map-a',parentId:'root',title:'A'},
 {id:'a-1',parentId:'map-a',title:'A child'},
 {id:'a-2',parentId:'a-1',title:'A grandchild'},
 {id:'map-b',parentId:'root',title:'B'},
 {id:'b-1',parentId:'map-b',title:'B child'},
 {id:'map-c',parentId:'root',title:'C'}
];
const multi=deleteBranches(groupedMapNotes,['map-a','map-b']);
const independent=splitDeletedMaps([multi.batch]);
assert.equal(independent.length,2,'each map must show as a separate Deleted card');
assert.deepEqual(independent.map(b=>b.notes[0].id),['map-a','map-b']);
assert.equal(new Set(independent.map(b=>b.id)).size,2);
assert.deepEqual(independent.map(b=>b.notes.length),[3,2]);
assert.deepEqual(splitDeletedMaps(independent),independent,'migration is idempotent');
const restoreA=restoreBatch(multi.remaining,independent[0]);
assert.deepEqual(restoreA.map(x=>x.id),['root','map-c','map-a','a-1','a-2']);
assert.deepEqual(independent[1].notes.map(x=>x.id),['map-b','b-1']);
assert.ok(!restoreA.some(x=>x.id==='map-b'),'restoring one map must not restore another');
const restoreBoth=independent.reduce((acc,b)=>restoreBatch(acc,b),multi.remaining);
assert.deepEqual(restoreBoth.map(x=>x.id),['root','map-c','map-a','a-1','a-2','map-b','b-1']);
const single=deleteBranches(groupedMapNotes,['map-c']).batch;
assert.equal(splitDeletedMaps([single])[0].id,single.id,'single-map recovery IDs must stay unchanged');
const orphan={...multi.batch,notes:[...multi.batch.notes,{id:'legacy-orphan',parentId:'missing'}]};
const splitOrphan=splitDeletedMaps([orphan]);
assert.equal(splitOrphan.length,3);
assert.equal(splitOrphan[2].notes[0].id,'legacy-orphan','migration must not silently discard old data');
assert.equal(splitOrphan.every(b=>b.deletedAt===multi.batch.deletedAt),true,'retention timestamps preserved');
console.log('PASS: independent multi-map deletion, partial restore, legacy batch migration');

const {pdfNodeStyle}=require(path.join(temp,'pdfNodeStyle.js'));
const lightStyle=pdfNodeStyle('map-a',1,false,{'map-a':'#FAAFA9'},'light');
const darkStyle=pdfNodeStyle('map-a',1,false,{'map-a':'#FAAFA9'},'dark');
assert.equal(lightStyle.fill,'#F6DAD7');
assert.equal(darkStyle.fill,'#563A45');
assert.equal(lightStyle.text,'#2E3036');
assert.equal(darkStyle.text,'#F5F1E9');
assert.equal(pdfNodeStyle('a-1',3,false,{'a-1':'#123456'},'light').fill,'#123456');
assert.equal(pdfNodeStyle('a-1',3,false,{'a-1':'#123456'},'dark').fill,'#123456');
assert.equal(pdfNodeStyle('uncoloured',2,false,{},'light').fill,'#F3EBDF');
assert.equal(pdfNodeStyle('uncoloured',2,false,{},'dark').fill,'#343B46');
console.log('PASS: saved PDF node fill, readable text, and Light/Dark palette mapping');

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

const {labelIds,withLabels,addLabel,removeLabel,hasLabel,normalizeLabels}=require(path.join(temp,'labels.js'));
const legacy={id:'old-map',parentId:'root',folderId:'old-label'};
assert.deepEqual(labelIds(legacy),['old-label']);
const migrated=normalizeLabels([legacy])[0];
assert.deepEqual(migrated.labelIds,['old-label']);
const assigned=addLabel(addLabel(migrated,'second-label'),'second-label');
assert.deepEqual(assigned.labelIds,['old-label','second-label']);
assert.equal(assigned.folderId,'old-label');
assert.equal(hasLabel(assigned,'second-label'),true);
assert.deepEqual(labelIds(removeLabel(assigned,'old-label')),['second-label']);
assert.deepEqual(labelIds(removeLabel(assigned,'second-label')),['old-label']);
const restored=normalizeLabels([{...legacy,labelIds:['old-label','second-label']}]);
assert.deepEqual(restored[0].labelIds,['old-label','second-label']);
assert.deepEqual(labelIds(withLabels(legacy,[])),[]);
console.log('PASS: legacy migration, multiple label assignments and recovery');


const {matchesMapQuery}=require(path.join(temp,'librarySearch.js'));
const searchNotes=[
 {id:'root',parentId:null,title:'Root',body:''},
 {id:'map',parentId:'root',title:'Map',body:''},
 {id:'child',parentId:'map',title:'Child',body:''},
 {id:'grandchild',parentId:'child',title:'Third level',body:'UniqueOrbitSearchTerm in paragraph'},
 {id:'other',parentId:'root',title:'Other map',body:'irrelevant'}
];
assert.equal(matchesMapQuery(searchNotes[1],searchNotes,'uniqueorbitsearchterm'),true);
assert.equal(matchesMapQuery(searchNotes[1],searchNotes,'third level'),true);
assert.equal(matchesMapQuery(searchNotes[1],searchNotes,'map'),true);
assert.equal(matchesMapQuery(searchNotes[4],searchNotes,'uniqueorbitsearchterm'),false);
assert.equal(matchesMapQuery(searchNotes[1],searchNotes,'  '),true);
console.log('PASS: offline full-depth map search');
const {markupToHtml}=require(path.join(temp,'richTextMarkup.js'));
const numbered=markupToHtml('Before\n1. First\n2. **Second**\n3. *Third*\nAfter');
assert.ok(numbered.includes('<ol start="1"><li>First</li><li><strong>Second</strong></li><li><em>Third</em></li></ol>'));
assert.ok(numbered.includes('<div>Before</div>')&&numbered.includes('<div>After</div>'));
assert.ok(markupToHtml('4. Fourth\n5. Fifth').includes('<ol start="4">'));
assert.ok(markupToHtml('• A\n• B').includes('<ul><li>A</li><li>B</li></ul>'));
assert.equal(formatSelection('one',0,3,'numbers'),'1. one');
assert.equal(formatSelection('one\ntwo',0,7,'numbers'),'1. one\n2. two');
console.log('PASS: numbered lists and combined formatting emit semantic ordered-list HTML');

console.log('PASS: executable layout and trash tests');

const {KEEP_LIGHT_PRESETS,KEEP_DARK_PRESETS,KEEP_DARK_BACKGROUND,ORBIT_LIGHT_PRESETS,ORBIT_DARK_PRESETS,displayKeepColor,swatchKeepColor,keepForeground,keepChipStyle}=require(path.join(temp,'keepTheme.js'));
assert.equal(KEEP_LIGHT_PRESETS.length,20);
assert.equal(KEEP_DARK_PRESETS.length,20);
assert.equal(KEEP_DARK_BACKGROUND,'#11182A');
assert.equal(swatchKeepColor(1,'light'),'#F6DAD7');
assert.equal(swatchKeepColor(1,'dark'),'#563A45');
assert.equal(displayKeepColor('#FAAFA9','dark','#11182A'),ORBIT_DARK_PRESETS[1],'legacy pink selection must use coordinated Option A dark tone');
assert.equal(displayKeepColor('#FAAFA9','light','#ffffff'),'#F6DAD7');
assert.equal(displayKeepColor('#123456','dark','#11182A'),'#123456','manual colors must survive theme changes');
assert.equal(displayKeepColor(undefined,'dark','#0A0E1A'),'#0A0E1A');
assert.equal(keepForeground('#740D32'),'#F5F1E9');
assert.equal(keepForeground('#FAAFA9'),'#2E3036');
assert.notEqual(keepChipStyle('#740D32').backgroundColor,keepChipStyle('#FAAFA9').backgroundColor);
console.log('PASS: coordinated Option A palettes, readable dark cards and distinct label chips');

assert.equal(KEEP_LIGHT_PRESETS.slice(12).length,8,'two new dark-preset rows');
assert.equal(KEEP_DARK_PRESETS.slice(12).length,8);
assert.equal(displayKeepColor(KEEP_LIGHT_PRESETS[17],'dark','#000000'),ORBIT_DARK_PRESETS[17]);
assert.equal(displayKeepColor(ORBIT_LIGHT_PRESETS[17],'dark','#000000'),ORBIT_DARK_PRESETS[17]);
assert.equal(swatchKeepColor(0,'light'),ORBIT_LIGHT_PRESETS[0]);
assert.equal(swatchKeepColor(0,'dark'),ORBIT_DARK_PRESETS[0]);
console.log('PASS: twenty coordinated Option A presets; legacy stored colors are mapped without changing saved data');
