import type {Note} from './export';
export type TrashBatch={id:string;deletedAt:number;notes:Note[]};
export const TRASH_RETENTION_MS=7*24*60*60*1000;
export function branchIds(notes:Note[],ids:string[]):Set<string>{
 const children=new Map<string,string[]>();for(const n of notes)if(n.parentId){const a=children.get(n.parentId)||[];a.push(n.id);children.set(n.parentId,a);}
 const all=new Set(ids.filter(x=>x!=='root'));const pending=[...all];while(pending.length){for(const id of children.get(pending.pop()!)||[])if(!all.has(id)){all.add(id);pending.push(id);}}return all;
}
export function deleteBranches(notes:Note[],ids:string[],timestamp=Date.now()):{remaining:Note[];batch:TrashBatch}{
 const all=branchIds(notes,ids);return {remaining:notes.filter(n=>!all.has(n.id)),batch:{id:`trash-${timestamp}-${Math.random().toString(36).slice(2,7)}`,deletedAt:timestamp,notes:notes.filter(n=>all.has(n.id))}};
}
/** Fail closed: never silently restore only part of a hierarchy. */
export function restoreBatch(notes:Note[],batch:TrashBatch):Note[]{
 const existing=new Set(notes.map(n=>n.id));const incoming=new Set<string>();
 for(const n of batch.notes){if(existing.has(n.id)||incoming.has(n.id))throw new Error('Cannot restore: conflicting note IDs');incoming.add(n.id);}
 for(const n of batch.notes)if(n.parentId!==null&&!incoming.has(n.parentId)&&!existing.has(n.parentId))throw new Error('Cannot restore: parent note is missing');
 return [...notes,...batch.notes];
}
export function pruneTrash(batches:TrashBatch[],now=Date.now()):TrashBatch[]{return batches.filter(b=>now-b.deletedAt<TRASH_RETENTION_MS);}

/** Split a historical multi-map Deleted batch into independent map records.
 * Keep the original ID for single-map batches. Preserve timestamp and any
 * orphaned legacy notes instead of silently dropping them.
 * Reapplying this normalization is idempotent.
 */
export function splitDeletedMaps(batches:TrashBatch[]):TrashBatch[]{
 const normalized:TrashBatch[]=[];
 for(const batch of batches){
  const roots=batch.notes.filter(note=>note.parentId==='root');
  if(roots.length<=1){normalized.push(batch);continue;}
  const allocated=new Set<string>();
  for(const root of roots){
   const ids=branchIds(batch.notes,[root.id]);
   const contents=batch.notes.filter(note=>ids.has(note.id));
   for(const note of contents)allocated.add(note.id);
   normalized.push({id:batch.id+'::'+root.id,deletedAt:batch.deletedAt,notes:contents});
  }
  const leftovers=batch.notes.filter(note=>!allocated.has(note.id));
  if(leftovers.length)normalized.push({...batch,notes:leftovers});
 }
 return normalized;
}

/** Restore only the deleted maps' membership, retaining intervening Archive changes. */
export function restoreArchiveOrder(current:string[],before:string[],restored:ReadonlySet<string>):string[]{
 const result=current.slice();
 const present=new Set(current);
 const original=new Set(before);
 let next=current.find(id=>!original.has(id));
 for(let i=before.length-1;i>=0;i--){
  const id=before[i];
  if(restored.has(id)&&!present.has(id)){
   result.splice(next===undefined?result.length:result.indexOf(next),0,id);
   present.add(id);
  }
  if(present.has(id))next=id;
 }
 return result;
}
