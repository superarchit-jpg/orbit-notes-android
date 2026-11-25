/** Keep-inspired paired theme colors. Stored preset tokens remain unchanged in backups. */
export type OrbitTheme='light'|'dark';
export const KEEP_LIGHT_PRESETS=['#ffffff','#FAAFA9','#F29F75','#FFF8B9','#E2F6D3','#B4DED4','#D5E3EE','#AFCCDC','#D3BFDB','#F5E2DC','#E9E3D3','#EFEFF1','#D18D86','#D27B5C','#C9AE54','#75AD7B','#5AACA2','#698FB0','#8A7DB1','#AC7198'] as const;
export const KEEP_DARK_PRESETS=['#0A0E1A','#740D32','#762C1E','#86550A','#2B5635','#137263','#2D4F63','#2A687A','#523160','#733C54','#575247','#292B2F','#5F2936','#603626','#59471F','#234D38','#204A4A','#28405C','#42365D','#5D304E'] as const;
export const KEEP_DARK_BACKGROUND='#11182A';
export const KEEP_DARK_SURFACE='#0A0E1A';
export const KEEP_DARK_SELECTED='#ADC3F9';
/** Option A card presets; legacy Keep colors remain accepted in stored notes. */
export const ORBIT_LIGHT_PRESETS=['#FFFCF7','#F6DAD7','#F2D5BE','#F8EAC6','#E7EBCF','#D4E8DF','#DFEAF1','#C9DDE8','#E6DDF0','#F1DED7','#EAE1D5','#EFECE7','#DFA9A2','#DBAD8B','#D6C08A','#B9CDA8','#9FC5BE','#91AFC4','#B5A9CD','#CBA5B8'] as const;
export const ORBIT_DARK_PRESETS=['#222B36','#563A45','#604739','#564A32','#414B3C','#31534B','#344654','#345568','#49415A','#554249','#4B4741','#363941','#634147','#644935','#675B3C','#3D5744','#325B55','#37516A','#4E4868','#60455B'] as const;
export function displayKeepColor(stored:string|undefined,theme:OrbitTheme,fallback:string):string{
 if(!stored)return fallback;
 const value=stored.toLowerCase();
 const legacy=KEEP_LIGHT_PRESETS.findIndex(x=>x.toLowerCase()===value);
 const revised=ORBIT_LIGHT_PRESETS.findIndex(x=>x.toLowerCase()===value);
 const darkLegacy=KEEP_DARK_PRESETS.findIndex(x=>x.toLowerCase()===value);
 const darkRevised=ORBIT_DARK_PRESETS.findIndex(x=>x.toLowerCase()===value);
 const index=revised>=0?revised:legacy>=0?legacy:darkRevised>=0?darkRevised:darkLegacy;
 return index<0?stored:theme==='dark'?KEEP_DARK_PRESETS[index]:KEEP_LIGHT_PRESETS[index];
}
export function swatchKeepColor(index:number,theme:OrbitTheme):string{
 return theme==='dark'?KEEP_DARK_PRESETS[index]:KEEP_LIGHT_PRESETS[index];
}
function relativeLuminance(hex:string):number{
 if(!/^#[0-9a-f]{6}$/i.test(hex))return 0;
 const components=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 return 0.2126*components[0]+0.7152*components[1]+0.0722*components[2];
}
export function keepForeground(background:string):string{
 return relativeLuminance(background)>0.28?'#202A42':'#F4F5FF';
}
export function keepChipStyle(cardBackground:string):{backgroundColor:string;color:string;borderColor:string}{
 const darkCard=relativeLuminance(cardBackground)<0.28;
 return darkCard?{backgroundColor:'rgba(255,255,255,0.19)',color:'#F3F4FF',borderColor:'rgba(255,255,255,0.12)'}:{backgroundColor:'rgba(255,255,255,0.54)',color:'#283551',borderColor:'rgba(48,61,85,0.08)'};
}
