import * as SQLite from 'expo-sqlite';
import type {Note} from './export';
import type {TrashBatch} from './trash';
export type Folder={id:string;name:string};
export type LocalSnapshot={notes:Note[];folders:Folder[];trash:TrashBatch[];focused:string};
const DB_NAME='orbit-notes.db';
let database:Promise<SQLite.SQLiteDatabase>|undefined;
let writeQueue:Promise<void>=Promise.resolve();
export function getDatabase():Promise<SQLite.SQLiteDatabase>{
 if(!database)database=(async()=>{
  const db=await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,parent_id TEXT,title TEXT NOT NULL,body TEXT NOT NULL,updated_at INTEGER NOT NULL,folder_id TEXT);
    CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id);
    CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trash(id TEXT PRIMARY KEY,payload TEXT NOT NULL,deleted_at INTEGER NOT NULL);`);
  const version=await db.getFirstAsync<{user_version:number}>('PRAGMA user_version');
  if((version?.user_version??0)>2)throw new Error('Database created by a newer Orbit Notes version');
  if((version?.user_version??0)<2)await db.execAsync('PRAGMA user_version=2');
  return db;
 })().catch(e=>{database=undefined;throw e;});
 return database;
}
export function assertSnapshot(s:LocalSnapshot):void{
 if(!s||!Array.isArray(s.notes)||!Array.isArray(s.folders)||!Array.isArray(s.trash)||typeof s.focused!=='string')throw new Error('Invalid notebook snapshot');
 const ids=new Set<string>();
 for(const n of s.notes){if(!n||typeof n.id!=='string'||ids.has(n.id)||typeof n.title!=='string'||typeof n.body!=='string'||typeof n.updatedAt!=='number'||(n.parentId!==null&&typeof n.parentId!=='string'))throw new Error('Invalid or duplicate note');ids.add(n.id);}
 if(!ids.has('root'))throw new Error('Notebook root missing');
 for(const n of s.notes)if(n.parentId!==null&&!ids.has(n.parentId))throw new Error('Note parent missing');
 if(!ids.has(s.focused))throw new Error('Focused note missing');
 for(const n of s.notes){const visited=new Set<string>();let p:Note|undefined=n;while(p){if(visited.has(p.id))throw new Error('Circular note hierarchy');visited.add(p.id);p=s.notes.find(x=>x.id===p?.parentId);}}
 for(const f of s.folders)if(!f||typeof f.id!=='string'||typeof f.name!=='string')throw new Error('Invalid folder');
 for(const b of s.trash)if(!b||typeof b.id!=='string'||!Array.isArray(b.notes)||typeof b.deletedAt!=='number')throw new Error('Invalid trash batch');
}
export async function loadSnapshot():Promise<LocalSnapshot|null>{
 await writeQueue;
 const db=await getDatabase();
 const initialized=await db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='initialized'");
 if(!initialized)return null;
 const [notes,folders,trash,focused]=await Promise.all([
  db.getAllAsync<Note>('SELECT id,parent_id AS parentId,title,body,updated_at AS updatedAt,folder_id AS folderId FROM notes'),
  db.getAllAsync<Folder>('SELECT id,name FROM folders'),
  db.getAllAsync<{payload:string}>('SELECT payload FROM trash'),
  db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='focused'")
 ]);
 const result={notes,folders,trash:trash.map(x=>JSON.parse(x.payload) as TrashBatch),focused:focused?.value||'root'};
 assertSnapshot(result);return result;
}
/** Serialized, atomic, differential persistence. No delete-all/reinsert-all. */
export function saveSnapshot(snapshot:LocalSnapshot):Promise<void>{
 const job=writeQueue.catch(()=>{}).then(async()=>{
  assertSnapshot(snapshot);
  const db=await getDatabase();
  await db.withExclusiveTransactionAsync(async tx=>{
   const oldNotes=await tx.getAllAsync<Note>('SELECT id,parent_id AS parentId,title,body,updated_at AS updatedAt,folder_id AS folderId FROM notes');
   const oldFolders=await tx.getAllAsync<Folder>('SELECT id,name FROM folders');
   const oldTrash=await tx.getAllAsync<{id:string;payload:string}>('SELECT id,payload FROM trash');
   const nextNoteIds=new Set(snapshot.notes.map(x=>x.id));
   for(const n of oldNotes)if(!nextNoteIds.has(n.id))await tx.runAsync('DELETE FROM notes WHERE id=?',n.id);
   const previousNotes=new Map(oldNotes.map(x=>[x.id,x]));
   for(const n of snapshot.notes){const old=previousNotes.get(n.id);if(!old||old.parentId!==n.parentId||old.title!==n.title||old.body!==n.body||old.updatedAt!==n.updatedAt||old.folderId!==n.folderId)
    await tx.runAsync('INSERT INTO notes(id,parent_id,title,body,updated_at,folder_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title,body=excluded.body,updated_at=excluded.updated_at,folder_id=excluded.folder_id',n.id,n.parentId,n.title,n.body,n.updatedAt,n.folderId);}
   const folderIds=new Set(snapshot.folders.map(x=>x.id));for(const f of oldFolders)if(!folderIds.has(f.id))await tx.runAsync('DELETE FROM folders WHERE id=?',f.id);
   const previousFolders=new Map(oldFolders.map(x=>[x.id,x]));for(const f of snapshot.folders)if(previousFolders.get(f.id)?.name!==f.name)await tx.runAsync('INSERT INTO folders(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',f.id,f.name);
   const trashIds=new Set(snapshot.trash.map(x=>x.id));for(const t of oldTrash)if(!trashIds.has(t.id))await tx.runAsync('DELETE FROM trash WHERE id=?',t.id);
   const previousTrash=new Map(oldTrash.map(x=>[x.id,x.payload]));for(const t of snapshot.trash){const payload=JSON.stringify(t);if(previousTrash.get(t.id)!==payload)await tx.runAsync('INSERT INTO trash(id,payload,deleted_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted_at=excluded.deleted_at',t.id,payload,t.deletedAt);}
   await tx.runAsync("INSERT INTO metadata(key,value) VALUES('focused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",snapshot.focused);
   await tx.runAsync("INSERT INTO metadata(key,value) VALUES('initialized','1') ON CONFLICT(key) DO NOTHING");
  });
 });
 writeQueue=job;return job;
}

/** Per-map visual preferences, stored on-device in the existing SQLite metadata table. */
export type MapPreferences={
  offsets:Record<string,number>;
  collapsed:Record<string,boolean>;
  colors:Record<string,string>;
  pinned:string[];
  theme:'light'|'dark';
  viewMode:'grid'|'list';
  cardColors:Record<string,string>;
  noteColors:Record<string,string>;
};
export const emptyMapPreferences=():MapPreferences=>({
  offsets:{},collapsed:{},colors:{},pinned:[],
  theme:'light',viewMode:'grid',cardColors:{},noteColors:{}
});
export async function loadMapPreferences():Promise<MapPreferences>{
  await writeQueue;
  const db=await getDatabase();
  const row=await db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='map_preferences'");
  if(!row)return emptyMapPreferences();
  try{
    const parsed=JSON.parse(row.value) as Partial<MapPreferences>;
    return {
      offsets:parsed.offsets&&typeof parsed.offsets==='object'?parsed.offsets:{},
      collapsed:parsed.collapsed&&typeof parsed.collapsed==='object'?parsed.collapsed:{},
      colors:parsed.colors&&typeof parsed.colors==='object'?parsed.colors:{},
      pinned:Array.isArray(parsed.pinned)?parsed.pinned.filter((x):x is string=>typeof x==='string'):[],
      theme:parsed.theme==='dark'?'dark':'light',
      viewMode:parsed.viewMode==='list'?'list':'grid',
      cardColors:parsed.cardColors&&typeof parsed.cardColors==='object'?parsed.cardColors:{},
      noteColors:parsed.noteColors&&typeof parsed.noteColors==='object'?parsed.noteColors:{}
    };
  }catch{return emptyMapPreferences();}
}
export function saveMapPreferences(prefs:MapPreferences):Promise<void>{
  const job=writeQueue.catch(()=>{}).then(async()=>{
    const db=await getDatabase();
    await db.runAsync("INSERT INTO metadata(key,value) VALUES('map_preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(prefs));
  });
  writeQueue=job;
  return job;
}
