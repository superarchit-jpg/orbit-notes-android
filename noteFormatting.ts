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
/** Render combinations of bold, italic and underline while preserving unmatched markers as plain text. */
export function parseRichLine(line:string):RichRun[]{
  const runs:RichRun[]=[];
  let bold=false,italic=false,underline=false;
  let buffer='';
  const emit=()=>{if(buffer){runs.push({text:buffer,bold,italic,underline});buffer='';}};
  for(let i=0;i<line.length;){
    const marker=line.startsWith('**',i)?'**':line.startsWith('__',i)?'__':line[i]==='*'?'*':null;
    if(!marker){buffer+=line[i++];continue;}
    const isOpen=marker==='**'?bold:marker==='__'?underline:italic;
    if(!isOpen&&line.indexOf(marker,i+marker.length)===-1){buffer+=marker;i+=marker.length;continue;}
    emit();
    if(marker==='**')bold=!bold;
    else if(marker==='__')underline=!underline;
    else italic=!italic;
    i+=marker.length;
  }
  emit();
  return runs.length?runs:[{text:'',bold:false,italic:false,underline:false}];
}
export function plainNoteText(text:string):string{
  return text.split('\n').map(line=>parseRichLine(line).map(run=>run.text).join('')).join('\n');
}
