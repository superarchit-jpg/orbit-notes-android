/** Daybreak and Midnight are the semantic palettes for Orbit Notes. */
export const LIGHT={
 background:'#FCFDFE',surface:'#EEF1FA',control:'#F3F5FB',card:'#FFFFFF',editor:'#FFFFFF',
 text:'#1C2340',muted:'#515B75',border:'#C7CFE4',
 accent:'#4353BA',onAccent:'#FFFFFF',selection:'#DDE4FB',mapControl:'#E2E8FB',
 canvas:'#FFFFFF',node:'#E1E7FB',subnode:'#F3F5FB',connector:'#69799D',
 tertiary:'#EBBF78',onTertiary:'#3B2508',tertiarySoft:'#F8E2BB',tertiaryInk:'#794609',error:'#A52D36'
};
export const DARK={
 background:'#171A2E',surface:'#20243A',control:'#1D2136',card:'#000000',editor:'#15182B',
 text:'#F1F0FA',muted:'#B2B7D0',border:'#3B4261',
 accent:'#BBAAFF',onAccent:'#211741',selection:'#352F55',mapControl:'#2F2C4D',
 canvas:'#000000',node:'#302C4F',subnode:'#1D2136',connector:'#7C86A7',
 tertiary:'#7FDECA',onTertiary:'#132C28',tertiarySoft:'#214642',tertiaryInk:'#7FDECA',error:'#FF9AA5'
};
export type OrbitPalette=typeof LIGHT;

/** App Info keeps its approved colours and illustrated backdrop. */
export const APP_INFO_LIGHT={
 background:'#F8F6F0',surface:'#FFFCF7',control:'#F0E8DB',
 text:'#2E3036',muted:'#686B70',border:'#D8D0C5',
 accent:'#536F86',canvas:'#FBF7F0',node:'#DDE7F0',subnode:'#F3EBDF',connector:'#9AA9B4'
};
export const APP_INFO_DARK={
 background:'#191F29',surface:'#222B36',control:'#303D4B',
 text:'#F1ECE5',muted:'#B9B7B1',border:'#525C68',
 accent:'#9CB8C9',canvas:'#1C2630',node:'#3C5367',subnode:'#343B46',connector:'#8396A7'
};
/** Pre-Option-A palettes retained for existing PDF export styling. */
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
export function uiRoles(palette:OrbitPalette){
 return {textPrimary:palette.text,textSecondary:palette.muted,surface:palette.surface,outline:palette.border,selectedBackground:palette.accent,selectedForeground:palette.onAccent,error:palette.error,disabledOpacity:0.35};
}
