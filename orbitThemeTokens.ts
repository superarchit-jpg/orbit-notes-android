/** Orbit Notes Option A: warm ivory paper, sand surfaces and slate-blue actions.
 * Central semantic tokens apply to all existing screens; no feature changes.
 */
export const LIGHT={
 background:'#F8F6F0',surface:'#FFFCF7',control:'#F0E8DB',
 text:'#2E3036',muted:'#686B70',border:'#D8D0C5',
 accent:'#536F86',canvas:'#FBF7F0',node:'#DDE7F0',subnode:'#F3EBDF',connector:'#9AA9B4'
};
export const DARK={
 background:'#191F29',surface:'#222B36',control:'#303D4B',
 text:'#F1ECE5',muted:'#B9B7B1',border:'#525C68',
 accent:'#9CB8C9',canvas:'#1C2630',node:'#3C5367',subnode:'#343B46',connector:'#8396A7'
};
export function uiRoles(palette:typeof LIGHT){
 return {textPrimary:palette.text,textSecondary:palette.muted,surface:palette.surface,outline:palette.border,selectedBackground:palette.accent,selectedForeground:palette===LIGHT?'#FFFFFF':'#1B2630',error:'#B54747',disabledOpacity:0.35};
}
