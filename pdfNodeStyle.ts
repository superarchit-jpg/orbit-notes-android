/** PDF node fills follow the stored map-node colours and Keep theme mapping. */
import {displayKeepColor,keepForeground} from './keepTheme';
import type {OrbitTheme} from './keepTheme';
import {LEGACY_LIGHT,LEGACY_DARK} from './orbitThemeTokens';
export function pdfNodeStyle(id:string,level:number,isRoot:boolean,storedColors:Record<string,string>,theme:OrbitTheme='light'){
 const palette=theme==='dark'?LEGACY_DARK:LEGACY_LIGHT;
 // The root accent is a map-level default. Explicit node colours always take priority.
 const defaultFill=isRoot?palette.accent:level<=1?palette.node:palette.subnode;
 const fill=displayKeepColor(storedColors[id],theme,defaultFill);
 return {fill,text:keepForeground(fill),stroke:palette.border};
}
