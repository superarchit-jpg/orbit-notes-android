/** Labels are map memberships, not a hierarchy. Old folderId data remains readable. */
import type {Note} from './export';
export function labelIds(note:Pick<Note,'folderId'|'labelIds'>):string[]{
 const values=Array.isArray(note.labelIds)?note.labelIds:note.folderId?[note.folderId]:[];
 return [...new Set(values.filter((value):value is string=>typeof value==='string'&&value.length>0))];
}
export function withLabels<T extends Note>(note:T,ids:string[]):T{
 const unique=[...new Set(ids.filter(x=>typeof x==='string'&&x.length>0))];
 return {...note,labelIds:unique,folderId:unique[0]||null};
}
export function addLabel<T extends Note>(note:T,id:string):T{return withLabels(note,[...labelIds(note),id]);}
export function removeLabel<T extends Note>(note:T,id:string):T{return withLabels(note,labelIds(note).filter(x=>x!==id));}
export function hasLabel(note:Pick<Note,'folderId'|'labelIds'>,id:string):boolean{return labelIds(note).includes(id);}
export function normalizeLabels<T extends Note>(notes:T[]):T[]{return notes.map(note=>withLabels(note,labelIds(note)));}
