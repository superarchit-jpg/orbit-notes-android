import * as SQLite from 'expo-sqlite';
import type {Note} from './export';
import type {TrashBatch} from './trash';
import {labelIds,normalizeLabels} from './labels';
export type Folder={id:string;name:string};
export type LocalSnapshot={notes:Note[];folders:Folder[];trash:TrashBatch[];focused:string;mapPreferences?:MapPreferences};
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
  if((version?.user_version??0)>3)throw new Error('Database created by a newer Orbit Notes version');
  const columns=await db.getAllAsync<{name:string}>('PRAGMA table_info(notes)');
  if(!columns.some(column=>column.name==='label_ids'))await db.execAsync('ALTER TABLE notes ADD COLUMN label_ids TEXT');
  if((version?.user_version??0)<3)await db.execAsync('PRAGMA user_version=3');
  return db;
 })().catch(e=>{database=undefined;throw e;});
 return database;
}
function validateNotes(notes:Note[],requireParents:boolean){
 const byId=new Map<string,Note>();
 for(const note of notes){
  if(!note||typeof note.id!=='string'||!note.id||byId.has(note.id)||typeof note.title!=='string'||typeof note.body!=='string'||
     !Number.isFinite(note.updatedAt)||(note.parentId!==null&&typeof note.parentId!=='string')||
     (note.folderId!=null&&typeof note.folderId!=='string')||
     (note.labelIds!==undefined&&(!Array.isArray(note.labelIds)||note.labelIds.some(id=>typeof id!=='string'))))
   throw new Error('Invalid or duplicate note');
  byId.set(note.id,note);
 }
 const checked=new Set<string>();
 for(const note of notes){
  const path=new Set<string>();
  let current:Note|undefined=note;
  while(current&&!checked.has(current.id)){
   if(path.has(current.id))throw new Error('Circular note hierarchy');
   path.add(current.id);
   const parentId:string|null=current.parentId;
   current=parentId===null?undefined:byId.get(parentId);
   if(parentId!==null&&!current&&requireParents)throw new Error('Note parent missing');
  }
  path.forEach(id=>checked.add(id));
 }
 return byId;
}

