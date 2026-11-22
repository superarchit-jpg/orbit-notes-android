/** Semantic UI roles: Keep palette values remain unchanged. */
import {KEEP_DARK_SELECTED,KEEP_DARK_SURFACE,KEEP_DARK_BACKGROUND} from './keepTheme';
export const LIGHT={background:'#ECEEFF',surface:'#FAF9FF',control:'#F8F7FD',text:'#24334F',muted:'#626D89',border:'#A7B3D0',accent:'#52658E',canvas:'#F7F8FF',node:'#DDE6F9',subnode:'#F0F3FC',connector:'#909AB4'};
export const DARK={background:KEEP_DARK_BACKGROUND,surface:KEEP_DARK_SURFACE,control:'#212A47',text:'#F1F3FE',muted:'#A9B2CD',border:'#536080',accent:KEEP_DARK_SELECTED,canvas:'#11182A',node:'#293751',subnode:'#1B293E',connector:'#7B86A5'};
export function uiRoles(palette:typeof LIGHT){
 return {textPrimary:palette.text,textSecondary:palette.muted,surface:palette.surface,outline:palette.border,selectedBackground:palette.accent,selectedForeground:'#15233B',error:'#dc2626',disabledOpacity:0.35};
}
