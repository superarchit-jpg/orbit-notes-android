import JSZip from 'jszip';
import * as Print from 'expo-print';
import {radialTree} from './mapGeometry';
import {plainNoteText} from './noteFormatting';
import * as FileSystem from 'expo-file-system/legacy';
export type Note = {id:string;parentId:string|null;title:string;body:string;updatedAt:number;folderId:string|null;labelIds?:string[]};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function subtree(root:Note,notes:Note[]):{note:Note;depth:number}[]{
 const children=new Map<string,Note[]>();for(const n of notes)if(n.parentId){const a=children.get(n.parentId)||[];a.push(n);children.set(n.parentId,a);}
 const result:{note:Note;depth:number}[]=[];const visited=new Set<string>();const stack=[{note:root,depth:0}];
 while(stack.length){const entry=stack.pop()!;if(visited.has(entry.note.id))continue;visited.add(entry.note.id);result.push(entry);const kids=children.get(entry.note.id)||[];for(let i=kids.length-1;i>=0;i--)stack.push({note:kids[i],depth:entry.depth+1});}
 return result;
}
/** One-page, complete radial map. The PDF scales the entire hierarchy to A4 landscape. */
function pdfMapPage(root:Note,notes:Note[]):string{
 const nodes=radialTree(root,notes);
 const byId=new Map(nodes.map(n=>[n.note.id,n]));
 const radii=[60,55,45,40,37.5,35];
 // Use a single pass: spreading large node arrays into Math.min/max can exceed
 // JavaScript's argument limit and crash exports of deep or wide maps.
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const n of nodes){
   const radius=radii[Math.min(n.level,5)];
   minX=Math.min(minX,n.x-radius);
   maxX=Math.max(maxX,n.x+radius);
   minY=Math.min(minY,n.y-radius);
   maxY=Math.max(maxY,n.y+radius);
 }
 if(!nodes.length){minX=-60;maxX=60;minY=-60;maxY=60;}
 minX-=24;maxX+=24;minY-=24;maxY+=24;
 const width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY);
 const textLines=(title:string,maxChars:number)=> {
   const words=title.trim().split(/\\s+/).filter(Boolean);
   const lines:string[]=[];let line='';
   for(const word of words){
     if((line+' '+word).trim().length>maxChars&&line){lines.push(line);line='';}
     if(word.length>maxChars){if(line){lines.push(line);line='';}for(let i=0;i<word.length;i+=maxChars)lines.push(word.slice(i,i+maxChars));}
     else line=(line+' '+word).trim();
   }
   if(line)lines.push(line);
   return lines;
 };
 const edges=nodes.filter(n=>n.note.parentId&&byId.has(n.note.parentId)).map(n=>{
   const p=byId.get(n.note.parentId!)!;
   return `<line x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}" stroke="#94a3b8" stroke-width="3"/>`;
 }).join('');
 const circles=nodes.map(n=>{
   const radius=radii[Math.min(n.level,5)],isRoot=n.note.id===root.id;
   const title=textLines(n.note.title,Math.max(9,Math.floor(radius/3.5)));
   const lines=title.slice(0,4);
   const body=plainNoteText(n.note.body).trim().replace(/\\s+/g,' ');
   const label=lines.map((line,i)=>`<tspan x="${n.x}" dy="${i===0?0:13}">${esc(line)}</tspan>`).join('');
   const y=n.y-(lines.length-1)*6.5-(body?7:0);
   return `<circle cx="${n.x}" cy="${n.y}" r="${radius}" fill="${isRoot?'#315fd6':'#dbeafe'}" stroke="#93c5fd" stroke-width="2"/><text x="${n.x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="${isRoot?'white':'#1e40af'}">${label}</text>${body?`<text x="${n.x}" y="${n.y+radius-13}" text-anchor="middle" font-family="sans-serif" font-size="8" fill="${isRoot?'white':'#334155'}">${esc(body.slice(0,Math.floor(radius/4))) }${body.length>Math.floor(radius/4)?'…':''}</text>`:''}`;
 }).join('');
 const diagram=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f8fafc"/>${edges}${circles}</svg>`;
 return `<div class="page">${diagram}</div>`;
}
function pdfDocument(pages:string[]):string{
 return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"/><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0;font-family:Arial,sans-serif}.page{width:281mm;height:194mm;overflow:hidden;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}</style></head><body>${pages.join('')}</body></html>`;
}
export async function exportPDF(root:Note,notes:Note[]):Promise<string>{
 const out=await Print.printToFileAsync({html:pdfDocument([pdfMapPage(root,notes)])});
 return out.uri;
}
/** Combine selected maps in one PDF, with one complete map per landscape page. */
export async function exportMultipleMapsPDF(roots:Note[],notes:Note[]):Promise<string>{
 if(!roots.length)throw new Error('No maps selected');
 const pages=roots.map(root=>pdfMapPage(root,notes));
 const out=await Print.printToFileAsync({html:pdfDocument(pages)});
 return out.uri;
}
// Diagram elements are native PowerPoint shapes, so users can edit them after export.
function diagramShapes(root:Note, children:Note[]):string{
 const cx=6096000,cy=3900000,ring=1900000;
 const positions=children.map((_,i)=>({x:cx+Math.cos(-Math.PI/2+2*Math.PI*i/Math.max(1,children.length))*ring,y:cy+Math.sin(-Math.PI/2+2*Math.PI*i/Math.max(1,children.length))*ring}));
 const connectors=positions.map((p,i)=>`<p:sp><p:nvSpPr><p:cNvPr id="${30+i}" name="Connection ${i+1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(Math.min(cx,p.x))}" y="${Math.round(Math.min(cy,p.y))}"/><a:ext cx="${Math.round(Math.max(1,Math.abs(cx-p.x)))}" cy="${Math.round(Math.max(1,Math.abs(cy-p.y)))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="24000"><a:solidFill><a:srgbClr val="93C5FD"/></a:solidFill></a:ln></p:spPr></p:sp>`).join('');
 const circle=(id:number,label:string,x:number,y:number,diam:number,fill:string)=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(label)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x-diam/2)}" y="${Math.round(y-diam/2)}"/><a:ext cx="${diam}" cy="${diam}"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1300"><a:solidFill><a:srgbClr val="${fill==='315FD6'?'FFFFFF':'1E40AF'}"/></a:solidFill></a:rPr><a:t>${xml(label.slice(0,28))}</a:t></a:r></a:p></p:txBody></p:sp>`;
 return connectors+circle(20,root.title,cx,cy,1450000,'315FD6')+children.map((n,i)=>circle(40+i,n.title,positions[i].x,positions[i].y,1160000,'DBEAFE')).join('');
}
const xml=(s:string)=>esc(s).replace(/\r?\n/g,' ');
const slide=(title:string,body:string,index:number,diagram="")=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shape(2,'Title',title,500000,500000,11200000,1100000,2800,true)}${diagram?'':shape(3,'Content',body||' ',600000,1900000,11000000,4300000,1900,false)}${shape(4,'Slide',String(index),11200000,6300000,800000,350000,1000,false)}${diagram}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
function shape(id:number,name:string,value:string,x:number,y:number,w:number,h:number,size:number,bold:boolean){return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="${size}" b="${bold?1:0}"/><a:t>${xml(value)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;}
export async function exportPPTX(root:Note,notes:Note[]){const entries=subtree(root,notes);const slides:{title:string;body:string;diagram:string}[]=[];for(const {note,depth} of entries){const kids=notes.filter(n=>n.parentId===note.id);slides.push({title:`${'  '.repeat(Math.min(depth,5))}${note.title}`,body:note.body,diagram:''});for(let offset=0;offset<kids.length;offset+=8)slides.push({title:`${note.title} · Connections ${offset+1}–${Math.min(offset+8,kids.length)}`,body:'',diagram:diagramShapes(note,kids.slice(offset,offset+8))});}const zip=new JSZip();zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
zip.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
zip.file('ppt/presentation.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
zip.file('ppt/_rels/presentation.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`);
zip.file('ppt/slideMasters/slideMaster1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="lt1"/></p:sldMaster>`);
zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
zip.file('ppt/slideLayouts/slideLayout1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
zip.file('ppt/theme/theme1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Orbit"><a:themeElements><a:clrScheme name="Orbit"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${['1D4ED8','93C5FD','0F172A','64748B','2563EB','DBEAFE'].map((c,i)=>`<a:accent${i+1}><a:srgbClr val="${c}"/></a:accent${i+1}>`).join('')}<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Orbit"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Orbit"><a:fillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>').join('')}</a:fillStyleLst><a:lnStyleLst>${[1,2,3].map(()=>'<a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>').join('')}</a:lnStyleLst><a:effectStyleLst>${[1,2,3].map(()=>'<a:effectStyle><a:effectLst/></a:effectStyle>').join('')}</a:effectStyleLst><a:bgFillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="lt1"/></a:solidFill>').join('')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
slides.forEach(({title,body,diagram},i)=>{zip.file(`ppt/slides/slide${i+1}.xml`,slide(title,body,i+1,diagram));zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`,`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);});
const base64=await zip.generateAsync({type:'base64'});const uri=FileSystem.documentDirectory+`orbit-${Date.now()}.pptx`;await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});return uri;
}