export function assertSnapshot(s:LocalSnapshot):void{
 if(!s||!Array.isArray(s.notes)||!Array.isArray(s.folders)||!Array.isArray(s.trash)||typeof s.focused!=='string')throw new Error('Invalid notebook snapshot');
 const notes=validateNotes(s.notes,true);
 if(notes.get('root')?.parentId!==null)throw new Error('Notebook root missing or invalid');
 if(!notes.has(s.focused))throw new Error('Focused note missing');
 const folders=new Set<string>();
 for(const f of s.folders){
  if(!f||typeof f.id!=='string'||folders.has(f.id)||typeof f.name!=='string')throw new Error('Invalid or duplicate label');
  folders.add(f.id);
 }
 const batches=new Set<string>();
 for(const b of s.trash){
  if(!b||typeof b.id!=='string'||batches.has(b.id)||!Array.isArray(b.notes)||!b.notes.length||!Number.isFinite(b.deletedAt))
   throw new Error('Invalid or duplicate Deleted entry');
  validateNotes(b.notes,false);
  if(b.notes.some(n=>n.id==='root'))throw new Error('Notebook root cannot be in Deleted');
  batches.add(b.id);
 }
 if(s.mapPreferences!==undefined)validateMapPreferences(s.mapPreferences);
}
export async function loadSnapshot():Promise<LocalSnapshot|null>{
 await writeQueue;
 const db=await getDatabase();
 const initialized=await db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='initialized'");
 if(!initialized)return null;
 const [notes,folders,trash,focused]=await Promise.all([
  db.getAllAsync<Omit<Note,'labelIds'>&{labelIds:string|null}>('SELECT id,parent_id AS parentId,title,body,updated_at AS updatedAt,folder_id AS folderId,label_ids AS labelIds FROM notes'),
  db.getAllAsync<Folder>('SELECT id,name FROM folders'),
  db.getAllAsync<{payload:string}>('SELECT payload FROM trash'),
  db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='focused'")
 ]);
 const decodedNotes=notes.map(n=>({...n,labelIds:n.labelIds===null?undefined:JSON.parse(n.labelIds)}));
 const result={notes:normalizeLabels(decodedNotes),folders,trash:trash.map(x=>JSON.parse(x.payload) as TrashBatch),focused:focused?.value||'root'};
 assertSnapshot(result);return result;
}
/** Serialized, atomic, differential persistence. No delete-all/reinsert-all. */
export function saveSnapshot(snapshot:LocalSnapshot):Promise<void>{
 const job=writeQueue.catch(()=>{}).then(async()=>{
  assertSnapshot(snapshot);
  const db=await getDatabase();
  await db.withExclusiveTransactionAsync(async tx=>{
   const oldNotes=await tx.getAllAsync<Omit<Note,'labelIds'>&{labelIds:string|null}>('SELECT id,parent_id AS parentId,title,body,updated_at AS updatedAt,folder_id AS folderId,label_ids AS labelIds FROM notes');
   const oldFolders=await tx.getAllAsync<Folder>('SELECT id,name FROM folders');
   const oldTrash=await tx.getAllAsync<{id:string;payload:string}>('SELECT id,payload FROM trash');
   const nextNoteIds=new Set(snapshot.notes.map(x=>x.id));
   for(const n of oldNotes)if(!nextNoteIds.has(n.id))await tx.runAsync('DELETE FROM notes WHERE id=?',n.id);
   const previousNotes=new Map(oldNotes.map(x=>[x.id,x]));
   for(const n of snapshot.notes){const old=previousNotes.get(n.id);if(!old||old.parentId!==n.parentId||old.title!==n.title||old.body!==n.body||old.updatedAt!==n.updatedAt||old.folderId!==n.folderId||old.labelIds!==JSON.stringify(labelIds(n)))
    await tx.runAsync('INSERT INTO notes(id,parent_id,title,body,updated_at,folder_id,label_ids) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title,body=excluded.body,updated_at=excluded.updated_at,folder_id=excluded.folder_id,label_ids=excluded.label_ids',n.id,n.parentId,n.title,n.body,n.updatedAt,n.folderId,JSON.stringify(labelIds(n)));}
   const folderIds=new Set(snapshot.folders.map(x=>x.id));for(const f of oldFolders)if(!folderIds.has(f.id))await tx.runAsync('DELETE FROM folders WHERE id=?',f.id);
   const previousFolders=new Map(oldFolders.map(x=>[x.id,x]));for(const f of snapshot.folders)if(previousFolders.get(f.id)?.name!==f.name)await tx.runAsync('INSERT INTO folders(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',f.id,f.name);
   const trashIds=new Set(snapshot.trash.map(x=>x.id));for(const t of oldTrash)if(!trashIds.has(t.id))await tx.runAsync('DELETE FROM trash WHERE id=?',t.id);
   const previousTrash=new Map(oldTrash.map(x=>[x.id,x.payload]));for(const t of snapshot.trash){const payload=JSON.stringify(t);if(previousTrash.get(t.id)!==payload)await tx.runAsync('INSERT INTO trash(id,payload,deleted_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted_at=excluded.deleted_at',t.id,payload,t.deletedAt);}
   await tx.runAsync("INSERT INTO metadata(key,value) VALUES('focused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",snapshot.focused);
   if(snapshot.mapPreferences!==undefined)await writeMapPreferences(tx,snapshot.mapPreferences);
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
  archived:string[];
  trashRetentionAcknowledged:boolean;
  trashRetentionWarningSeen:boolean;
  themeMode?:'light'|'dark'|'system';
  librarySort?:'custom'|'created'|'modified'|'title';
  sortDirection?:'asc'|'desc';
  customOrder?:string[];
  customColumns?:Record<string,0|1>;
};
export const emptyMapPreferences=():MapPreferences=>({
  offsets:{},collapsed:{},colors:{},pinned:[],
  theme:'light',viewMode:'grid',cardColors:{},noteColors:{},archived:[],trashRetentionAcknowledged:false,trashRetentionWarningSeen:false,themeMode:'light',librarySort:'custom',sortDirection:'desc',customOrder:[],customColumns:{}
});
function isRecord(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}

const recordOf=(valid:(item:unknown)=>boolean)=>(value:unknown)=>isRecord(value)&&Object.values(value).every(valid);
const strings=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const choices=(...allowed:unknown[])=>(value:unknown)=>allowed.includes(value);
const validColor=recordOf(value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value));
const preferenceFields:{[K in keyof Required<MapPreferences>]: (value:unknown)=>boolean}={
 offsets:recordOf(Number.isFinite),
 collapsed:recordOf(value=>typeof value==='boolean'),
 colors:validColor,cardColors:validColor,noteColors:validColor,
 customColumns:recordOf(choices(0,1)),
 pinned:strings,archived:strings,customOrder:strings,
 theme:choices('light','dark'),
 themeMode:choices('light','dark','system'),
 viewMode:choices('grid','list'),
 librarySort:choices('custom','created','modified','title'),
 sortDirection:choices('asc','desc'),
 trashRetentionAcknowledged:choices(true,false),
 trashRetentionWarningSeen:choices(true,false),
};

function validateMapPreferences(value:unknown):void{
 if(!isRecord(value)||Object.entries(preferenceFields).some(([key,valid])=>value[key]!==undefined&&!valid(value[key])))
  throw new Error('Invalid map preferences');
}

export function normalizeMapPreferences(prefs:unknown):MapPreferences{
 const raw=isRecord(prefs)?prefs:{};
 const accepted=Object.fromEntries(Object.entries(preferenceFields)
  .filter(([key,valid])=>valid(raw[key])).map(([key])=>[key,raw[key]])) as Partial<MapPreferences>;
 return {...emptyMapPreferences(),...accepted,themeMode:accepted.themeMode??accepted.theme??'light'};
}

export async function loadMapPreferences():Promise<MapPreferences>{
 await writeQueue;
 const db=await getDatabase();
 const row=await db.getFirstAsync<{value:string}>("SELECT value FROM metadata WHERE key='map_preferences'");
 if(!row)return emptyMapPreferences();
 try{
  return normalizeMapPreferences(JSON.parse(row.value));
 }catch{return emptyMapPreferences();}
}

function writeMapPreferences(db:Pick<SQLite.SQLiteDatabase,'runAsync'>,prefs:MapPreferences){
 return db.runAsync("INSERT INTO metadata(key,value) VALUES('map_preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(prefs));
}

/** Browsing changes a single metadata row and leaves notebook tables untouched. */
export function saveFocusedNote(focused:string):Promise<void>{
 const job=writeQueue.catch(()=>{}).then(async()=>{
  const db=await getDatabase();
  await db.runAsync("UPDATE metadata SET value=CASE WHEN EXISTS(SELECT 1 FROM notes WHERE id=?) THEN ? ELSE 'root' END WHERE key='focused' AND value<>?",focused,focused,focused);
 });
 writeQueue=job;
 return job;
}
export function saveMapPreferences(prefs:MapPreferences):Promise<void>{
  const job=writeQueue.catch(()=>{}).then(async()=>{
    const db=await getDatabase();
    await writeMapPreferences(db,prefs);
  });
  writeQueue=job;
  return job;
}
