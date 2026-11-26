const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const ts=require('typescript');

const modules=new Map();
const native={};
function load(name){
 if(name in native)return native[name];
 if(!name.startsWith('./'))return require(name);
 if(modules.has(name))return modules.get(name);
 const source=fs.readFileSync(name+'.ts','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',js)(load,module,module.exports);
 modules.set(name,module.exports);
 return module.exports;
}

const root={id:'root',parentId:null,title:'alpha beta gamma delta epsilon zeta',body:'part1\tpart2',updatedAt:1,folderId:null};
const note={...root,id:'child',parentId:'root',title:'Child'};
const snapshot={notes:[root,note],folders:[],trash:[],focused:'child'};
const statements=[];
const applied=[];
let failPreferences=false;
let transactionFailed=false;
const database={
 execAsync:async()=>{},
 getFirstAsync:async()=>({user_version:3}),
 getAllAsync:async sql=>sql.startsWith('PRAGMA')?[{name:'label_ids'}]:[],
 runAsync:async(sql,...params)=>statements.push(['direct',sql,params]),
 withExclusiveTransactionAsync:async fn=>{
  const tx={
   getAllAsync:async()=>[],
   runAsync:async(sql,...params)=>{
    statements.push(['transaction',sql,params]);
    if(failPreferences&&sql.includes('map_preferences'))throw Error('Injected write failure');
   },
  };
  const start=statements.length;
  try{await fn(tx);applied.push(...statements.slice(start));}
  catch(e){transactionFailed=true;throw e;}
 },
};
native['expo-sqlite']={openDatabaseAsync:async()=>database};
native['expo-crypto']={
 getRandomBytes:crypto.randomBytes,randomUUID:crypto.randomUUID,CryptoDigestAlgorithm:{SHA256:'sha256'},
 digestStringAsync:async(algorithm,value)=>crypto.createHash(algorithm).update(value).digest('hex'),
};
const secure=new Map();
native['expo-secure-store']={
 getItemAsync:async key=>secure.get(key)??null,
 setItemAsync:async(key,value)=>secure.set(key,value),
 deleteItemAsync:async key=>secure.delete(key),
};
let prompts=0;
let biometricResponse=async()=>({success:true});
native['expo-local-authentication']={authenticateAsync:async()=>{prompts++;return biometricResponse();}};
const pages=[];
native['expo-print']={printToFileAsync:async({html})=>{pages.push(html);return {uri:'fixture.pdf'};}};
const removed=[];
let filesWritten=0;
native['expo-file-system/legacy']={
 cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64',UTF8:'utf8'},
 StorageAccessFramework:{
  requestDirectoryPermissionsAsync:async()=>({granted:true,directoryUri:'content://picked'}),
  createFileAsync:async(_dir,name)=>'content://picked/'+name,
 },
 readAsStringAsync:async()=>'UEQ=',
 writeAsStringAsync:async()=>{if(++filesWritten===2)throw Error('Disk full');},
 deleteAsync:async uri=>removed.push(uri),
};
native['expo-document-picker']={};

