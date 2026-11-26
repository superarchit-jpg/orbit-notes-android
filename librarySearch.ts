/** Offline, hierarchy-aware map search with one parent index per notebook revision. */
import type {Note} from './export';

export function matchesMapQuery(root:Note,children:ReadonlyMap<string,readonly Note[]>,needle:string):boolean{
 if(!needle)return true;
 const seen=new Set<string>();
 const pending=[root];
 while(pending.length){
  const note=pending.pop()!;
  if(seen.has(note.id))continue;
  seen.add(note.id);
  if(note.title.toLocaleLowerCase().includes(needle)||note.body.toLocaleLowerCase().includes(needle))return true;
  for(const child of children.get(note.id)??[])pending.push(child);
 }
 return false;
}
