/** Offline, hierarchy-aware map search. No index or network service is required. */
import type {Note} from './export';
export function matchesMapQuery(root:Note,notes:Note[],query:string):boolean{
 const needle=query.trim().toLocaleLowerCase();
 if(!needle)return true;
 const children=new Map<string,Note[]>();
 for(const note of notes){
  if(note.parentId){
   const siblings=children.get(note.parentId)||[];
   siblings.push(note);
   children.set(note.parentId,siblings);
  }
 }
 const seen=new Set<string>();
 const pending=[root];
 while(pending.length){
  const note=pending.pop()!;
  if(seen.has(note.id))continue;
  seen.add(note.id);
  if(note.title.toLocaleLowerCase().includes(needle)||note.body.toLocaleLowerCase().includes(needle))return true;
  pending.push(...(children.get(note.id)||[]));
 }
 return false;
}