async function main(){
 const store=load('./storage');
 assert.throws(()=>store.assertSnapshot({...snapshot,trash:[{id:'b',deletedAt:2,notes:[]}]}),/Deleted entry/);
 assert.throws(()=>store.assertSnapshot({...snapshot,mapPreferences:{offsets:{child:'invalid'}}}),/Invalid map preferences/);
 assert.throws(()=>store.assertSnapshot({...snapshot,notes:[root,{...note,parentId:'child'}]}),/Circular/);
 const prefs=store.normalizeMapPreferences({theme:'dark'});
 assert.equal(prefs.themeMode,'dark');
 await store.saveSnapshot({...snapshot,mapPreferences:prefs});
 assert.ok(applied.some(([,sql])=>sql.includes('INSERT INTO notes')));
 assert.ok(applied.some(([scope,sql])=>scope==='transaction'&&sql.includes('map_preferences')));
 failPreferences=true;
 const successfulWrites=applied.length;
 await assert.rejects(store.saveSnapshot({...snapshot,mapPreferences:prefs}),/Injected write failure/);
 assert.equal(transactionFailed,true);
 assert.equal(applied.length,successfulWrites);
 await store.saveFocusedNote('child');
 assert.match(statements.at(-1)[1],/^UPDATE metadata/);

 const lock=load('./appLock');
 await lock.setPin('123456','pin');
 const attempts=await Promise.all(Array.from({length:7},()=>lock.verifyCredential('invalid')));
 assert.equal(attempts.filter(x=>x.alreadyBlocked).length,2);
 assert.deepEqual(attempts.slice(0,4).map(x=>x.attempts),[1,2,3,4]);
 assert.ok(attempts[4].blockedUntil>Date.now());

 assert.equal(await lock.authenticateBiometric(),false);
 assert.equal(prompts,0,'A blocked user should never see the Android prompt');
 const lockTime=Date.now;
 Date.now=()=>attempts[4].blockedUntil;
 try{
  assert.equal(await lock.authenticateBiometric(),true);
  assert.equal(prompts,1);
  let completePrompt;
  let notifyPrompt;
  const opened=new Promise(resolve=>{notifyPrompt=resolve;});
  biometricResponse=()=>new Promise(resolve=>{completePrompt=resolve;notifyPrompt();});
  const biometric=lock.authenticateBiometric();
  await opened;
  for(let i=0;i<5;i++)await lock.verifyCredential('invalid');
  completePrompt({success:true});
  assert.equal(await biometric,false,'A prompt already open must respect a newly started timeout');
 }finally{Date.now=lockTime;}

 const backup=load('./backup');
 const encrypted=backup.encryptSnapshot({...snapshot,mapPreferences:prefs},'example password');
 assert.deepEqual(backup.decryptSnapshot(encrypted,'example password'),{...snapshot,mapPreferences:prefs});
 assert.throws(()=>backup.encryptSnapshot({...snapshot,notes:[{...root,body:'x'.repeat(30*1024*1024)},note]},'example password'),/too large/);
 await backup.discardBackupFile('file:///cache/selected');
 await backup.discardBackupFile('content://user/original');
 assert.deepEqual(removed,['file:///cache/selected']);

 const exporter=load('./export');
 await exporter.exportMultipleMapsPDF([root,note],snapshot.notes);
 assert.equal((pages[0].match(/class="page"/g)||[]).length,2);
 assert.deepEqual([...pages[0].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(m=>m[1]),
  ['alpha beta gamma','delta epsilon','zeta','Child','Child']);
 assert.ok(pages[0].includes('part1 part2'));
 const result=await load('./localSave').saveMultiplePDFsToAndroid([
  {name:'One',uri:'one'},{name:'Two',uri:'two'},{name:'Three',uri:'three'},
 ]);
 assert.deepEqual(result.saved,['One.pdf']);
 assert.equal(result.failed.name,'Two.pdf');
 assert.equal(removed.at(-1),'content://picked/Two.pdf');

 const source=fs.readFileSync('RichNoteEditor.tsx','utf8');
 const serializer=source.slice(source.indexOf('function inline(node)'),source.indexOf('function serialize()')).replace(/\\\\n/g,'\\n');
 const block=new Function(serializer+'\nreturn block;')();
 const text=nodeValue=>({nodeType:3,nodeValue});
 const element=(tagName,...childNodes)=>({nodeType:1,tagName,childNodes,children:childNodes.filter(n=>n.nodeType===1),getAttribute:()=>null,hasAttribute:()=>false});
 const lines=block(element('UL',element('LI',text('Parent'),element('UL',element('LI',element('B',text('Child')))))));
 assert.deepEqual(lines,['• Parent','  • **Child**']);
 assert.deepEqual(block(element('B',text('Bold'))),['**Bold**']);
 assert.deepEqual(block(element('B',text('Before'),element('BR'),element('BR'),text('After'))),['**Before**\n\n**After**']);
 assert.deepEqual(block(element('B',element('BR'))),['']);
 assert.equal(load('./richTextMarkup').markupToHtml(lines.join('\n')),'<ul><li>Parent<ul><li><strong>Child</strong></li></ul></li></ul>');
 console.log('PASS: atomic restore, backup validation, concurrent verification, PDF export and rich editor serialization');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
