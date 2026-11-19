/** Offline-only formatting helpers. Notes remain plain UTF-8 text for backward compatibility. */
export type FormatAction='bold'|'italic'|'checklist';
export type RichRun={text:string;bold:boolean;italic:boolean};

export function formatSelection(body:string,start:number,end:number,action:FormatAction):string{
  const a=Math.max(0,Math.min(body.length,Math.min(start,end)));
  const b=Math.max(a,Math.min(body.length,Math.max(start,end)));
  if(action==='checklist'){
    const lineStart=body.lastIndexOf('\n',a-1)+1;
    const lineEnd=body.indexOf('\n',b);
    const endLine=lineEnd===-1?body.length:lineEnd;
    const lines=body.slice(lineStart,endLine).split('\n');
    return body.slice(0,lineStart)+lines.map(line=>/^[☐☑] /.test(line)?line:'☐ '+line).join('\n')+body.slice(endLine);
  }
  const marker=action==='bold'?'**':'*';
  const selected=body.slice(a,b);
  return body.slice(0,a)+marker+selected+marker+body.slice(b);
}
export function plainNoteText(text:string):string{
  return text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1');
}
export function parseRichLine(line:string):RichRun[]{
  const result:RichRun[]=[];
  const regex=/(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last=0,match:RegExpExecArray|null;
  while((match=regex.exec(line))!==null){
    if(match.index>last)result.push({text:line.slice(last,match.index),bold:false,italic:false});
    const bold=match[0].startsWith('**');
    result.push({text:match[0].slice(bold?2:1,bold?-2:-1),bold,italic:!bold});
    last=regex.lastIndex;
  }
  if(last<line.length)result.push({text:line.slice(last),bold:false,italic:false});
  return result.length?result:[{text:'',bold:false,italic:false}];
}
export function toggleChecklistLine(body:string,index:number):string{
  const lines=body.split('\n');
  if(index<0||index>=lines.length)return body;
  lines[index]=lines[index].startsWith('☐ ')?'☑ '+lines[index].slice(2):lines[index].startsWith('☑ ')?'☐ '+lines[index].slice(2):lines[index];
  return lines.join('\n');
}
