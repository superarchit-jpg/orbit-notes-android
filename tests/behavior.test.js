// Compiles pure TypeScript functions to a temporary directory, then executes them.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-tests-'));
try{
 execFileSync('tsc',['layout.ts','trash.ts','--module','commonjs','--target','es2020','--outDir',temp,'--skipLibCheck','--noEmitOnError','false'],{stdio:'pipe'});
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
assert.equal(pruneTrash([{...batch,deletedAt:0}],31*86400000).length,0);
console.log('PASS: executable layout and trash tests');
