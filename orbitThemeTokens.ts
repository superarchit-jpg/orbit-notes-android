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
/** Exact pre-Option-A palettes (from f055cd9), retained for selected screens only. */
export const LEGACY_LIGHT={
 background:'#ECEEFF',surface:'#FAF9FF',control:'#F8F7FD',
 text:'#24334F',muted:'#626D89',border:'#A7B3D0',
 accent:'#52658E',canvas:'#F7F8FF',node:'#DDE6F9',subnode:'#F0F3FC',connector:'#909AB4'
};
export const LEGACY_DARK={
 background:'#11182A',surface:'#0A0E1A',control:'#212A47',
 text:'#F1F3FE',muted:'#A9B2CD',border:'#536080',
 accent:'#ADC3F9',canvas:'#11182A',node:'#293751',subnode:'#1B293E',connector:'#7B86A5'
};
export function uiRoles(palette:typeof LIGHT){
 return {textPrimary:palette.text,textSecondary:palette.muted,surface:palette.surface,outline:palette.border,selectedBackground:palette.accent,selectedForeground:palette===LIGHT?'#FFFFFF':'#1B2630',error:'#B54747',disabledOpacity:0.35};
}
