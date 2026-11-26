/** Native-independent rich text markup conversion, for offline persistence and regression tests. */
import {parseRichLine} from './noteFormatting';
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inlineHtml=(line:string)=>parseRichLine(line).map(run=>{
 let html=escapeHtml(run.text);
 if(run.underline)html='<u>'+html+'</u>';
 if(run.italic)html='<em>'+html+'</em>';
 if(run.bold)html='<strong>'+html+'</strong>';
 return html;
}).join('');
/** Rebuild indentation and explicit list numbers from the stored text. */
export function markupToHtml(body:string):string{
 const parts:string[]=[];
 const lists:{tag:'ol'|'ul';indent:number;next:number;itemOpen:boolean}[]=[];
 const closeList=()=>{
  const current=lists.pop();
  if(current)parts.push((current.itemOpen?'</li>':'')+'</'+current.tag+'>');
 };
 for(const line of body.split('\n')){
  const item=line.match(/^( *)(•|[0-9]+\.)\s(.*)$/);
  if(!item){
   while(lists.length)closeList();
   parts.push('<div>'+(line?inlineHtml(line):'<br>')+'</div>');
   continue;
  }
  const indent=item[1].length;
  const tag=item[2]==='•'?'ul':'ol';
  const value=tag==='ol'?Number(item[2].slice(0,-1)):1;
  while(lists.length&&lists[lists.length-1].indent>indent)closeList();
  let current=lists[lists.length-1];
  if(current&&current.indent===indent&&current.tag!==tag){
   closeList();
   current=lists[lists.length-1];
  }
  if(!current||current.indent<indent){
   current={tag,indent,next:value,itemOpen:false};
   lists.push(current);
   parts.push(tag==='ol'?'<ol start="'+value+'">':'<ul>');
  }
  if(current.itemOpen)parts.push('</li>');
  parts.push(tag==='ol'&&value!==current.next?'<li value="'+value+'">':'<li>',inlineHtml(item[3]));
  current.itemOpen=true;
  current.next=value+1;
 }
 while(lists.length)closeList();
 return parts.join('');
}
