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
/** Stored numbered lines are represented by semantic ordered-list elements, never plain paragraphs. */
export function markupToHtml(body:string):string{
 const parts:string[]=[];let mode:'ul'|'ol'|null=null;
 const close=()=>{if(mode){parts.push('</'+mode+'>');mode=null;}};
 for(const line of body.split('\n')){
  const bullet=line.match(/^•\s(.*)$/);
  const number=line.match(/^(\d+)\.\s(.*)$/);
  const next=bullet?'ul':number?'ol':null;
  if(next!==mode){
   close();
   if(next){parts.push(next==='ol'?'<ol start="'+Number(number?.[1]||1)+'">':'<ul>');mode=next;}
  }
  if(next)parts.push('<li>'+inlineHtml(bullet?bullet[1]:number![2])+'</li>');
  else parts.push('<div>'+(line?inlineHtml(line):'<br>')+'</div>');
 }
 close();return parts.join('')||'<div><br></div>';
}
