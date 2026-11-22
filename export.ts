import * as Print from 'expo-print';
import {radialTree} from './mapGeometry';
import {plainNoteText} from './noteFormatting';
export type Note = {id:string;parentId:string|null;title:string;body:string;updatedAt:number;folderId:string|null;labelIds?:string[]};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
