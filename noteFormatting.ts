/** Offline-only formatting helpers. Notes remain plain UTF-8 text for backward compatibility. */
export type FormatAction='bold'|'italic'|'underline'|'bullets'|'numbers';
export type RichRun={text:string;bold:boolean;italic:boolean;underline:boolean};

export function formatSelection(body:string,start:number,end:number,action:FormatAction):string{
  const a=Math.max(0,Math.min(body.length,Math.min(start,end)));
  const b=Math.max(a,Math.min(body.length,Math.max(start,end)));
  if(action==='bullets'||action==='numbers'){
    const lineStart=body.lastIndexOf('\n',a-1)+1;
    const lineEnd=body.indexOf('\n',b);
    const endLine=lineEnd===-1?body.length:lineEnd;
    const lines=body.slice(lineStart,endLine).split('\n');
    return body.slice(0,lineStart)+lines.map((line,i)=>{
      const existing=line.replace(/^(?:•\s+|\d+\.\s+)/,'');
      return action==='bullets'?'• '+existing:`${i+1}. ${existing}`;
    }).join('\n')+body.slice(endLine);
  }
  const marker=action==='bold'?'**':action==='underline'?'__':'*';
  const selected=body.slice(a,b);
  return body.slice(0,a)+marker+selected+marker+body.slice(b);
}
export function plainNoteText(text:string):string{
  return text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/__([^_]+)__/g,'$1');
}
export function parseRichLine(line:string):RichRun[]{
  const result:RichRun[]=[];
  const regex=/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__)/g;
  let last=0,match:RegExpExecArray|null;
  while((match=regex.exec(line))!==null){
    if(match.index>last)result.push({text:line.slice(last,match.index),bold:false,italic:false,underline:false});
    const bold=match[0].startsWith('**');
    const underline=match[0].startsWith('__');
    result.push({text:match[0].slice(bold||underline?2:1,bold||underline?-2:-1),bold,italic:!bold&&!underline,underline});
    last=regex.lastIndex;
  }
  if(last<line.length)result.push({text:line.slice(last),bold:false,italic:false,underline:false});
  return result.length?result:[{text:'',bold:false,italic:false,underline:false}];
}

