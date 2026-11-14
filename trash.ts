import type {Note} from './export';
export type TrashBatch={id:string;deletedAt:number;notes:Note[]};
export const TRASH_RETENTION_MS=30*24*60*60*1000;
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
