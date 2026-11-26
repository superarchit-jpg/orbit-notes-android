/** Offline-only formatting helpers. Notes remain plain UTF-8 text for backward compatibility. */
export type RichRun={text:string;bold:boolean;italic:boolean;underline:boolean};

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
