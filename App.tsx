import React,{useEffect,useMemo,useState,useRef} from 'react';
import {ICON_PATHS} from './orbitIcons';
import {ANDROID_FINGERPRINT_PATH} from './androidFingerprint';
import {LIGHT,DARK,APP_INFO_LIGHT,APP_INFO_DARK,uiRoles} from './orbitThemeTokens';
import {balancedLibraryPositions} from './libraryColumns';
import {AppState,BackHandler,Dimensions,KeyboardAvoidingView,useColorScheme,useWindowDimensions,Platform,Pressable,ScrollView,FlatList,Keyboard,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Svg,{Line,Circle,Rect,Path,Text as SvgText} from 'react-native-svg';
import {SafeAreaProvider,SafeAreaView as InsetSafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated,{FadeInLeft,FadeOutLeft,LinearTransition,runOnJS,useAnimatedReaction,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';
import {loadSnapshot,saveSnapshot,loadMapPreferences,saveMapPreferences,saveFocusedNote,emptyMapPreferences,normalizeMapPreferences} from './storage';
import {radialTree,fitMap,indexChildren,nodeRadius,pointBounds} from './mapGeometry';
import {hasPin,isPinLockEnabled,setPinLockEnabled,setPin,verifyCredential,credentialKind,removePin,biometricEnabled,setBiometricEnabled,authenticateBiometric} from './appLock';
import {exportPDF,exportMultipleMapsPDF,Note} from './export';
import {safeExportName,saveExportToAndroid,saveMultiplePDFsToAndroid,ExportFormat} from './localSave';
import * as FileSystem from 'expo-file-system/legacy';
import {saveEncryptedBackup,selectBackupFile,decryptSelectedBackup,discardBackupFile} from './backup';
import {TrashBatch,deleteBranches,restoreBatch,restoreArchiveOrder,pruneTrash,splitDeletedMaps} from './trash';
import {parseRichLine} from './noteFormatting';
import RichNoteEditor,{RichNoteEditorHandle,RichEditorState} from './RichNoteEditor';
import OrbitSettings from './OrbitSettings';
import OrbitModal from './OrbitModal';
import type {ModalProps} from 'react-native';
import appInfo from './app.json';
import {consumedDeviceScreenOff} from './orbitDeviceLock';
import {labelIds,addLabel,removeLabel,hasLabel,normalizeLabels} from './labels';
import {matchesMapQuery} from './librarySearch';
import {KEEP_LIGHT_PRESETS,displayKeepColor,swatchKeepColor,keepForeground,keepChipStyle} from './keepTheme';

const SafeAreaView=InsetSafeAreaView;
const W=Dimensions.get('window').width,H=Dimensions.get('window').height;
const now=Date.now();
const initial:Note[]=[{id:'root',parentId:null,title:'My Notes',body:'',updatedAt:now,folderId:null}];
type Folder={id:string;name:string};
type MapViewport={x:number;y:number;zoom:number;angle:number};
type DeletedPreview={
  batch:TrashBatch;
  focused:string;
  offsets:Record<string,number>;
  collapsed:Record<string,boolean>;
  showMiniMap:boolean;
  showEntireMap:boolean;
  viewportBeforeExpand:MapViewport|null;
};
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const PaletteContext=React.createContext(LIGHT);
const Modal=(props:ModalProps)=>{
  const palette=React.useContext(PaletteContext);
  return <OrbitModal {...props} darkIcons={palette===LIGHT}/>;
};
const CARD_PALETTE=[...KEEP_LIGHT_PRESETS];
// Exactly four columns on phone widths: 12 original swatches + two additional rows of four.
const paletteSwatchSize=Math.min(60,(Math.min(W-48,380)-44-42)/4);

const Button=({label,onPress,primary=false,tertiary=false,danger=false,active=false,disabled=false}:{label:string;onPress:()=>void;primary?:boolean;tertiary?:boolean;danger?:boolean;active?:boolean;disabled?:boolean})=>{
  const palette=React.useContext(PaletteContext);
  const backgroundColor=tertiary?palette.tertiary:primary?palette.accent:active?palette.control:'transparent';
  const color=tertiary?palette.onTertiary:primary?palette.onAccent:danger?palette.error:active?palette.accent:palette.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,{backgroundColor,opacity:disabled?0.5:1}]}><Text style={[styles.buttonText,{color}]}>{label==='🗑'?<Svg width={23} height={23} viewBox="0 0 24 24"><Line x1={4} y1={7} x2={20} y2={7} stroke="#dc2626" strokeWidth={1.8}/><Line x1={9} y1={4} x2={15} y2={4} stroke="#dc2626" strokeWidth={1.8}/><Rect x={6} y={7} width={12} height={14} rx={2} stroke="#dc2626" strokeWidth={1.8} fill="none"/><Line x1={10} y1={11} x2={10} y2={17} stroke="#dc2626" strokeWidth={1.5}/><Line x1={14} y1={11} x2={14} y2={17} stroke="#dc2626" strokeWidth={1.5}/></Svg>:label}</Text></Pressable>;
};

const MaterialIcon=({name,color,fillLabel=false}:{name:string;color:string;fillLabel?:boolean})=>{
  const palette=React.useContext(PaletteContext);
  if(name==='restoreIcon')return <Svg width={25} height={25} viewBox="0 0 24 24"><Path d={ICON_PATHS.restoreIcon} fill={color}/></Svg>;
  if(name==='format')return <Svg width={25} height={25} viewBox="0 0 24 24"><SvgText x={5} y={17} fontSize={17} fontWeight="bold" fill={color}>A</SvgText><Line x1={4} y1={20} x2={20} y2={20} stroke={color} strokeWidth={2}/></Svg>;
  if(name==='clearFormat')return <Svg width={25} height={25} viewBox="0 0 24 24"><SvgText x={4} y={18} fontSize={18} fontWeight="bold" fill={color}>T</SvgText><Line x1={4} y1={20} x2={21} y2={3} stroke={color} strokeWidth={2.5} strokeLinecap="round"/></Svg>;
  if(['bold','italic','underline'].includes(name))return <Text style={{fontSize:21,color,fontWeight:name==='bold'?'900':'600',fontStyle:name==='italic'?'italic':'normal',textDecorationLine:name==='underline'?'underline':'none'}}>{name==='bold'?'B':name==='italic'?'I':'U'}</Text>;
  const data=ICON_PATHS[name];
  if(name==='label'&&fillLabel)return <Svg width={23} height={23} viewBox="0 0 24 24">
    <Path d={data} fill={color} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M7 12h.01" stroke={palette.background} strokeWidth={1.7} strokeLinecap="round"/>
  </Svg>;
  const compact=['Fit','parentNote','centerFocus','miniMapIcon'].includes(name);
  const iconSize=compact?21:23;
  if(name==='miniMapIcon')return <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
    <Path d={data} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>
    <Rect x={9} y={2} width={6} height={6} rx={1} stroke={color} fill="none" strokeWidth={1.7}/>
    <Rect x={3} y={16} width={6} height={6} rx={1} stroke={color} fill="none" strokeWidth={1.7}/>
    <Rect x={15} y={16} width={6} height={6} rx={1} stroke={color} fill="none" strokeWidth={1.7}/>
  </Svg>;
  return data?<Svg width={iconSize} height={iconSize} viewBox="0 0 24 24"><Path d={data} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>:<Text style={{fontSize:22,color,fontWeight:'700'}}>{name}</Text>;
};

const LibraryGestureCard=({children,position,onMeasure,canSwipe,onArchive,canDrag,onSelect,onDragStart,onDragMove,onDrop,onDragCancel,registerRef}:{children:React.ReactNode;position:{top:number;left:number;width:number};onMeasure:(height:number)=>void;canSwipe:boolean;onArchive:()=>void;canDrag:boolean;onSelect:()=>void;onDragStart:()=>void;onDragMove:(x:number,y:number)=>void;onDrop:(dx:number,dy:number)=>void;onDragCancel:()=>void;registerRef:(view:View|null)=>void})=>{
 const dx=useSharedValue(0),dy=useSharedValue(0),dragging=useSharedValue(false);
 const cardWidth=useSharedValue(W);
 const lastDragX=useSharedValue(0),lastDragY=useSharedValue(0);
 const swipeCommitted=useSharedValue(false);
 const swipe=Gesture.Pan().enabled(canSwipe).activeOffsetX([-18,18]).failOffsetY([-15,15])
   .onUpdate(e=>{dx.value=e.translationX;})
   .onEnd(e=>{
     if(Math.abs(e.translationX)>cardWidth.value*0.65){swipeCommitted.value=true;dx.value=withTiming(e.translationX>0?W+cardWidth.value:-W-cardWidth.value,{duration:180},finished=>{if(finished)runOnJS(onArchive)();});}
     else dx.value=withTiming(0,{duration:190});
   }).onFinalize(()=>{if(!swipeCommitted.value)dx.value=withTiming(0);});
 const dragActivated=useSharedValue(false);
 const drag=Gesture.Pan().enabled(canDrag).activateAfterLongPress(330)
   .onStart(()=>{dragActivated.value=false;lastDragX.value=0;lastDragY.value=0;})
   .onUpdate(e=>{
     // A stationary long press selects. The gesture becomes a drag only
     // after the card moves at least 7% of its own width.
     if(!dragActivated.value){
       if(Math.hypot(e.translationX,e.translationY)<cardWidth.value*0.07)return;
       dragActivated.value=true;dragging.value=true;runOnJS(onDragStart)();
     }
     dx.value=e.translationX;dy.value=e.translationY;
     if(Math.hypot(e.translationX-lastDragX.value,e.translationY-lastDragY.value)>8){
       lastDragX.value=e.translationX;lastDragY.value=e.translationY;
       runOnJS(onDragMove)(e.translationX,e.translationY);
     }
   })
   .onEnd((e,success)=>{if(success&&dragActivated.value)runOnJS(onDrop)(e.translationX,e.translationY);})
   .onFinalize((_e,success)=>{
     if(!success&&dragActivated.value)runOnJS(onDragCancel)();
     dragActivated.value=false;dragging.value=false;
     dx.value=withTiming(0,{duration:180});dy.value=withTiming(0,{duration:180});
   });
 // A stationary hold selects. Dragging beyond 7% takes precedence and never
 // opens the selection toolbar. Both recognizers share the same touch.
 const hold=Gesture.LongPress().enabled(canDrag).minDuration(480).maxDistance(8)
   .onStart(()=>{if(!dragActivated.value)runOnJS(onSelect)();});
 const gesture=Gesture.Race(Gesture.Simultaneous(drag,hold),swipe);
 const animated=useAnimatedStyle(()=>({
   transform:[{translateX:dx.value},{translateY:dy.value},{scale:dragging.value?1.035:1}],
   opacity:dragging.value?0.9:Math.max(0.16,1-Math.abs(dx.value)/(W*1.1))
 }));
 const stackStyle=useAnimatedStyle(()=>({zIndex:dragging.value?100:0,elevation:dragging.value?12:0}));
 return <Animated.View layout={LinearTransition.duration(480)} ref={registerRef} collapsable={false} style={[{position:'absolute',top:position.top,left:position.left,width:position.width},stackStyle]} onLayout={e=>{cardWidth.value=e.nativeEvent.layout.width;onMeasure(e.nativeEvent.layout.height);}}><GestureDetector gesture={gesture}><Animated.View style={animated}>{children}</Animated.View></GestureDetector></Animated.View>;
};
const SwipeUndoNotice=({message,onUndo,onDismiss,bottom=90}:{message:string;onUndo:()=>void;onDismiss:()=>void;bottom?:number})=>{
 const shift=useSharedValue(0);
 const pan=Gesture.Pan().activeOffsetX([-12,12]).failOffsetY([-18,18]).onUpdate(e=>{shift.value=e.translationX;})
   .onEnd(e=>{if(Math.abs(e.translationX)>90)shift.value=withTiming(e.translationX>0?W+50:-W-50,{duration:190},finished=>{if(finished)runOnJS(onDismiss)();});else shift.value=withTiming(0,{duration:180});})
   .onFinalize(()=>{if(Math.abs(shift.value)<90)shift.value=withTiming(0);});
 const style=useAnimatedStyle(()=>({transform:[{translateX:shift.value}],opacity:Math.max(0.12,1-Math.abs(shift.value)/W)}));
 return <GestureDetector gesture={pan}><Animated.View style={[{position:'absolute',bottom,left:16,right:16,zIndex:60,backgroundColor:'#202124',borderRadius:8,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',elevation:8},style]}>
   <Text style={{color:'#ffffff'}}>{message}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} style={{padding:8}}><Text style={{color:'#fbbc04',fontWeight:'700'}}>Undo</Text></Pressable>
 </Animated.View></GestureDetector>;
};

const Upright=({angle,children}:{angle:SharedValue<number>;children:React.ReactNode})=>{
  const style=useAnimatedStyle(()=>({transform:[{rotateZ:`${-angle.value}rad`}]}));
  return <Animated.View style={[{alignItems:'center',justifyContent:'center'},style]}>{children}</Animated.View>;
};

const IconButton=({label,onPress,danger=false,active=false,disabled=false,accessibilityLabel,capsule,targetWidth=48,color}:{label:string;onPress:()=>void;danger?:boolean;active?:boolean;disabled?:boolean;accessibilityLabel?:string;capsule?:'square'|'circle'|'pill'|'tertiaryCircle';targetWidth?:number;color?:string})=>{
  const palette=React.useContext(PaletteContext);
  const activeFormat=active&&['bold','italic','underline'].includes(label);
  const foreground=color??(capsule==='tertiaryCircle'?palette.onTertiary:danger?palette.error:activeFormat?palette.onAccent:palette.text);
  const icon=<MaterialIcon name={label} color={foreground}/>;
  const circleSize=Math.min(40,targetWidth-8);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel||label} accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress}
    style={{opacity:disabled?0.35:1,paddingHorizontal:capsule?0:Math.min(12,Math.max(0,(targetWidth-24)/2)),paddingVertical:capsule?0:10,minWidth:targetWidth,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:capsule?'transparent':activeFormat?palette.accent:active?palette.control:'transparent'}}>
    {capsule?<View pointerEvents="none" style={{
      width:capsule==='pill'?Math.min(30,circleSize):capsule==='square'||capsule==='tertiaryCircle'?42:circleSize,
      height:capsule==='pill'?46:capsule==='square'||capsule==='tertiaryCircle'?42:circleSize,
      borderRadius:capsule==='square'?10:24,
      backgroundColor:capsule==='tertiaryCircle'?palette.tertiary:active?palette.selection:palette.mapControl,
      alignItems:'center',justifyContent:'center',
    }}>{icon}</View>:icon}
  </Pressable>;
};

const ActionRow=({label,icon,onPress,danger=false}:{label:string;icon?:string;onPress:()=>void;danger?:boolean})=>{
  const theme=React.useContext(PaletteContext);
  const foreground=danger?theme.error:theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:11,borderRadius:12}}>
    {icon&&<MaterialIcon name={icon} color={foreground}/>}
    <Text style={{fontSize:16,color:foreground,flex:1}}>{label}</Text>
  </Pressable>;
};

const useMapCamera=()=>{
  const tx=useSharedValue(0),ty=useSharedValue(0),scale=useSharedValue(1),rotation=useSharedValue(0);
  const startX=useSharedValue(0),startY=useSharedValue(0),startScale=useSharedValue(1),startRotation=useSharedValue(0);
  return {tx,ty,scale,rotation,startX,startY,startScale,startRotation};
};

const emptyEditorFormats:RichEditorState={bold:false,italic:false,underline:false,bullets:false,numbers:false,canUndo:false,canRedo:false};

export default function App(){
const [notes,setNotes]=useState<Note[]>(initial),[folders,setFolders]=useState<Folder[]>([]),[focused,setFocused]=useState('root'),[menu,setMenu]=useState(true),[reader,setReader]=useState<string|null>(null),[editing,setEditing]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[folderName,setFolderName]=useState(''),[creatingFolder,setCreatingFolder]=useState(false),[selected,setSelected]=useState<string[]>([]),[folderFilter,setFolderFilter]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState<string|null>(null),[trash,setTrash]=useState<TrashBatch[]>([]),[showTrash,setShowTrash]=useState(false);

const [mapPrefs,setMapPrefs]=useState(emptyMapPreferences);
const [archiveUndoIds,setArchiveUndoIds]=useState<string[]>([]);
const [deletionUndo,setDeletionUndo]=useState<
 {kind:'branch';batch:TrashBatch;expiresAt:number}|
 {kind:'maps';ids:string[];archiveOrder:string[];expiresAt:number}|null>(null);
const [trashMenu,setTrashMenu]=useState(false);
const [labelManager,setLabelManager]=useState(false);
const [labelQuery,setLabelQuery]=useState('');
const bioPromptInProgress=useRef(false),bioPrompted=useRef(false);
const richEditorRef=useRef<RichNoteEditorHandle|null>(null);
const [editorFormats,setEditorFormats]=useState<RichEditorState>(emptyEditorFormats);
const [editorReady,setEditorReady]=useState(false);
const resetEditor=()=>{
  setEditorReady(false);
  setEditorFormats(emptyEditorFormats);
  setFormatToolbar(false);
};
const [colorTarget,setColorTarget]=useState<'cards'|'note'|'node'|null>(null);
const deviceTheme=useColorScheme();
const {width:windowWidth,fontScale}=useWindowDimensions();
const zoomLabelWidth=Math.max(44,Math.ceil(36*fontScale));
const mapControlWidth=Math.min(48,Math.floor((windowWidth-12-zoomLabelWidth)/6));
const effectiveTheme=mapPrefs.themeMode==='system'?(deviceTheme==='dark'?'dark':'light'):mapPrefs.theme;
const palette=effectiveTheme==='dark'?DARK:LIGHT;
const statusBarStyle=effectiveTheme==='dark'?'light-content':'dark-content';
const appInfoPalette=effectiveTheme==='dark'?APP_INFO_DARK:APP_INFO_LIGHT;
 const roles=uiRoles(palette);
const selectedSidebarColor=palette.tertiarySoft;
const selectedSidebarText=palette.tertiaryInk;
const storedNoteColor=mapPrefs.noteColors[reader||''];
const noteDisplayColor=displayKeepColor(storedNoteColor,effectiveTheme,palette.editor);
const noteDisplayText=storedNoteColor?keepForeground(noteDisplayColor):palette.text;
const cardAppearance=(mapId:string|undefined)=>{
  const storedColor=mapId?mapPrefs.cardColors[mapId]:undefined;
  const backgroundColor=displayKeepColor(storedColor,effectiveTheme,palette.card);
  return {
    backgroundColor,
    color:storedColor?keepForeground(backgroundColor):palette.text,
    chip:storedColor?keepChipStyle(backgroundColor):{backgroundColor:palette.control,color:palette.text,borderColor:palette.border},
  };
};
const [editableMiniMap,setEditableMiniMap]=useState(false);
const [editableEntireMap,setEditableEntireMap]=useState(false);
const editableViewportBeforeExpand=useRef<MapViewport|null>(null);
const [deletedPreview,setDeletedPreview]=useState<DeletedPreview|null>(null);
const deletedScrollY=useRef(0);
const deletedListOffset=useRef({x:0,y:0});
useEffect(()=>{
  if(!showTrash){
    deletedScrollY.current=0;
    deletedListOffset.current={x:0,y:0};
  }
},[showTrash]);
const readOnly=deletedPreview!==null;
// Deleted previews share the live map controls with an independent camera and view state.
const mapNotes=deletedPreview?.batch.notes??notes;
const mapFocus=deletedPreview?.focused??focused;
const notebookChildren=useMemo(()=>indexChildren(notes),[notes]);
const mapChildren=useMemo(()=>mapNotes===notes?notebookChildren:indexChildren(mapNotes),[mapNotes,notes,notebookChildren]);
const mapNotesById=useMemo(()=>new Map(mapNotes.map(note=>[note.id,note])),[mapNotes]);
const mapOffsets=deletedPreview?.offsets??mapPrefs.offsets;
const mapCollapsed=deletedPreview?.collapsed??mapPrefs.collapsed;
const showMiniMap=deletedPreview?.showMiniMap??editableMiniMap;
const showEntireMap=deletedPreview?.showEntireMap??editableEntireMap;
const updateDeletedPreview=(update:(view:DeletedPreview)=>DeletedPreview)=>{
  setDeletedPreview(view=>view&&view.batch===deletedPreview?.batch?update(view):view);
};
const [gestureHelp,setGestureHelp]=useState(false);
const [nodeActions,setNodeActions]=useState<string|null>(null);
const [draftChildId,setDraftChildId]=useState<string|null>(null);
const [readerTapAt,setReaderTapAt]=useState(0);
const [librarySearch,setLibrarySearch]=useState('');
const [librarySearching,setLibrarySearching]=useState(false);
const librarySearchInput=useRef<TextInput>(null);
const clearLibrarySearch=()=>setLibrarySearch('');
const closeLibrarySearch=()=>{
  clearLibrarySearch();
  setLibrarySearching(false);
  Keyboard.dismiss();
};
const [cardMenuId,setCardMenuId]=useState<string|null>(null);
const [cardMenuPosition,setCardMenuPosition]=useState({top:70,left:12});
const [formatToolbar,setFormatToolbar]=useState(false);
const [zoomPercent,setZoomPercent]=useState(100);
const librarySort=mapPrefs.librarySort||'custom';
const sortDirection=mapPrefs.sortDirection||'desc';
const setLibrarySort=(next:'custom'|'created'|'modified'|'title')=>setMapPrefs(p=>({...p,librarySort:next,sortDirection:'desc'}));
const toggleLibraryDirection=()=>setMapPrefs(p=>({...p,sortDirection:p.sortDirection==='asc'?'desc':'asc'}));
type DialogAction={text:string;style?:string;onPress?:()=>void};
const [appDialog,setAppDialog]=useState<{title:string;message?:string;buttons?:DialogAction[]}|null>(null);
const showDialog=(title:string,message?:string,buttons?:DialogAction[])=>setAppDialog({title,message,buttons});
const renderAppDialog=()=>(
 <Modal visible={!!appDialog} transparent animationType="fade" onRequestClose={()=>setAppDialog(null)}>
   <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.5)'}}>
     <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close dialog" onPress={()=>setAppDialog(null)}/>
     <View style={{backgroundColor:palette.surface,borderRadius:28,padding:24,gap:18}}>
       <Text style={{fontSize:22,fontWeight:'600',color:palette.text}}>{appDialog?.title}</Text>
       {!!appDialog?.message&&<Text style={{fontSize:15,lineHeight:23,color:palette.muted}}>{appDialog.message}</Text>}
       <View style={[styles.wrap,{justifyContent:'flex-end'}]}>
         {(appDialog?.buttons?.length?appDialog.buttons:[{text:'OK'}]).map((action,index)=>(
           <Pressable key={index} accessibilityRole="button" accessibilityLabel={action.text} onPress={()=>{setAppDialog(null);action.onPress?.();}} style={{paddingHorizontal:12,paddingVertical:12}}><Text style={{color:action.style==='destructive'?roles.error:palette.accent,fontWeight:'600',fontSize:15}}>{action.text}</Text></Pressable>
         ))}
       </View>
     </View>
   </View>
 </Modal>
);
const [sortMenu,setSortMenu]=useState(false);
const [showArchive,setShowArchive]=useState(false),[selectedTrash,setSelectedTrash]=useState<string[]>([]),[retentionNotice,setRetentionNotice]=useState(false);
const [editingFolderId,setEditingFolderId]=useState<string|null>(null);
const [mapMenu,setMapMenu]=useState(false),[selectionMenu,setSelectionMenu]=useState(false),[sidebar,setSidebar]=useState(false),[moveFolderMenu,setMoveFolderMenu]=useState(false),[exportTarget,setExportTarget]=useState<string|null>(null);

const [backupMode,setBackupMode]=useState<'save'|'restore'|null>(null),[backupPassword,setBackupPassword]=useState(''),[backupBusy,setBackupBusy]=useState(false),[backupFile,setBackupFile]=useState<{uri:string;name:string}|null>(null);
const backupPickerRequest=useRef(0);
const closeBackup=()=>{
  backupPickerRequest.current++;
  setBackupMode(null);
  setBackupFile(null);
  setBackupPassword('');
};
const backupUri=backupFile?.uri;
useEffect(()=>{
  if(!backupUri)return;
  return()=>{void discardBackupFile(backupUri);};
},[backupUri]);

const [exportKind,setExportKind]=useState<ExportFormat|null>(null),[exportName,setExportName]=useState(''),[exportBusy,setExportBusy]=useState(false),[exportSeparate,setExportSeparate]=useState(false);

const editableCamera=useMapCamera(),deletedCamera=useMapCamera();
const {tx,ty,scale,rotation,startRotation,startX,startY,startScale}=readOnly?deletedCamera:editableCamera;

const [credentialFallback,setCredentialFallback]=useState(false);
const [unlockBusy,setUnlockBusy]=useState(false);
const unlocking=useRef(false);
const settingsBack=useRef<()=>void>(()=>setSettings(false));
const [storedCredentialType,setStoredCredentialType]=useState<'pin'|'password'>('pin'),[appActive,setAppActive]=useState(AppState.currentState==='active'),[locked,setLocked]=useState(true),[pinConfigured,setPinConfigured]=useState(false),[pinLockEnabled,setPinLockEnabledState]=useState(false),[pinInput,setPinInput]=useState(''),[settings,setSettings]=useState(false),[biometrics,setBiometrics]=useState(false);

useEffect(()=>{
  let alive=true;
  (async()=>{
    try{
      const existing=await loadSnapshot();
      const preferences=await loadMapPreferences();
      if(alive)setMapPrefs(preferences);
      if(existing){
        if(alive){
          setNotes(existing.notes);
          setFolders(existing.folders);
          setFocused('root');
          setMenu(true);
          setTrash(splitDeletedMaps(preferences.trashRetentionAcknowledged?pruneTrash(existing.trash):existing.trash));
           if(!preferences.trashRetentionAcknowledged&&!preferences.trashRetentionWarningSeen&&existing.trash.length>0)setRetentionNotice(true);
           if(!preferences.trashRetentionAcknowledged&&existing.trash.length===0)setMapPrefs(p=>({...p,trashRetentionAcknowledged:true}));
        }
      }else{
        const snapshot={notes:initial,folders:[],focused:'root',trash:[]};
        await saveSnapshot(snapshot);
        if(alive){
          setNotes(snapshot.notes);
          setFolders(snapshot.folders);
          setFocused('root');
          setMenu(true);
          setTrash([]);
        }
      }
      const configured=await hasPin();
       const kind=await credentialKind();
      const enabled=await isPinLockEnabled();
      const bio=await biometricEnabled();
      if(alive){
        setPinConfigured(configured);
         setStoredCredentialType(kind);
        setPinLockEnabledState(enabled);
        setBiometrics(bio);
        setLocked(enabled);
      }
    }catch(e){
      if(alive)setStorageError(String(e));
    }finally{
      if(alive)setLoaded(true);
    }
  })();
  return()=>{alive=false};
},[]);

useEffect(()=>{
  if(!loaded||storageError)return;
  saveSnapshot({notes,folders,focused:notes.some(n=>n.id===focused)?focused:'root',trash}).catch(e=>showDialog('Save failed',String(e)));
},[notes,folders,trash,loaded,storageError]);

useEffect(()=>{
  if(!loaded||storageError)return;
  saveFocusedNote(focused).catch(e=>showDialog('Save failed',String(e)));
},[focused,loaded,storageError]);

const pendingPreferences=useRef<{value:typeof mapPrefs;timer:ReturnType<typeof setTimeout>}|null>(null);
const flushPreferencesWrite=()=>{
  const pending=pendingPreferences.current;
  if(!pending)return;
  pendingPreferences.current=null;
  clearTimeout(pending.timer);
  saveMapPreferences(pending.value).catch(e=>showDialog('Map preferences save failed',String(e)));
};
useEffect(()=>{
  if(!loaded||storageError)return;
  const previous=pendingPreferences.current;
  if(previous)clearTimeout(previous.timer);
  pendingPreferences.current={value:mapPrefs,timer:setTimeout(flushPreferencesWrite,180)};
},[mapPrefs,loaded,storageError]);
useEffect(()=>()=>flushPreferencesWrite(),[]);

useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>{
    if(state!=='active')flushPreferencesWrite();
    if(state==='active')setDeletionUndo(undo=>undo&&Date.now()>=undo.expiresAt?null:undo);
    // Android biometric prompts can temporarily deactivate the app; do not relock or cancel that prompt.
    if(bioPromptInProgress.current)return;
    setAppActive(state==='active');
     if(state!=='active')bioPrompted.current=false;
     // Only a real Android screen-off event requires relocking. App switching does not.
     if(state==='active'&&pinLockEnabled&&consumedDeviceScreenOff()){
       setSettings(false);
       setCredentialFallback(false);
       setLocked(true);
       setPinInput('');
     }
  });
  return()=>sub.remove();
},[pinLockEnabled]);

useEffect(()=>{
 if(!loaded||!locked||!pinLockEnabled||!biometrics||!appActive||bioPrompted.current||bioPromptInProgress.current)return;
 bioPrompted.current=true;bioPromptInProgress.current=true;
 let cancelled=false;
 authenticateBiometric().then(ok=>{if(ok&&!cancelled){setLocked(false);setPinInput('');}}).catch(()=>{}).finally(()=>{bioPromptInProgress.current=false;});
 return()=>{cancelled=true;};
},[loaded,locked,pinLockEnabled,biometrics,appActive]);
const unlock=async()=>{
  if(unlocking.current)return;
  unlocking.current=true;
  setUnlockBusy(true);
  const credential=storedCredentialType==='pin'?'PIN':'password';
  try{
    const result=await verifyCredential(pinInput);
    if(result.alreadyBlocked){
      showDialog('Try again later','Too many incorrect '+credential+' attempts.');
      return;
    }
    setPinInput('');
    if(result.ok){setLocked(false);setCredentialFallback(false);}
    else showDialog('Incorrect '+credential,result.blockedUntil>Date.now()?'Try again in one minute.':'Please try again.');
  }catch(e){
    showDialog('Unlock error',String(e));
  }finally{
    unlocking.current=false;
    setUnlockBusy(false);
  }
};

const openDeletedMap=(batch:TrashBatch)=>{
  const ids=new Set(batch.notes.map(n=>n.id));
  const root=batch.notes.find(n=>!n.parentId||!ids.has(n.parentId))??batch.notes[0];
  if(!root)return;
  deletedListOffset.current={x:0,y:deletedScrollY.current};
  deletedCamera.tx.value=0;
  deletedCamera.ty.value=0;
  deletedCamera.rotation.value=0;
  deletedCamera.scale.value=preferredFit*1.1;
  setDeletedPreview({
    batch,focused:root.id,offsets:mapPrefs.offsets,collapsed:mapPrefs.collapsed,
    showMiniMap:false,showEntireMap:false,viewportBeforeExpand:null,
  });
  setMenu(false);
};

const closeMap=()=>{
  setMapMenu(false);
  setDeletedPreview(null);
  setMenu(true);
};

const current=notes.find(n=>n.id===focused)||notes[0];
const mapCurrent=mapNotesById.get(mapFocus)??current;
const parent=mapNotes.find(n=>n.id===mapCurrent.parentId);
const ancestors=useMemo(()=>{
  const a:Note[]=[];
  let n:Note|undefined=mapCurrent;
  const seen=new Set<string>();
  while(n&&!seen.has(n.id)){
    seen.add(n.id);
    a.unshift(n);
    n=mapNotesById.get(n.parentId??'');
  }
  return a;
},[mapCurrent,mapNotesById]);

const moveTo=(target:string)=>{
  const point=completeById.get(target);
  if(!point)return;
  if(readOnly)updateDeletedPreview(view=>({...view,focused:target}));
  else setFocused(target);
  const angle=rotation.value;
   tx.value=withTiming(-scale.value*(point.x*Math.cos(angle)-point.y*Math.sin(angle)),{duration:560});
  ty.value=withTiming(-scale.value*(point.x*Math.sin(angle)+point.y*Math.cos(angle)),{duration:560});
  
};

const openReader=(target:string)=>{
  setReader(target);
  setEditing(false);
};

const beginEdit=(target:string)=>{
  if(readOnly)return;
  const n=notes.find(x=>x.id===target);
  if(!n)return;
  resetEditor();
  setReader(target);
  setTitle(n.title);
  setBody(n.body);
  setEditing(true);
};

const saveEdit=()=>{
  if(readOnly||!reader)return;
  // A newly created child remains in the hierarchy even if its fields are blank.
  // Only the editor's explicit cross action discards a draft child.
  setNotes(ns=>{const updated=Date.now();const target=ns.find(n=>n.id===reader);let parentId=target?.parentId;const ancestorIds=new Set<string>();while(parentId&&parentId!=='root'){ancestorIds.add(parentId);parentId=ns.find(n=>n.id===parentId)?.parentId;}return ns.map(n=>n.id===reader?{...n,title:title.trim(),body,updatedAt:updated}:ancestorIds.has(n.id)?{...n,updatedAt:updated}:n);});
  setEditing(false);
  setDraftChildId(null);
  setReader(null);
};

const cancelReader=()=>{
  // Keep the existing Android Back behaviour; the explicit X always discards.
  if(editing){saveEdit();return;}
  setDraftChildId(null);
  setReader(null);
  setEditing(false);
};
const closeReaderWithCross=()=>{
  if(draftChildId&&draftChildId===reader){
    setEditing(false);
    setNotes(ns=>ns.filter(n=>n.id!==draftChildId));
    setDraftChildId(null);
    setReader(null);
    return;
  }
  // X is an explicit cancellation and must not invoke automatic saving.
  setEditing(false);
  setDraftChildId(null);
  setReader(null);
};

const addChild=(parentId:string)=>{
  if(readOnly)return;
  const newId=id();
  setNotes(ns=>[...ns,{id:newId,parentId,title:'',body:'',updatedAt:Date.now(),folderId:null}]);
  setMenu(false);
  setDraftChildId(newId);
  beginNew(newId);
};

const beginNew=(newId:string)=>{
  resetEditor();
  setReader(newId);
  setTitle('');
  setBody('');
  setEditing(true);
};

const clearUndoNotification=()=>setDeletionUndo(null);
const undoDeletion=()=>{
  if(!deletionUndo)return;
  if(Date.now()>=deletionUndo.expiresAt){clearUndoNotification();return;}
  try{
    if(deletionUndo.kind==='branch'){
      setNotes(restoreBatch(notes,deletionUndo.batch));
    }else{
      const ids=new Set(deletionUndo.ids);
      let updated=notes;
      const batches=trash.filter(batch=>ids.has(batch.id));
      for(const batch of batches)updated=restoreBatch(updated,batch);
      const restoredIds=new Set(batches.flatMap(batch=>batch.notes.map(note=>note.id)));
      setNotes(updated);
      setTrash(existing=>existing.filter(batch=>!ids.has(batch.id)));
      setMapPrefs(p=>({...p,archived:restoreArchiveOrder(p.archived,deletionUndo.archiveOrder,restoredIds)}));
    }
  }catch(e){showDialog('Cannot undo deletion',String(e));}
  clearUndoNotification();
};
 const deleteSelected=()=>{
  const ids=selected.filter(x=>notes.some(n=>n.id===x&&n.parentId==='root'));
  if(!ids.length)return;
  const result=deleteBranches(notes,ids);
  const deletedMaps=splitDeletedMaps([result.batch]);
  if(!result.batch.notes.length||!deletedMaps.length)return;
  const mapCount=ids.length;
  showDialog('Move to Deleted',`Move ${mapCount} map${mapCount===1?'':'s'} to Deleted? Maps and their descendants can be restored for seven days before permanent removal.`,[
    {text:'Cancel',style:'cancel'},
    {text:'Move',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
      setMapPrefs(p=>({...p,archived:p.archived.filter(item=>!result.batch.notes.some(n=>n.id===item))}));
      setTrash(existing=>mapPrefs.trashRetentionAcknowledged?pruneTrash([...deletedMaps,...existing]):[...deletedMaps,...existing]);
      setDeletionUndo({kind:'maps',ids:deletedMaps.map(batch=>batch.id),archiveOrder:mapPrefs.archived,expiresAt:Date.now()+5000});
      if(result.batch.notes.some(n=>n.id===focused))setFocused('root');
      setSelected([]);setReader(null);
    }}
  ]);
};

useEffect(()=>{
  if(!deletionUndo)return;
  const timer=setTimeout(clearUndoNotification,Math.max(0,deletionUndo.expiresAt-Date.now()));
  return()=>clearTimeout(timer);
},[deletionUndo]);
const removeBranch=(target:string)=>{
  if(target==='root')return;
  const note=notes.find(n=>n.id===target);
  if(!note)return;
  const result=deleteBranches(notes,[target]);
  if(!result.batch.notes.length)return;
  const wholeMap=note.parentId==='root';
  showDialog(wholeMap?'Move map to Deleted?':'Delete branch permanently?',
    wholeMap?'This map and its descendants can be restored from Deleted for seven days.':'This branch and its descendants will be permanently deleted after five seconds or when Undo is dismissed. They will not appear in Deleted.',[
    {text:'Cancel',style:'cancel'},
    {text:wholeMap?'Move':'Delete',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
      setMapPrefs(p=>({...p,archived:p.archived.filter(item=>!result.batch.notes.some(n=>n.id===item))}));
      if(wholeMap){
        setTrash(existing=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...existing]):[result.batch,...existing]);
        setDeletionUndo({kind:'maps',ids:[result.batch.id],archiveOrder:mapPrefs.archived,expiresAt:Date.now()+5000});
      }else{
        // Exclude branch deletion from the permanent seven-day Deleted store.
        setDeletionUndo({kind:'branch',batch:result.batch,expiresAt:Date.now()+5000});
      }
      if(result.batch.notes.some(n=>n.id===focused))setFocused(note.parentId||'root');
      if(reader&&result.batch.notes.some(n=>n.id===reader))setReader(null);
    }}
  ]);
};
const reparent=(target:string,direction:'up'|'down')=>{
  const note=notes.find(n=>n.id===target);
  if(!note||note.id==='root')return;

  if(direction==='up'){
    const oldParent=notes.find(n=>n.id===note.parentId);
    if(!oldParent?.parentId){
      showDialog('Already at top level');
      return;
    }
    setNotes(ns=>ns.map(n=>n.id===target?{
      ...n,parentId:oldParent.parentId,updatedAt:Date.now()
    }:n));
    return;
  }

  const candidates=notes.filter(n=>n.parentId===note.parentId&&n.id!==target);
  if(!candidates.length){
    showDialog('No sibling level','Create another note at this level before moving this note under it.');
    return;
  }
  showDialog('Move under which note?',undefined,[
    ...candidates.slice(0,12).map(n=>({
      text:n.title||'Untitled',
      onPress:()=>setNotes(ns=>ns.map(x=>x.id===target?{
        ...x,parentId:n.id,updatedAt:Date.now()
      }:x))
    })),
    {text:'Cancel'}
  ]);
};

const showNodeActions=(target:string)=>setNodeActions(target);

const newMap=()=>{
  const newId=id();
  // Append new maps to Custom order to avoid relocating existing cards.
  if((mapPrefs.librarySort||'custom')==='custom'){
    setMapPrefs(p=>({...p,customOrder:[...new Set([...(p.customOrder||[]),...shown.map(n=>n.id),newId])]}));
  }
  setNotes(ns=>[...ns,{
    id:newId,parentId:'root',title:'',body:'',
    updatedAt:Date.now(),folderId:folderFilter
  }]);
  setMenu(false);
  setFocused(newId);
  tx.value=withTiming(0);
  ty.value=withTiming(0);
  scale.value=withTiming(preferredFit*1.1);
  beginNew(newId);
};

const handleLibraryBack=(lockBeforeExit=false)=>{
  if(sidebar){setSidebar(false);return;}
  if(selectionMenu||moveFolderMenu||sortMenu||trashMenu||cardMenuId){
    setSelectionMenu(false);setMoveFolderMenu(false);setSortMenu(false);setTrashMenu(false);setCardMenuId(null);
    return;
  }
  if(selected.length){setSelected([]);return;}
  if(selectedTrash.length){setSelectedTrash([]);return;}
  if(librarySearching){closeLibrarySearch();return;}
  if(lockBeforeExit&&pinLockEnabled)setLocked(true);
  BackHandler.exitApp();
};

useEffect(()=>{
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(reader||gestureHelp||settings||backupMode||exportKind||labelManager||creatingFolder)return false;
    if(menu){handleLibraryBack(true);return true;}
    if(mapMenu||nodeActions){setMapMenu(false);setNodeActions(null);return true;}
    closeMap();return true;
  });
  return()=>sub.remove();
},[menu,reader,gestureHelp,settings,backupMode,exportKind,labelManager,creatingFolder,sidebar,selectionMenu,moveFolderMenu,sortMenu,trashMenu,cardMenuId,selected,selectedTrash,librarySearching,mapMenu,nodeActions,pinLockEnabled]);

const acknowledgeTrashRetention=()=>{
  const expired=trash.filter(b=>Date.now()-b.deletedAt>=7*86400000).length;
  showDialog('Activate seven-day retention?',`${expired} deleted batch(es) older than seven days will be permanently removed. Restore important notes first.`,[
    {text:'Not yet',style:'cancel'},
    {text:'Activate and remove expired',style:'destructive',onPress:()=>{
      setTrash(b=>pruneTrash(b));setMapPrefs(p=>({...p,trashRetentionAcknowledged:true}));
      setRetentionNotice(false);setSelectedTrash([]);
    }}
  ]);
};
useEffect(()=>{
 if(!loaded||!mapPrefs.trashRetentionAcknowledged)return;
 setTrash(previous=>{
   const next=pruneTrash(previous);
   return next.length===previous.length?previous:next;
 });
},[loaded,mapPrefs.trashRetentionAcknowledged,appActive]);
const restoreSelectedTrash=()=>{
 try{
  let updated=notes;
  for(const b of trash.filter(b=>selectedTrash.includes(b.id)))updated=restoreBatch(updated,b);
  setNotes(updated);setTrash(t=>t.filter(b=>!selectedTrash.includes(b.id)));setSelectedTrash([]);
 }catch(e){showDialog('Cannot restore selection',String(e));}
};
const removeSelectedTrash=()=>showDialog('Delete selected permanently?', 'This cannot be undone.',[
 {text:'Cancel',style:'cancel'},
 {text:'Delete forever',style:'destructive',onPress:()=>{setTrash(t=>t.filter(b=>!selectedTrash.includes(b.id)));setSelectedTrash([]);}}
]);
const updateMapOffset=(parentId:string,update:(angle:number)=>number)=>{
  const next=(offsets:Record<string,number>)=>({...offsets,[parentId]:update(offsets[parentId]||0)});
  if(readOnly)updateDeletedPreview(view=>({...view,offsets:next(view.offsets)}));
  else setMapPrefs(p=>({...p,offsets:next(p.offsets)}));
};
const updateMapCollapsed=(update:(collapsed:Record<string,boolean>)=>Record<string,boolean>)=>{
  if(readOnly)updateDeletedPreview(view=>({...view,collapsed:update(view.collapsed)}));
  else setMapPrefs(p=>({...p,collapsed:update(p.collapsed)}));
};
const updateChildRotation=(parentId:string,delta:number)=>updateMapOffset(parentId,angle=>angle+delta);
 // Release-only settling: unrelated branches never move to make way.
 // A modest flick coasts briefly; holding still yields near-zero velocity.
 const finishChildRotation=(parentId:string,angularVelocity:number)=>{
   const parent=visible.find(n=>n.note.id===parentId);
   if(!parent)return;
   const mapRoot=visible.find(n=>n.level===0)?.note;
   if(!mapRoot)return;
   const start=mapOffsets[parentId]||0;
   const coast=Math.max(-0.34,Math.min(0.34,angularVelocity*0.12));
   // A flick coasts only in its original direction. Avoid searching for
   // nearby angles during momentum, which produced visual reversals.
   // A stationary release must not introduce any extra movement.
   if(Math.abs(coast)<0.015)return;
   const distance=coast;
   const began=Date.now(),duration=280;
   const animate=()=>{
     const t=Math.min(1,(Date.now()-began)/duration);
     const ease=1-Math.pow(1-t,3);
     const value=start+distance*ease;
     updateMapOffset(parentId,()=>value);
     if(t<1)requestAnimationFrame(animate);
   };
   requestAnimationFrame(animate);
 };
 const pan=Gesture.Pan().minPointers(1)
  .onStart(()=>{
    startX.value=tx.value;
    startY.value=ty.value;
  })
  .onUpdate(e=>{
    tx.value=startX.value+e.translationX;
    ty.value=startY.value+e.translationY;
  });


 const rotate=Gesture.Rotation()
  .onStart(()=>{startRotation.value=rotation.value;})
  .onUpdate(e=>{rotation.value=startRotation.value+e.rotation;});

const animated=useAnimatedStyle(()=>({
  transform:[
    {translateX:tx.value},
    {translateY:ty.value},
    {scale:scale.value},
    {rotateZ:`${rotation.value}rad`}
  ]
}));

const miniRotationStyle=useAnimatedStyle(()=>({transform:[{rotateZ:`${rotation.value}rad`}]}));

// All nodes in the active map remain mounted at stable world coordinates.
// Moving between levels animates the camera, rather than rebuilding the diagram.
const mapRoot=useMemo(()=>{
  let n=mapCurrent;
  const seen=new Set<string>();
  while(n.parentId&&n.parentId!=='root'&&!seen.has(n.id)){
    seen.add(n.id);
    const p=mapNotesById.get(n.parentId);
    if(!p)break;
    n=p;
  }
  return n;
},[mapCurrent,mapNotesById]);
const completeMap=useMemo(()=>radialTree(mapRoot,mapNotes,mapOffsets,{},mapChildren),
  [mapRoot,mapNotes,mapOffsets,mapChildren]);
const fullMap=useMemo(()=>showEntireMap?completeMap:radialTree(mapRoot,mapNotes,mapOffsets,mapCollapsed,mapChildren),
  [showEntireMap,completeMap,mapRoot,mapNotes,mapOffsets,mapCollapsed,mapChildren]);
const completeById=useMemo(()=>new Map(completeMap.map(point=>[point.note.id,point])),[completeMap]);
const visible=useMemo(()=>{
  const focus=fullMap.find(n=>n.note.id===mapFocus);
  const depth=focus?.level||0;
  const ancestors=new Set<string>();
  let id=mapFocus;
  while(id&&!ancestors.has(id)){
    ancestors.add(id);
    id=mapNotesById.get(id)?.parentId||'';
  }
  return fullMap.filter(n=>showEntireMap||n.level<=1||ancestors.has(n.note.id)||
    (ancestors.has(n.note.parentId||'')&&n.level<=depth+1));
},[fullMap,mapFocus,mapNotesById,showEntireMap]);

const [canvasW,setCanvasW]=useState(W);
const [canvasH,setCanvasH]=useState(H-180);

// Fixed 100% reference: changes in node count or focus must not redefine zoom.
// Retain the former sparse-map reference for the initial view.
const preferredFit=useMemo(()=>{const fit=fitMap([{x:-313.5,y:0},{x:313.5,y:0}],Math.max(1,canvasW),Math.max(1,canvasH)).scale;return Number.isFinite(fit)&&fit>0?fit*(1.75/1.2)*1.1:1;},[canvasW,canvasH]);
// Only reset zoom when entering a map, not after a node change.
const zoomBaseline=preferredFit*1.1;
const pinch=Gesture.Pinch()
  .onStart(()=>{
    startScale.value=Number.isFinite(scale.value)&&scale.value>0?scale.value:1;
  })
  .onUpdate(e=>{
    const baseline=zoomBaseline;
    const factor=Number.isFinite(e.scale)&&e.scale>0?e.scale:1;
    const next=startScale.value*factor;
    if(Number.isFinite(next)&&next>0)
      scale.value=Math.min(baseline*2,Math.max(baseline*0.1,next));
  });
const adjustZoom=(step:number)=>{
  const next=(Math.round(scale.value/zoomBaseline*10)+step)/10;
  scale.value=withTiming(zoomBaseline*Math.max(0.1,Math.min(2,next)));
};
useEffect(()=>{if(!menu)scale.value=withTiming(zoomBaseline,{duration:300});},[menu]);
useAnimatedReaction(
  ()=>Number.isFinite(scale.value)&&Number.isFinite(preferredFit)&&preferredFit>0?Math.round(Math.max(10,Math.min(200,scale.value/zoomBaseline*100))):100,
  (value,previous)=>{if(value!==previous)runOnJS(setZoomPercent)(value);}
);

// Use a fixed local drawing space and transform every point into it.
// This avoids SVG viewport width/preserveAspectRatio mismatches that made
// the overview appear pushed to the right on Android.
const miniBounds=useMemo(()=>{
  const width=1000,height=540,pad=16;
  if(!completeMap.length)return {width,height,scale:1,dx:width/2,dy:height/2};
  const {minX,maxX,minY,maxY}=pointBounds(completeMap);
  const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
  const scale=Math.min((width-2*pad)/spanX,(height-2*pad)/spanY);
  const dx=width/2-(minX+maxX)*scale/2;
  const dy=height/2-(minY+maxY)*scale/2;
  return {width,height,scale,dx,dy};
},[completeMap]);
const focusPoint=visible.find(x=>x.note.id===mapFocus)||visible[0];
const toggleEntireMap=()=>{
   if(!showEntireMap){
     const viewport={x:tx.value,y:ty.value,zoom:scale.value,angle:rotation.value};
     if(readOnly)updateDeletedPreview(view=>({...view,showEntireMap:true,viewportBeforeExpand:viewport}));
     else{
       editableViewportBeforeExpand.current=viewport;
       setEditableEntireMap(true);
     }
     return;
   }
   const previous=readOnly?deletedPreview.viewportBeforeExpand:editableViewportBeforeExpand.current;
   if(readOnly)updateDeletedPreview(view=>({...view,showEntireMap:false,viewportBeforeExpand:null}));
   else{
     editableViewportBeforeExpand.current=null;
     setEditableEntireMap(false);
   }
   if(previous){
     tx.value=withTiming(previous.x);ty.value=withTiming(previous.y);
     scale.value=withTiming(previous.zoom);rotation.value=withTiming(previous.angle);
   }
 };
 const fitCurrentMap=()=>{
  const fit=fitMap(visible,canvasW,canvasH);
  tx.value=withTiming(fit.x*1.1);
  ty.value=withTiming(fit.y*1.1);
  scale.value=withTiming(fit.scale*1.1);
  rotation.value=withTiming(0);
};
useEffect(()=>{
  if(menu||!showEntireMap)return;
  const fit=fitMap(completeMap,canvasW,canvasH);
  tx.value=withTiming(fit.x);
  ty.value=withTiming(fit.y);
  scale.value=withTiming(fit.scale);
  rotation.value=withTiming(0);
},[menu,showEntireMap,completeMap,canvasW,canvasH]);

const visibleById=useMemo(()=>new Map(visible.map(point=>[point.note.id,point])),[visible]);
const miniLines=useMemo(()=>completeMap.flatMap(n=>{
  const p=completeById.get(n.note.parentId??'');
  return p&&p.note.id!=='root'?[{id:n.note.id,x1:p.x,y1:p.y,x2:n.x,y2:n.y}]:[];
}),[completeMap,completeById]);
// Hidden children retain indicators around their visible parent.
const hiddenIndicators=useMemo(()=>completeMap.flatMap(n=>{
  const p=visibleById.get(n.note.parentId??'');
  if(!p||visibleById.has(n.note.id))return [];
  const radius=nodeRadius(p.level);
  const angle=Math.atan2(n.y-p.y,n.x-p.x);
  return [{note:n.note,x:p.x+radius*Math.cos(angle),y:p.y+radius*Math.sin(angle)}];
}),[completeMap,visibleById]);
const lines=useMemo(()=>visible
  .filter(x=>x.note.parentId&&x.note.parentId!=='root')
  .map(x=>{
    const p=visibleById.get(x.note.parentId??'');
    return {x1:p?.x||0,y1:p?.y||0,x2:x.x,y2:x.y,id:x.note.id};
  }),[visible,visibleById]);

const navigateIndicator=(targetId:string)=>{
  const target=mapNotesById.get(targetId);
  if(!target)return;
  const ancestors:string[]=[];
  let parentId=target.parentId;
  const seen=new Set<string>();
  while(parentId&&parentId!=='root'&&!seen.has(parentId)){
    seen.add(parentId);
    ancestors.push(parentId);
    parentId=mapNotesById.get(parentId)?.parentId||null;
  }
  updateMapCollapsed(previous=>{
    const collapsed={...previous};
    ancestors.forEach(id=>{collapsed[id]=false;});
    return collapsed;
  });
  moveTo(targetId);
};

const nodePress=(n:Note)=>{
  if(n.id!==mapFocus)moveTo(n.id);
};

const node=(n:Note,x:number,y:number,level:number)=>{
  const isFocused=n.id===mapFocus;
  const storedColor=mapPrefs.colors[n.id];
  const nodeBackground=displayKeepColor(storedColor,effectiveTheme,isFocused?palette.accent:level<=1?palette.node:palette.subnode);
  const nodeText=storedColor?keepForeground(nodeBackground):isFocused?palette.onAccent:palette.text;
  const size=nodeRadius(level)*2;
  const touchMargin=level>=2?42:30;
  // Calculate stable branch geometry outside the UI-thread gesture worklet.
  // Looking up React arrays inside onChange can fail intermittently.
  const branchParent=visibleById.get(n.parentId??'');
  const branchX=branchParent?x-branchParent.x:0;
  const branchY=branchParent?y-branchParent.y:0;
  const branchId=n.parentId||'';

  const long=Gesture.LongPress()
    .minDuration(550)
    .onEnd((_e,ok)=>{
      if(ok)runOnJS(showNodeActions)(n.id);
    });

  const single=Gesture.Tap()
    .maxDuration(230)
    .numberOfTaps(1)
    .onEnd((_e,ok)=>{
      if(ok)runOnJS(nodePress)(n);
    });

  const triple=Gesture.Tap()
    .numberOfTaps(3)
    .maxDelay(280)
    .onEnd((_e,ok)=>{
      if(ok)runOnJS(beginEdit)(n.id);
    });

  const double=Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((_e,ok)=>{
      if(ok)runOnJS(openReader)(n.id);
    });

  const taps=readOnly?Gesture.Exclusive(long,double,single):Gesture.Exclusive(long,triple,double,single);
  return (
    <GestureDetector
      key={n.id}
      gesture={branchParent?Gesture.Simultaneous(
        taps,
        Gesture.Pan().minPointers(1).maxPointers(1).minDistance(4)
          .onChange(e=>{
            const a=rotation.value,c=Math.cos(a),si=Math.sin(a);
            const k=Number.isFinite(scale.value)&&scale.value>0?scale.value:1;
            const dx=k*(branchX*c-branchY*si),dy=k*(branchX*si+branchY*c);
            const denominator=Math.max(2500,Math.min(dx*dx+dy*dy,160*160));
            const delta=(dx*e.changeY-dy*e.changeX)/denominator;
            if(Number.isFinite(delta)&&Math.abs(delta)>0.00001)
              runOnJS(updateChildRotation)(branchId,delta);
          })
          .onEnd(e=>{
            const a=rotation.value,c=Math.cos(a),si=Math.sin(a);
            const k=Number.isFinite(scale.value)&&scale.value>0?scale.value:1;
            const dx=k*(branchX*c-branchY*si),dy=k*(branchX*si+branchY*c);
            const denominator=Math.max(2500,Math.min(dx*dx+dy*dy,160*160));
            const speed=(dx*e.velocityY-dy*e.velocityX)/denominator;
            if(Number.isFinite(speed))
              runOnJS(finishChildRotation)(branchId,Math.max(-2,Math.min(2,speed)));
          })
      ):taps}
    >
      <View collapsable={false} accessible accessibilityRole="button"
        accessibilityLabel={n.title||'Untitled note'} accessibilityState={{selected:isFocused}}
        accessibilityActions={[
          {name:'activate',label:'Focus note'},{name:'read',label:'Read note'},
          ...(!readOnly?[{name:'edit',label:'Edit note'}]:[]),
          {name:'longpress',label:'Note actions'},
        ]}
        onAccessibilityAction={({nativeEvent:{actionName}})=>{
          if(actionName==='activate')nodePress(n);
          else if(actionName==='read')openReader(n.id);
          else if(actionName==='edit'&&!readOnly)beginEdit(n.id);
          else if(actionName==='longpress')showNodeActions(n.id);
        }}
        style={{
        position:'absolute',left:x-size/2-touchMargin,top:y-size/2-touchMargin,
        width:size+touchMargin*2,height:size+touchMargin*2,alignItems:'center',justifyContent:'center'
      }}>
      <View style={[
        styles.node,
        {
          width:size,
          height:size,
          borderRadius:size/2,
          left:touchMargin,
          top:touchMargin,
          backgroundColor:nodeBackground,
          borderColor:n.id===mapFocus?palette.accent:palette.border
        }
      ]}>
        <Upright angle={rotation}>
          <Text
            numberOfLines={2}
            style={[
              styles.nodeTitle,
              {
                color:nodeText,
                fontSize:level>=2?14:16
              }
            ]}
          >
            {n.title}
          </Text>
          {Boolean(n.body.trim())&&(
            <Text style={{
              color:nodeText,
              fontSize:15
            }}>≡</Text>
          )}
        </Upright>
      </View>
      </View>
    </GestureDetector>
  );
};

const centerX=canvasW/2,centerY=canvasH/2;

const activeReader=mapNotesById.get(reader??'')||initial[0];
const previewCache=useMemo(()=>new WeakMap<Note[],Map<string,React.ReactElement>>(),[palette,effectiveTheme,mapPrefs.offsets,mapPrefs.colors]);
const mapPreview=(root:Note,previewNotes:Note[]=notes)=>{
  let previews=previewCache.get(previewNotes);
  if(!previews){previews=new Map();previewCache.set(previewNotes,previews);}
  const cached=previews.get(root.id);
  if(cached)return cached;
  const children=previewNotes===notes?notebookChildren:indexChildren(previewNotes);
  const points=radialTree(root,previewNotes,mapPrefs.offsets,{},children);
  const maxDepth=points.reduce((depth,point)=>Math.max(depth,point.level),0);
  const thumbnailHeight=Math.min(332,Math.max(119,88+Math.ceil(Math.log2(points.length+1))*27+maxDepth*13));
  // Thumbnail framing must not inherit the interactive canvas's minimum zoom.
  const bounds=pointBounds(points);
  const thumbScale=Math.min(152/Math.max(1,bounds.maxX-bounds.minX),(thumbnailHeight-16)/Math.max(1,bounds.maxY-bounds.minY),1);
  const thumbX=80-(bounds.minX+bounds.maxX)*thumbScale/2;
  const thumbY=thumbnailHeight/2-(bounds.minY+bounds.maxY)*thumbScale/2;
  const byId=new Map(points.map(v=>[v.note.id,v]));
  const preview=(
    <Svg width="100%" height={thumbnailHeight} viewBox={`0 0 160 ${thumbnailHeight}`} accessibilityLabel={`Preview of ${root.title||'untitled map'}`}>
      {points.map(v=>{
        const parent=byId.get(v.note.parentId||'');
        return parent?<Line key={v.note.id} x1={thumbX+parent.x*thumbScale} y1={thumbY+parent.y*thumbScale} x2={thumbX+v.x*thumbScale} y2={thumbY+v.y*thumbScale} stroke={palette.connector} strokeWidth={1.2}/>:null;
      })}
      {points.map(v=><Circle key={v.note.id} cx={thumbX+v.x*thumbScale} cy={thumbY+v.y*thumbScale} r={v.note.id===root.id?4:2.7} fill={displayKeepColor(mapPrefs.colors[v.note.id],effectiveTheme,v.note.id===root.id?palette.accent:palette.node)} stroke={palette.border} strokeWidth={0.8}/>)}
    </Svg>
  );
  previews.set(root.id,preview);
  return preview;
};
const applyNoteFormat=(kind:'bold'|'italic'|'underline'|'bullets'|'numbers'|'clear')=>{
 if(editorReady)richEditorRef.current?.format(kind);
};
const withColor=(old:Record<string,string>,targets:string[],color:string)=>{
 const next={...old};
 for(const target of targets){if(color===CARD_PALETTE[0])delete next[target];else next[target]=color;}
 return next;
};
const applyChosenColor=(color:string)=>{
 if(colorTarget==='cards'){
   setMapPrefs(p=>({...p,cardColors:withColor(p.cardColors,selected,color)}));setSelected([]);
 }else if(colorTarget==='note'&&reader){
   setMapPrefs(p=>({...p,noteColors:withColor(p.noteColors,[reader],color)}));
 }else if(colorTarget==='node'){
   setMapPrefs(p=>({...p,colors:withColor(p.colors,[focused],color)}));
 }
 setColorTarget(null);
};
const noteBodyView=(value:string)=>value.split('\n').map((line,index)=>(
  <View key={index} style={{minHeight:28}}>
    <Text style={{fontSize:17,lineHeight:27,color:reader?noteDisplayText:palette.text}}>{parseRichLine(line).map((run,i)=><Text key={i} style={{fontWeight:run.bold?'700':'400',fontStyle:run.italic?'italic':'normal',textDecorationLine:run.underline?'underline':'none'}}>{run.text}</Text>)}</Text>
  </View>
));
const shown=useMemo(()=>{
 const order=new Map((mapPrefs.customOrder??[]).map((id,index)=>[id,index]));
 const archives=new Map(mapPrefs.archived.map((id,index)=>[id,index]));
 const pinned=new Set(mapPrefs.pinned);
 const query=librarySearch.trim().toLocaleLowerCase();
 const direction=sortDirection==='asc'?1:-1;
 return notes.filter(n=>n.parentId==='root'&&archives.has(n.id)===showArchive&&
   (!folderFilter||hasLabel(n,folderFilter))&&matchesMapQuery(n,notebookChildren,query)).sort((a,b)=>{
   if(showArchive)return archives.get(b.id)!-archives.get(a.id)!;
   if(librarySort==='custom'){
     const ai=order.get(a.id),bi=order.get(b.id);
     return (ai??Number.MAX_SAFE_INTEGER)-(bi??Number.MAX_SAFE_INTEGER)||
       (ai===undefined&&bi===undefined?b.updatedAt-a.updatedAt:0);
   }
   const pinOrder=Number(pinned.has(b.id))-Number(pinned.has(a.id));
   if(pinOrder)return pinOrder;
   const result=librarySort==='title'?a.title.localeCompare(b.title,undefined,{sensitivity:'base'}):librarySort==='created'?Number(a.id.split('-')[0])-Number(b.id.split('-')[0]):a.updatedAt-b.updatedAt;
   return direction*result || a.id.localeCompare(b.id);
 });
},[notes,notebookChildren,folderFilter,librarySearch,librarySort,sortDirection,mapPrefs.customOrder,mapPrefs.pinned,mapPrefs.archived,showArchive]);

// Group nearby cards into virtualized masonry sections under a single scroll owner.
 // Each section keeps the approved alternating two-column order and variable card heights.
 const libraryChunks=useMemo(()=>{
   const chunks:Note[][]=[];
   const chunkSize=mapPrefs.viewMode==='grid'?16:12;
   for(let i=0;i<shown.length;i+=chunkSize)chunks.push(shown.slice(i,i+chunkSize));
   return chunks;
 },[shown,mapPrefs.viewMode]);
 const archiveSelection=(archive:boolean)=>{
  const targetIds=new Set(selected.filter(x=>x!=='root'));
  setMapPrefs(p=>({...p,archived:archive?[...new Set([...p.archived,...targetIds])]:p.archived.filter(x=>!targetIds.has(x))}));
  if(archive)setArchiveUndoIds([...targetIds]);
  setSelected([]);setSelectionMenu(false);
};
const archiveOne=(id:string,archive:boolean)=>{
  setMapPrefs(p=>({...p,archived:archive?[...new Set([...p.archived,id])]:p.archived.filter(x=>x!==id)}));
  if(archive)setArchiveUndoIds([id]);
};
useEffect(()=>{
 if(!archiveUndoIds.length)return;
 const timeout=setTimeout(()=>setArchiveUndoIds([]),5000);
 return()=>clearTimeout(timeout);
},[archiveUndoIds]);
const undoArchive=()=>{
 setMapPrefs(p=>({...p,archived:p.archived.filter(id=>!archiveUndoIds.includes(id))}));
 setArchiveUndoIds([]);
};
const libraryCardRefs=useRef<Record<string,View|null>>({});
const [libraryCardHeights,setLibraryCardHeights]=useState<Record<string,number>>({});
const recordCardHeight=(id:string,height:number)=>{
 if(height<20)return;
 setLibraryCardHeights(p=>Math.abs((p[id]??0)-height)<2?p:{...p,[id]:height});
};
const [dragOrigin,setDragOrigin]=useState<{id:string;top:number;left:number;chunk:number}|null>(null);
const layoutColumnRef=useRef<Record<string,number>>({});
 const archiveColumnRef=useRef<Record<string,number>>({});
 const labelColumnRefs=useRef<Record<string,Record<string,number>>>({});
const lastDragTarget=useRef<string|null>(null);
const libraryListRef=useRef<FlatList<Note[]>>(null);
const libraryScrollOffset=useRef(0);
const dragUpdateBusy=useRef(false);
const pendingDrop=useRef<(()=>void)|null>(null);
const dragSession=useRef(0);
const finishDrag=()=>{
  dragSession.current++;
  pendingDrop.current=null;
  lastDragTarget.current=null;
  setDragOrigin(null);
  setSelected([]);setSelectionMenu(false);setCardMenuId(null);
};
// Use a 70% overlap threshold for direct placement. Gaps, adjacent-column
// slots and the list tail also accept a dragged card.
const reorderCard=(draggedId:string,dx:number,dy:number,release=false)=>{
 if(librarySort!=='custom'){if(release)finishDrag();return;}
 if(dragUpdateBusy.current){
   if(release)pendingDrop.current=()=>reorderCard(draggedId,dx,dy,true);
   return;
 }
 const session=dragSession.current;
 const columns=folderFilter?labelColumnRefs.current[folderFilter]??{}:layoutColumnRef.current;
 const dragged=libraryCardRefs.current[draggedId];
 const candidates=shown.filter(n=>n.id!==draggedId)
  .map(n=>({id:n.id,ref:libraryCardRefs.current[n.id]})).filter(n=>n.ref);
 if(!dragged||!candidates.length){if(release)finishDrag();return;}
 dragUpdateBusy.current=true;
 let completed=false;
 const completeMeasurement=()=>{
   if(completed)return;
   completed=true;
   clearTimeout(timeout);
   dragUpdateBusy.current=false;
   if(release&&session===dragSession.current)finishDrag();
   const finalDrop=pendingDrop.current;
   pendingDrop.current=null;
   finalDrop?.();
 };
 // A virtualized card may unmount before Android returns its measurement.
 const timeout=setTimeout(completeMeasurement,150);
 dragged.measureInWindow((ox,oy,ow,oh)=>{
  if(completed)return;
  if(ow<=0||oh<=0||session!==dragSession.current){completeMeasurement();return;}
  const left=ox+dx,top=oy+dy,right=left+ow,bottom=top+oh;
  const midX=(left+right)/2,midY=(top+bottom)/2;
  const rects:{id:string;x:number;y:number;w:number;h:number;overlap:number}[]=[];
  let pending=candidates.length;
  for(const candidate of candidates){
   candidate.ref!.measureInWindow((x,y,w,h)=>{
    if(completed)return;
    if(w>0&&h>0){
     const overlapW=Math.max(0,Math.min(right,x+w)-Math.max(left,x));
     const overlapH=Math.max(0,Math.min(bottom,y+h)-Math.max(top,y));
     rects.push({id:candidate.id,x,y,w,h,overlap:overlapW*overlapH/Math.min(ow*oh,w*h)});
    }
    if(--pending!==0)return;
    try{
      if(!rects.length||session!==dragSession.current)return;
      const leftCard=rects.find(q=>columns[q.id]===0);
      const rightCard=rects.find(q=>columns[q.id]===1);
      const col=mapPrefs.viewMode==='list'?0:!leftCard?1:!rightCard?0:
        Math.abs(midX-(leftCard.x+leftCard.w/2))<=Math.abs(midX-(rightCard.x+rightCard.w/2))?0:1;
      const inColumn=rects.filter(q=>mapPrefs.viewMode==='list'||columns[q.id]===col).sort((a,b)=>a.y-b.y);
      const strongest=rects.reduce((best,q)=>q.overlap>best.overlap?q:best,rects[0]);
      let target:string|null=null,atEnd=false;
      if(strongest.overlap>=0.70)target=strongest.id;
      else if(inColumn.length){
        const next=inColumn.find(q=>midY<q.y+q.h*0.5);
        if(next)target=next.id;
        else {
          const tail=inColumn[inColumn.length-1];
          if(midY>tail.y+tail.h*0.55){target=tail.id;atEnd=shown[shown.length-1]?.id===tail.id||release;}
        }
      }
      if(!target)return;
      const targetKey=atEnd?'__end__':target;
      if(!release&&lastDragTarget.current===targetKey)return;
      lastDragTarget.current=targetKey;
      setMapPrefs(p=>{
       const roots=new Set(notes.filter(n=>n.parentId==='root').map(n=>n.id));
       const current=[...new Set([...(p.customOrder||[]),...shown.map(n=>n.id),...roots])].filter(id=>roots.has(id));
       const from=current.indexOf(draggedId),to=current.indexOf(target!);
       if(from<0||to<0)return p;
       const next=current.slice();next.splice(from,1);
       if(atEnd)next.push(draggedId);
       else next.splice(next.indexOf(target!),0,draggedId);
       const cols={...(p.customColumns||{}),[draggedId]:col as 0|1};
       if(next.every((id,i)=>id===current[i])&&p.customColumns?.[draggedId]===col)return p;
       return {...p,customOrder:next,customColumns:cols};
      });
    }finally{completeMeasurement();}
   });
  }
 });
};
const requestDeleteLabel=(item:Folder)=>showDialog('Delete label?', 'Maps assigned this label will remain available.',[
  {text:'Cancel',style:'cancel'},
  {text:'Delete',style:'destructive',onPress:()=>{
    const unassign=(list:Note[])=>list.map(note=>hasLabel(note,item.id)?removeLabel(note,item.id):note);
    setNotes(unassign);
    setTrash(previous=>previous.map(batch=>({...batch,notes:unassign(batch.notes)})));
    setFolders(previous=>previous.filter(folder=>folder.id!==item.id));
    if(folderFilter===item.id)setFolderFilter(null);
    setEditingFolderId(null);
  }}
]);

const moveSelection=(folderId:string|null)=>{
  if(!folderId)return;
  const allAssigned=selected.length>0&&selected.every(id=>{const n=notes.find(x=>x.id===id);return n?hasLabel(n,folderId):false;});
  setNotes(ns=>ns.map(n=>selected.includes(n.id)?{...(allAssigned?removeLabel(n,folderId):addLabel(n,folderId)),updatedAt:Date.now()}:n));
};

const exportOne=(kind:ExportFormat,targetId?:string)=>{
  const target=notes.find(n=>n.id===(targetId||current.id))||current;
  setExportSeparate(false);
  setExportTarget(target.id);
  setExportName('');
  setExportKind(kind);
  setMapMenu(false);
  setSelectionMenu(false);
};

const exportSelected=()=>{
  setExportSeparate(false);
  setExportTarget('__selection__');
  setExportName('');
  setExportKind('pdf');
  setSelectionMenu(false);
};

const exportFilename=()=>{
  const target=notes.find(n=>n.id===exportTarget);
  const fallback=exportTarget==='__selection__'
    ?selected.length===1?(notes.find(n=>n.id===selected[0])?.title||'Orbit Notes'):'Selected maps'
    :target?.title||current.title;
  return safeExportName(exportName.trim()||fallback,'pdf');
};

const confirmExport=async()=>{
  if(!exportKind||exportBusy)return;
  const kind=exportKind;
  setExportBusy(true);
  let tempUri:string|undefined;

  try{
    if(exportTarget==='__selection__'&&exportSeparate){
      const roots=notes.filter(n=>selected.includes(n.id));
      if(!roots.length)throw new Error('No maps selected');
      const files:{uri:string;name:string}[]=[];
      try{
        for(const root of roots)files.push({uri:await exportPDF(root,notes,mapPrefs.colors,effectiveTheme),name:root.title});
        const result=await saveMultiplePDFsToAndroid(files);
        const count=result.saved.length;
        if(count)setExportKind(null);
        if(result.failed){
          const saved=count?`Saved: ${result.saved.join(', ')}. `:'';
          showDialog(count?'Some PDFs saved':'Export failed',`${saved}Could not save ${result.failed.name}: ${String(result.failed.error)}`);
        }else if(count)showDialog('PDFs saved',`${count} separate PDF files saved to the selected folder.`);
        else showDialog('Save cancelled','No files were saved.');
      }finally{
        for(const file of files){try{await FileSystem.deleteAsync(file.uri,{idempotent:true});}catch{}}
      }
      return;
    }
    tempUri=exportTarget==='__selection__'
      ?await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes,mapPrefs.colors,effectiveTheme)
      :await exportPDF(notes.find(n=>n.id===exportTarget)||current,notes,mapPrefs.colors,effectiveTheme);

    const finalExportName=exportFilename();
    const destination=await saveExportToAndroid(tempUri,finalExportName,kind);

    if(destination){
      setExportKind(null);
      showDialog(
        'Saved to device',
        `${safeExportName(finalExportName,kind)} was saved to your chosen Android folder.`
      );
    }else{
      showDialog(
        'Save cancelled',
        'No file was saved to external storage.'
      );
    }
  }catch(e){
    showDialog('Export failed',String(e));
  }finally{
    if(tempUri){
      try{
        await FileSystem.deleteAsync(tempUri,{idempotent:true});
      }catch{}
    }
    setExportBusy(false);
  }
};

const runBackup=async()=>{
  if(!backupMode||backupBusy)return;

  if(backupMode==='restore'&&!backupFile){showDialog('Choose a backup','Select a backup file before entering its password.');return;}
  if(backupPassword.length<12){
    showDialog(
      'Password required',
      'Use at least 12 characters. You will need this password to restore your backup.'
    );
    return;
  }

  setBackupBusy(true);
  try{
    if(backupMode==='save'){
      const saved=await saveEncryptedBackup(
        {notes,folders,focused,trash,mapPreferences:mapPrefs},
        backupPassword
      );

      if(saved){
        closeBackup();
        showDialog(
          'Backup saved',
          'Keep your backup password safe. There is no password recovery.'
        );
      }
    }else{
      const restored=await decryptSelectedBackup(backupFile!.uri,backupPassword);
      const restoredTrash=splitDeletedMaps(restored.trash);
      const restoredNotes=normalizeLabels(restored.notes);
      const restoredPreferences=normalizeMapPreferences(restored.mapPreferences);
      if(restoredTrash.length&&!restoredPreferences.trashRetentionAcknowledged){
        restoredPreferences.trashRetentionWarningSeen=false;
      }
      flushPreferencesWrite();
      await saveSnapshot({...restored,notes:restoredNotes,trash:restoredTrash,mapPreferences:restoredPreferences});
      setNotes(restoredNotes);
      setFolders(restored.folders);
      setTrash(restoredTrash);
      setRetentionNotice(restoredTrash.length>0&&!restoredPreferences.trashRetentionAcknowledged);
      setShowArchive(false);setShowTrash(false);
      setFolderFilter(null);setSelected([]);setSelectedTrash([]);closeLibrarySearch();
      clearUndoNotification();setArchiveUndoIds([]);
      setFocused(restored.focused);
      setMapPrefs(restoredPreferences);
      closeBackup();
      setSettings(false);
      showDialog(
        'Restore complete',
        'The local notebook was replaced by the selected backup.'
      );
    }
  }catch(e){
    showDialog('Backup operation failed',String(e));
  }finally{
    setBackupBusy(false);
  }
};

if(storageError){
  return (
    <SafeAreaView style={[
      styles.screen,
      {justifyContent:'center',padding:24,gap:12,backgroundColor:palette.background}
    ]}>
      <StatusBar barStyle={statusBarStyle}/>
      <Text style={[styles.section,{color:palette.text}]}>Unable to open local notebook</Text>
      <Text style={[styles.muted,{color:palette.muted}]}>{storageError}</Text>
      <Text style={[styles.muted,{color:palette.muted}]}>
        Orbit Notes has stopped writes to protect existing data.
        Restart the app after resolving the storage issue.
      </Text>
    </SafeAreaView>
  );
}

if(!loaded){
  return (
    <SafeAreaView style={[styles.screen,{backgroundColor:palette.background}]}>
      <StatusBar barStyle={statusBarStyle}/>
      <Text style={[styles.logo,{color:palette.text}]}>Loading Orbit Notes…</Text>
    </SafeAreaView>
  );
}

if(locked){
  return (
    <PaletteContext.Provider value={palette}>
    <SafeAreaView style={[
      styles.screen,
      {justifyContent:'center',padding:28,gap:18,backgroundColor:palette.background}
    ]}>
      <StatusBar barStyle={statusBarStyle}/>
      <View style={{alignItems:'center',gap:16}}>
        <MaterialIcon name="lockIcon" color={palette.muted}/>
        <Text style={[styles.logo,{color:palette.text}]}>Orbit Notes</Text>
      </View>
      {biometrics&&!credentialFallback?(
        <View style={{alignItems:'center',gap:20}}>
          <Svg width={48} height={48} viewBox="0 0 24 24" accessible={false}>
            <Path d={ANDROID_FINGERPRINT_PATH} fill={effectiveTheme==='dark'?'#B8B8B8':'#303030'}/>
          </Svg>
          <Text style={{color:palette.text,fontSize:19,fontWeight:'600'}}>Unlock with biometrics</Text>
          <Button label="Use biometrics" tertiary onPress={async()=>{
            if(bioPromptInProgress.current)return;
            bioPromptInProgress.current=true;
            try{if(await authenticateBiometric()){setLocked(false);setPinInput('');setCredentialFallback(false);}}
            catch(e){showDialog('Biometric authentication',String(e));}
            finally{bioPromptInProgress.current=false;}
          }}/>
          <Button label={storedCredentialType==='pin'?'Use PIN instead':'Use Password instead'} onPress={()=>{setCredentialFallback(true);setPinInput('');}}/>
        </View>
      ):(
        <>
          <Text style={[styles.section,{color:palette.text,textAlign:'center'}]}>Enter {storedCredentialType==='pin'?'PIN':'Password'}</Text>
          <TextInput
            secureTextEntry
            keyboardType={storedCredentialType==='pin'?'number-pad':'default'}
            autoCapitalize="none" autoCorrect={false}
            value={pinInput}
            onChangeText={setPinInput}
            placeholder={storedCredentialType==='pin'?'Enter PIN':'Enter Password'}
            placeholderTextColor={palette.muted}
            style={[styles.input,{backgroundColor:palette.surface,color:palette.text,borderColor:palette.border}]}
          />
          <Button label="Unlock" tertiary disabled={unlockBusy} onPress={unlock}/>
          {biometrics&&<Button label="Use biometrics" onPress={async()=>{
            setCredentialFallback(false);
            if(bioPromptInProgress.current)return;
            bioPromptInProgress.current=true;
            try{if(await authenticateBiometric()){setLocked(false);setPinInput('');}}
            catch(e){showDialog('Biometric authentication',String(e));}
            finally{bioPromptInProgress.current=false;}
          }}/>}

        </>
      )}
    {renderAppDialog()}
    </SafeAreaView>
    </PaletteContext.Provider>
  );
}
  const showLibrarySearch=!showTrash&&!showArchive&&selected.length===0;
  const showEmptyLabel=!!folderFilter&&!showTrash&&!showArchive&&shown.length===0&&!librarySearch.trim();
  const libraryToolbar=(
<View style={[styles.header,{gap:2}]}>
              {(!showLibrarySearch||!librarySearching)&&<IconButton label={selected.length||showTrash&&selectedTrash.length?'×':'☰'} accessibilityLabel={selected.length||showTrash&&selectedTrash.length?'Clear selection':'Open sidebar'} onPress={()=>{if(showTrash&&selectedTrash.length)setSelectedTrash([]);else if(selected.length)setSelected([]);else setSidebar(v=>!v);}}/>}
              {selected.length>0&&<Text accessibilityLabel={selected.length+' maps selected'} style={{fontSize:18,fontWeight:'600',color:palette.text,minWidth:24}}>{selected.length}</Text>}
              {showTrash?(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
                  <Text style={{color:palette.text,fontSize:21,fontWeight:'600'}}>{selectedTrash.length?selectedTrash.length+' selected':'Deleted'}</Text>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    {selectedTrash.length>0&&<IconButton label="restoreIcon" accessibilityLabel="Restore selected deleted maps" onPress={restoreSelectedTrash}/>}
                    <IconButton label="⋮" accessibilityLabel="Deleted items menu" onPress={()=>setTrashMenu(v=>!v)}/>
                  </View>
                </View>
              ):selected.length===0&&showArchive?(
                <Text style={{flex:1,color:palette.text,fontSize:21,fontWeight:'600'}}>Archive</Text>
              ):showLibrarySearch?(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:palette.control,borderRadius:26,minHeight:48}}>
                  {librarySearching
                    ? <IconButton label="←" accessibilityLabel="Exit search" onPress={closeLibrarySearch}/>
                    : <IconButton label="search" accessibilityLabel="Search maps" color={palette.muted} onPress={()=>librarySearchInput.current?.focus()}/>}
                  <TextInput ref={librarySearchInput} accessibilityLabel="Search all map contents" placeholder="Search Orbit Notes" placeholderTextColor={palette.muted} value={librarySearch} onFocus={()=>{setLibrarySearching(true);setSortMenu(false);}} onChangeText={setLibrarySearch} style={{flex:1,minWidth:20,fontSize:15,color:palette.text,paddingVertical:7}}/>
                  {librarySearching?<IconButton label="×" accessibilityLabel="Clear search" onPress={clearLibrarySearch} disabled={librarySearch.length===0}/>:<>
                    <IconButton label={mapPrefs.viewMode==='grid'?'listView':'gridView'} accessibilityLabel={mapPrefs.viewMode==='grid'?'Switch to list view':'Switch to card view'} onPress={()=>setMapPrefs(p=>({...p,viewMode:p.viewMode==='grid'?'list':'grid'}))}/>
                    <Pressable accessibilityRole="button" accessibilityLabel="Sort maps" accessibilityState={{selected:librarySort!=='custom'}} hitSlop={3} onPress={()=>setSortMenu(v=>!v)} style={{minWidth:42,minHeight:42,justifyContent:'center',alignItems:'center',borderRadius:21,marginRight:10,marginVertical:3,backgroundColor:librarySort==='custom'?'transparent':palette.selection}}>
                      <Svg width={24} height={24} viewBox="0 0 24 24">
                        <Path d="M9.1 12V4m-3.2 3.1 3.2-3.1 3.2 3.1" stroke={palette.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={librarySort==='custom'||sortDirection==='asc'?1:0.28}/>
                        <Path d="M14.9 12v8m-3.2-3.1 3.2 3.1 3.2-3.1" stroke={palette.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={librarySort==='custom'||sortDirection==='desc'?1:0.28}/>
                      </Svg>
                    </Pressable>
                  </>}
                </View>
              ):(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'flex-end'}}>
                  <IconButton label={selected.every(id=>mapPrefs.pinned.includes(id))?'★':'pin'} accessibilityLabel="Pin or unpin selected maps" onPress={()=>{
                    setMapPrefs(p=>{const allPinned=selected.every(id=>p.pinned.includes(id));return {...p,pinned:allPinned?p.pinned.filter(id=>!selected.includes(id)):[...new Set([...p.pinned,...selected])]};});
                    setSelected([]);
                  }}/>
                  <IconButton label="palette" accessibilityLabel="Change selected card colors" onPress={()=>{setColorTarget('cards');}}/>
                  <IconButton label="label" accessibilityLabel="Assign labels to selected maps" onPress={()=>{setLabelQuery('');setMoveFolderMenu(true);}}/>
                  <IconButton label="⋮" accessibilityLabel="More selection actions" onPress={()=>setSelectionMenu(v=>!v)}/>
                </View>
              )}
            </View>
);
return (
  <PaletteContext.Provider value={palette}>
  <SafeAreaProvider>
    <GestureHandlerRootView style={{flex:1}}>
      <SafeAreaView style={[styles.screen,{backgroundColor:palette.canvas}]}>
        <StatusBar barStyle={statusBarStyle}/>

        <View style={[
          styles.header,
          {justifyContent:'space-between'}
        ]}>
          <IconButton
            label="←"
            accessibilityLabel={readOnly?"Back to Deleted":"Back to library"}
            onPress={closeMap}
          />

          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label="Fit" accessibilityLabel="Fit map to screen" onPress={fitCurrentMap} capsule="square"/>
            <IconButton label="parentNote" accessibilityLabel="Go to parent note" onPress={()=>{if(parent)moveTo(parent.id);}} capsule="square"/>
             <IconButton label="centerFocus" accessibilityLabel="Center focused note" onPress={()=>{tx.value=withTiming(-scale.value*(focusPoint?.x||0));ty.value=withTiming(-scale.value*(focusPoint?.y||0));rotation.value=withTiming(0);}} capsule="square"/>
             <IconButton label="miniMapIcon" accessibilityLabel={showMiniMap?"Hide mini-map":"Show mini-map"} onPress={()=>{if(readOnly)updateDeletedPreview(view=>({...view,showMiniMap:!view.showMiniMap}));else setEditableMiniMap(v=>!v);}} capsule="square" active={showMiniMap}/>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,maxHeight:48}} contentContainerStyle={{alignItems:'center',paddingHorizontal:12,gap:4}}>
          {ancestors.filter(n=>n.id!=='root').map((n,i)=><Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Focus ${n.title||'Untitled'}`} onPress={()=>moveTo(n.id)} style={{padding:8}}><Text style={{color:n.id===mapFocus?palette.accent:palette.muted,fontWeight:n.id===mapFocus?'800':'500'}}>{i?'› ':''}{n.title||'Untitled'}</Text></Pressable>)}
        </ScrollView>
        {(nodeActions||mapMenu)&&<Pressable accessibilityLabel="Close menu" onPress={()=>{setNodeActions(null);setMapMenu(false);}} style={[StyleSheet.absoluteFill,{zIndex:20,elevation:10}]}/>}
        {nodeActions&&<View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:8,left:0,right:0}]}>
          <Text style={{fontWeight:'700',color:palette.text}} numberOfLines={2}>{mapNotes.find(n=>n.id===nodeActions)?.title||'Note actions'}</Text>
          <ActionRow label="Read note" icon="readIcon" onPress={()=>{openReader(nodeActions);setNodeActions(null);}}/>
          {!readOnly&&<>
            <ActionRow label="Edit note" icon="✎" onPress={()=>{beginEdit(nodeActions);setNodeActions(null);}}/>
            <ActionRow label="Add child" icon="+" onPress={()=>{addChild(nodeActions);setNodeActions(null);}}/>
            <ActionRow label="Move up a level" icon="upLevel" onPress={()=>{reparent(nodeActions,'up');setNodeActions(null);}}/>
            <ActionRow label="Move down a level" icon="downLevel" onPress={()=>{reparent(nodeActions,'down');setNodeActions(null);}}/>
            {notes.find(n=>n.id===nodeActions)?.parentId==='root'&&!mapPrefs.archived.includes(nodeActions)&&<ActionRow icon="archive" label="Archive map" onPress={()=>{archiveOne(nodeActions,true);setNodeActions(null);setMenu(true);setShowArchive(false);}}/>}
            <ActionRow label="Delete branch" icon="🗑" danger onPress={()=>{removeBranch(nodeActions);setNodeActions(null);}}/>
          </>}
          
        </View>}
        {mapMenu&&(
          <View style={[styles.popup,{top:'auto',bottom:72,right:12,width:181,backgroundColor:palette.tertiarySoft,borderColor:palette.border}]}>
            {!readOnly&&<ActionRow label="Export" icon="exportIcon" onPress={()=>{setMapMenu(false);exportOne('pdf');}}/>}
            {!readOnly&&current.parentId==='root'&&!mapPrefs.archived.includes(current.id)&&<ActionRow icon="archive" label="Archive" onPress={()=>{archiveOne(current.id,true);setMapMenu(false);setMenu(true);setShowArchive(false);}}/>}
            <ActionRow label="Help" icon="helpIcon" onPress={()=>{setGestureHelp(true);setMapMenu(false);}}/>
          </View>
        )}

        <View
          style={[styles.canvas,{backgroundColor:palette.canvas}]}
          onLayout={e=>{
            setCanvasW(e.nativeEvent.layout.width);
            setCanvasH(e.nativeEvent.layout.height);
          }}
        >
          <GestureDetector
            gesture={Gesture.Simultaneous(pan,pinch,rotate)}
          >
            <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Animated.View
              style={[
                styles.world,
                animated,
                {left:centerX,top:centerY}
              ]}
            >
              

              {lines.map(l=>{
                const dx=l.x2-l.x1,dy=l.y2-l.y1;
                const length=Math.hypot(dx,dy);
                return <View key={l.id} pointerEvents="none" style={{position:'absolute',left:(l.x1+l.x2)/2-length/2,top:(l.y1+l.y2)/2-1,width:length,height:2,backgroundColor:palette.connector,transform:[{rotate:`${Math.atan2(dy,dx)}rad`}]}}/>;
              })}
              {visible.map(({note,x,y,level})=>
                node(note,x,y,level)
              )}
              {hiddenIndicators.map(ind=>
                <GestureDetector key={'indicator-'+ind.note.id} gesture={Gesture.Tap().maxDuration(350).onEnd((_e,ok)=>{
                  if(ok)runOnJS(navigateIndicator)(ind.note.id);
                })}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Expand '+(ind.note.title||'child note')}
                    onPress={()=>navigateIndicator(ind.note.id)}
                    style={{position:'absolute',left:ind.x-17,top:ind.y-17,width:34,height:34,
                      alignItems:'center',justifyContent:'center',zIndex:20}}>
                    <View pointerEvents="none" style={{width:22,height:22,borderRadius:11,
                      borderWidth:1.5,borderColor:palette.border,
                      backgroundColor:mapPrefs.colors[ind.note.id]||palette.node}}/>
                  </Pressable>
                </GestureDetector>
              )}

            </Animated.View>
            </View>
          </GestureDetector>

          {!menu&&!readOnly&&<Pressable accessibilityRole="button" accessibilityLabel="Add child note" onPress={()=>{setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:false}}));addChild(focused);}} style={{position:'absolute',right:18,bottom:17,width:58,height:58,borderRadius:19,backgroundColor:mapMenu||exportKind?palette.accent:palette.tertiary,alignItems:'center',justifyContent:'center',elevation:6,zIndex:9}}>
            <Text style={{color:mapMenu||exportKind?palette.onAccent:palette.onTertiary,fontSize:32}}>+</Text>
          </Pressable>}
        </View>

        {!menu&&<View style={{height:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:6}}>
          <View style={{flexDirection:'row',alignItems:'center',backgroundColor:palette.mapControl,borderRadius:24}}>
            <IconButton label="−" accessibilityLabel="Zoom out" targetWidth={mapControlWidth} onPress={()=>adjustZoom(-1)}/>
            <Text accessibilityLabel={`Zoom ${zoomPercent} percent`} style={{fontSize:13,color:palette.text,width:zoomLabelWidth,textAlign:'center'}}>{zoomPercent}%</Text>
            <IconButton label="+" accessibilityLabel="Zoom in" targetWidth={mapControlWidth} onPress={()=>adjustZoom(1)}/>
          </View>
          <IconButton label={showEntireMap?'shrinkAll':'expandAll'} accessibilityLabel={showEntireMap?'Collapse entire map':'Expand entire map'} capsule="circle" targetWidth={mapControlWidth} onPress={toggleEntireMap}/>
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label={mapCollapsed[mapFocus]?'expandBranch':'collapseBranch'} accessibilityLabel={mapCollapsed[mapFocus]?'Expand branch':'Collapse branch'} capsule="circle" targetWidth={mapControlWidth} onPress={()=>updateMapCollapsed(collapsed=>({...collapsed,[mapFocus]:!collapsed[mapFocus]}))}/>
            {!readOnly&&<IconButton label="palette" accessibilityLabel="Node color" capsule="circle" targetWidth={mapControlWidth} onPress={()=>{setColorTarget('node');}}/>}
            <IconButton label="⋮" accessibilityLabel="More map actions" capsule="pill" targetWidth={mapControlWidth} onPress={()=>setMapMenu(v=>!v)}/>
          </View>
        </View>}
          {!menu&&showMiniMap&&<View style={{height:150,marginHorizontal:12,marginBottom:6,backgroundColor:palette.canvas,borderColor:palette.border,borderWidth:1,borderRadius:16,overflow:'hidden',padding:10}}><Text style={[styles.muted,{color:palette.muted}]}>Map overview · {completeMap.length} notes</Text><Animated.View style={miniRotationStyle}><Svg width="100%" height={118} viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet">{miniLines.map(l=><Line key={l.id} x1={l.x1*miniBounds.scale+miniBounds.dx} y1={l.y1*miniBounds.scale+miniBounds.dy} x2={l.x2*miniBounds.scale+miniBounds.dx} y2={l.y2*miniBounds.scale+miniBounds.dy} stroke={palette.connector} strokeWidth={2}/>)}{completeMap.map(v=><Circle key={v.note.id} cx={v.x*miniBounds.scale+miniBounds.dx} cy={v.y*miniBounds.scale+miniBounds.dy} r={v.note.id===mapFocus?5:3.5} fill={v.note.id===mapFocus?palette.accent:palette.muted}/>)}</Svg></Animated.View></View>}

        {!readOnly&&deletionUndo&&(<SwipeUndoNotice message={deletionUndo.kind==='branch'?'Branch deleted':'Moved to Deleted'} onUndo={undoDeletion} onDismiss={clearUndoNotification} bottom={74}/>)}
        <Modal visible={gestureHelp} transparent animationType="fade" onRequestClose={()=>setGestureHelp(false)}>
          <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.35)'}}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss gesture help" onPress={()=>setGestureHelp(false)}/>
            <View style={{backgroundColor:palette.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,maxHeight:'82%'}}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{gap:12,paddingBottom:16}}>
                <Text style={[styles.section,{color:palette.text}]}>Map gestures</Text>
                <Text style={{color:palette.text,fontSize:15,lineHeight:24}}>Tap to focus a node.{"\n"}Double-tap to read.{readOnly?'':'\nTriple-tap to edit.'}{"\n"}{readOnly?'Long-press to show Read note.':'Long-press for note actions.'}{"\n"}Drag around a branch to rotate children.{"\n"}Use two fingers to zoom or rotate the map.</Text>
                <View style={{height:1,backgroundColor:palette.border,marginTop:8,marginBottom:4}}/>
                <Text style={[styles.section,{color:palette.text}]}>Icon Guide</Text>
                {([
                  ['Fit','Fit map','Scale the visible map to fit the screen.'],
                  ['expandBranch','Expand branch','Reveal the children of the focused node.'],
                  ['collapseBranch','Collapse branch','Hide the children of the focused node.'],
                  ['parentNote','Preceding level','Focus the parent of the current node.'],
                  ['centerFocus','Centre focus','Centre the focused node and reset map rotation.'],
                  ['miniMapIcon','Mini-map','Show or hide the map overview.'],
                  ['expandAll','Expand entire map','Reveal all hierarchy levels and fit the whole map.'],
                  ['shrinkAll','Collapse entire map','Restore the default hierarchy display.']
                ] as const).map(([symbol,title,description])=>(
                  <View key={symbol} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:42}}>
                    <View style={{width:30,alignItems:'center'}}><MaterialIcon name={symbol} color={palette.text}/></View>
                    <View style={{flex:1,gap:2}}>
                      <Text style={{color:palette.text,fontSize:15,fontWeight:'600'}}>{title}</Text>
                      <Text style={{color:palette.muted,fontSize:13,lineHeight:19}}>{description}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <Modal
          visible={exportKind!==null}
          transparent
          animationType="fade"
          onRequestClose={()=>{
            if(!exportBusy)setExportKind(null);
          }}
        >
          <View style={{
            flex:1,
            backgroundColor:'rgba(15,23,42,0.5)',
            justifyContent:'center',
            padding:24
          }}>
            <Pressable accessibilityLabel="Close export dialog" onPress={()=>{if(!exportBusy)setExportKind(null);}} style={StyleSheet.absoluteFill}/>
            <View style={{
              backgroundColor:palette.surface,
               padding:22,
               borderRadius:26,
              gap:14
            }}>
              <Text style={[styles.section,{color:palette.text}]}>
                Save {exportKind?.toUpperCase()} to device
              </Text>
              <Text style={[styles.muted,{color:palette.muted}]}>
                Android requires folder access through its system picker when saving files to a chosen folder.
              </Text>
              {exportTarget==='__selection__'&&selected.length>1&&<View style={styles.wrap}>
                <Button label={`${!exportSeparate?'✓ ':''}Single PDF`} onPress={()=>setExportSeparate(false)}/>
                <Button label={`${exportSeparate?'✓ ':''}Separate PDFs`} onPress={()=>setExportSeparate(true)}/>
              </View>}
              {!exportSeparate&&<TextInput
                style={[styles.input,{backgroundColor:palette.surface,borderColor:palette.border,color:palette.text}]}
                value={exportName}
                onChangeText={setExportName}
                editable={!exportBusy}
                maxLength={100}
                autoCapitalize="sentences"
              />}
              <Text style={[styles.muted,{color:palette.muted}]}>
                {exportSeparate?`${selected.length} individual PDF files (named after each map)` :exportFilename()}
              </Text>
              <View style={styles.wrap}>
                <Button
                  label="Cancel"
                  onPress={()=>{
                    if(!exportBusy)setExportKind(null);
                  }}
                />
                <Button
                  label={exportBusy?'Saving…':'Choose folder & save'}
                  tertiary
                  onPress={confirmExport}
                />
              </View>
            </View>
          </View>
        </Modal>


        {settings&&<Modal visible animationType="slide" onRequestClose={()=>settingsBack.current()} >
          <OrbitSettings key="orbit-settings"
            palette={palette}
            appInfoPalette={appInfoPalette}
            themeMode={mapPrefs.themeMode??mapPrefs.theme}
            onTheme={choice=>setMapPrefs(p=>({...p,themeMode:choice,theme:choice==='system'?p.theme:choice}))}
            lockEnabled={pinLockEnabled}
            configured={pinConfigured}
            selectedKind={storedCredentialType}
            biometric={biometrics}
            registerBack={handler=>{settingsBack.current=handler;}}
            appVersion={appInfo.expo.version}
            onClose={()=>setSettings(false)}
            onToggleLock={async enabled=>{await setPinLockEnabled(enabled);setPinLockEnabledState(enabled);if(!enabled)setLocked(false);}}
            onToggleBiometric={async enabled=>{await setBiometricEnabled(enabled);setBiometrics(enabled);}}
            onVerify={async value=>{
              const result=await verifyCredential(value);
              if(result.alreadyBlocked)throw new Error('Too many attempts. Please try later.');
              return result.ok;
            }}
            onSaveCredential={async(value,kind)=>{
              await setPin(value,kind);
              setPinConfigured(true);
              setStoredCredentialType(kind);
              setPinLockEnabledState(true);
              setLocked(false);
            }}
            onResetCredential={async()=>{await removePin();setPinConfigured(false);setPinLockEnabledState(false);setBiometrics(false);setLocked(false);setCredentialFallback(false);}}
            onVerifyBiometric={async()=>{if(!biometrics)return false;bioPromptInProgress.current=true;try{return await authenticateBiometric();}finally{bioPromptInProgress.current=false;}}}
            onBackup={kind=>{closeBackup();setBackupMode(kind);}}
            onLockNow={()=>{bioPrompted.current=false;setCredentialFallback(false);setSettings(false);setLocked(true);}}
          />
        </Modal>}

        <Modal
          visible={backupMode!==null}
          transparent
          animationType="fade"
          onRequestClose={()=>{if(!backupBusy)closeBackup();}}
        >
          <View style={{
            flex:1,
            backgroundColor:'rgba(15,23,42,0.55)',
            justifyContent:'center',
            padding:22
          }}>
            <Pressable accessibilityLabel="Close backup dialog" onPress={()=>{if(!backupBusy)closeBackup();}} style={StyleSheet.absoluteFill}/>
            <View style={{
              backgroundColor:palette.surface,
               padding:20,
               borderRadius:26,
              gap:14
            }}>
              <Text style={[styles.section,{color:palette.text}]}>
                {backupMode==='save'
                  ?'Create encrypted backup'
                  :'Restore encrypted backup'}
              </Text>
              <Text style={[styles.muted,{color:palette.muted}]}>
                {backupMode==='save'
                  ?'Choose an Android folder and keep the password somewhere safe.'
                  :'Select the backup file first. Then enter its password. Restoring will REPLACE the current notebook.'}
              </Text>
              {backupMode==='restore'&&<>
                <Button label={backupFile?'Change backup file':'Select backup file'} disabled={backupBusy} onPress={async()=>{
                  const request=++backupPickerRequest.current;
                  try{
                    const file=await selectBackupFile();
                    if(!file)return;
                    if(request!==backupPickerRequest.current){await discardBackupFile(file.uri);return;}
                    setBackupFile(file);setBackupPassword('');
                  }catch(e){
                    if(request===backupPickerRequest.current)showDialog('Backup selection failed',String(e));
                  }
                }}/>
                {backupFile&&<Text style={[styles.muted,{color:palette.muted}]}>{backupFile.name}</Text>}
              </>}
              {(backupMode==='save'||backupFile!==null)&&<TextInput
                secureTextEntry
                value={backupPassword}
                onChangeText={setBackupPassword}
                placeholder="Backup password (12+ characters)"
                placeholderTextColor={palette.muted}
                style={[styles.input,{backgroundColor:palette.surface,borderColor:palette.border,color:palette.text}]}
                editable={!backupBusy}
              />}
              <View style={styles.wrap}>
                <Button
                  label="Cancel"
                  onPress={()=>{if(!backupBusy)closeBackup();}}
                />
                <Button
                  label={backupBusy
                    ?'Working…'
                    :backupMode==='save'
                      ?'Choose folder & save'
                      :'Restore selected backup'}
                  tertiary
                  onPress={()=>{
                    if(backupMode==='restore'){
                      showDialog(
                        'Replace your notebook?',
                        'This will overwrite all current notes on this device.',
                        [
                          {text:'Cancel',style:'cancel'},
                          {
                            text:'Continue',
                            style:'destructive',
                            onPress:runBackup
                          }
                        ]
                      );
                    }else{
                      runBackup();
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!reader}
          animationType="slide"
          onRequestClose={cancelReader}
        >
          <SafeAreaView style={[styles.screen,{backgroundColor:noteDisplayColor}]}>
            <View style={styles.header}>
              <IconButton label="←" accessibilityLabel="Back to map" color={noteDisplayText} onPress={cancelReader}/>
              <View style={styles.wrap}>
                {editing&&(
                  <Button
                    label="Done"
                    primary
                    onPress={saveEdit}
                  />
                )}
                {!readOnly&&!editing&&<IconButton label="+" accessibilityLabel="Add child note" capsule="tertiaryCircle" onPress={()=>reader&&addChild(reader)}/>}
                {!readOnly&&!editing&&<IconButton label="✎" accessibilityLabel="Edit note" capsule="tertiaryCircle" onPress={()=>reader&&beginEdit(reader)}/>}
                <IconButton label="×" accessibilityLabel={draftChildId===reader?'Discard new child note':'Close note'} capsule={editing?undefined:'tertiaryCircle'} color={editing?noteDisplayText:undefined} onPress={closeReaderWithCross}/>
              </View>
            </View>

            {editing?(
              <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[styles.editor,{backgroundColor:noteDisplayColor}]}>
                <View style={styles.editorField}>
                  <Text style={[styles.editorLabel,{color:palette.muted}]}>Note title</Text>
                  <TextInput
                    accessibilityLabel="Note title"
                    style={[styles.input,{backgroundColor:palette.tertiarySoft,color:palette.tertiaryInk,borderColor:palette.border}]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Heading"
                    placeholderTextColor={palette.tertiaryInk}
                  />
                </View>
                <View style={[styles.editorField,{flex:1}]}>
                  <Text style={[styles.editorLabel,{color:palette.muted}]}>Note content</Text>
                  <RichNoteEditor key={reader||'note'} ref={richEditorRef} initialText={body} onChangeText={setBody} onFormatStateChange={state=>setEditorFormats(previous=>({...previous,...state}))}
                     onReady={()=>setEditorReady(true)} textColor={noteDisplayText} backgroundColor={noteDisplayColor}/>
                </View>
                <View style={{gap:5}}>
                  {formatToolbar&&<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:16,borderWidth:1,borderColor:palette.border,backgroundColor:palette.surface,paddingHorizontal:2}}>
                    <IconButton label="bold" disabled={!editorReady} active={editorFormats.bold} accessibilityLabel="Bold text" onPress={()=>applyNoteFormat('bold')}/>
                    <IconButton label="italic" disabled={!editorReady} active={editorFormats.italic} accessibilityLabel="Italic text" onPress={()=>applyNoteFormat('italic')}/>
                    <IconButton label="underline" disabled={!editorReady} active={editorFormats.underline} accessibilityLabel="Underline text" onPress={()=>applyNoteFormat('underline')}/>
                    <IconButton label="clearFormat" disabled={!editorReady} accessibilityLabel="Remove formatting" onPress={()=>applyNoteFormat('clear')}/>
                    <IconButton label="×" accessibilityLabel="Close formatting toolbar" onPress={()=>setFormatToolbar(false)}/>
                  </View>}
                  <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
                    <IconButton label="undo" disabled={!editorReady||!editorFormats.canUndo} accessibilityLabel="Undo note edit" onPress={()=>richEditorRef.current?.format('undo')}/>
                    <IconButton label="redo" disabled={!editorReady||!editorFormats.canRedo} accessibilityLabel="Redo note edit" onPress={()=>richEditorRef.current?.format('redo')}/>
                    <IconButton label="format" disabled={!editorReady} active={formatToolbar} accessibilityLabel="Text formatting" onPress={()=>setFormatToolbar(true)}/>
                    <IconButton label="bullets" disabled={!editorReady} active={editorFormats.bullets} accessibilityLabel="Bulleted list" onPress={()=>applyNoteFormat('bullets')}/>
                    <IconButton label="numbers" disabled={!editorReady} active={editorFormats.numbers} accessibilityLabel="Numbered list" onPress={()=>applyNoteFormat('numbers')}/>
                    <IconButton label="palette" accessibilityLabel="Note color" onPress={()=>{setColorTarget('note');}}/>
                  </View>
                </View>
              </KeyboardAvoidingView>
            ):(
              <ScrollView contentContainerStyle={[styles.editor,{backgroundColor:noteDisplayColor}]}>
                <Pressable onPress={readOnly?undefined:()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  <Text style={[styles.readerTitle,{color:noteDisplayText}]}>{activeReader?.title}</Text>
                </Pressable>
                <Pressable onPress={readOnly?undefined:()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  {activeReader?.body?<View style={{marginVertical:15,gap:3}}>{noteBodyView(activeReader.body)}</View>:<Text style={[styles.readBody,{color:palette.muted}]}>This note is empty.</Text>}
                </Pressable>
                 

              </ScrollView>
            )}
          </SafeAreaView>
        </Modal> 
        
        

        <Modal
          visible={menu}
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={()=>handleLibraryBack()}
        >
          <GestureHandlerRootView style={{flex:1}}><InsetSafeAreaView style={[styles.screen,{backgroundColor:palette.background}]} edges={['top']}>
            {showTrash&&libraryToolbar}
             {!showTrash&&selected.length>0&&<View style={{position:'absolute',top:Math.max(StatusBar.currentHeight||24,24),left:0,right:0,zIndex:12,backgroundColor:palette.background}}>{libraryToolbar}</View>}

            {(selectionMenu||moveFolderMenu||sidebar||sortMenu||trashMenu||cardMenuId)&&<Pressable accessibilityLabel="Close menu" onPress={()=>{setSelectionMenu(false);setMoveFolderMenu(false);setSidebar(false);setSortMenu(false);setTrashMenu(false);setCardMenuId(null);}} style={[StyleSheet.absoluteFill,{zIndex:20,elevation:10,backgroundColor:sidebar?'rgba(0,0,0,0.32)':'transparent'}]}/>}
            {cardMenuId&&<View style={{position:'absolute',top:cardMenuPosition.top,left:cardMenuPosition.left,zIndex:34,elevation:22,width:176,borderRadius:15,padding:6,backgroundColor:palette.tertiarySoft,borderWidth:1,borderColor:palette.border}}>
              <ActionRow label={mapPrefs.pinned.includes(cardMenuId)?'Unpin':'Pin'} icon="pin" onPress={()=>{
                const target=cardMenuId!;setMapPrefs(p=>({...p,pinned:p.pinned.includes(target)?p.pinned.filter(item=>item!==target):[...p.pinned,target]}));setCardMenuId(null);
              }}/>
              <ActionRow label="Labels" icon="label" onPress={()=>{setSelected([cardMenuId!]);setCardMenuId(null);setLabelQuery('');setMoveFolderMenu(true);}}/>
              <ActionRow label="Color" icon="palette" onPress={()=>{setSelected([cardMenuId!]);setCardMenuId(null);setColorTarget('cards');}}/>
              <ActionRow label={showArchive?'Unarchive':'Archive'} icon={showArchive?'unarchive':'archive'} onPress={()=>{archiveOne(cardMenuId!,!showArchive);setCardMenuId(null);}}/>
              <ActionRow label="Export PDF" icon="exportIcon" onPress={()=>{exportOne('pdf',cardMenuId!);setCardMenuId(null);}}/>
              <View style={{height:1,backgroundColor:palette.border,marginVertical:3}}/>
              <ActionRow label="Delete" icon="🗑" danger onPress={()=>{removeBranch(cardMenuId!);setCardMenuId(null);}}/>
            </View>}
            {trashMenu&&showTrash&&<View style={[styles.popup,{backgroundColor:palette.tertiarySoft,borderColor:palette.border,top:56,right:12,zIndex:32,paddingVertical:6,minWidth:220}]}>
              <ActionRow label={selectedTrash.length?'Delete forever':'Empty bin'} icon="🗑" danger onPress={()=>{setTrashMenu(false);if(selectedTrash.length)removeSelectedTrash();else if(trash.length)showDialog('Empty Deleted?','Permanently delete all items in Deleted?',[
                {text:'Cancel',style:'cancel'},
                {text:'Empty Deleted',style:'destructive',onPress:()=>{setTrash([]);setSelectedTrash([]);}}
              ]);}}/>
            </View>}
            {selectionMenu&&selected.length>0&&(
              <View style={[styles.popup,{top:64,right:12,left:undefined,bottom:undefined,width:225,backgroundColor:palette.tertiarySoft,borderColor:palette.border,zIndex:32}]}>
                <ActionRow icon={showArchive?'unarchive':'archive'} label={showArchive?'Unarchive':'Archive'} onPress={()=>archiveSelection(!showArchive)}/>
                <ActionRow label="Export" icon="exportIcon" onPress={()=>{setSelectionMenu(false);exportSelected();}}/>
                <View style={{height:1,backgroundColor:palette.border,marginVertical:4}}/>
                <ActionRow label="Delete" icon="🗑" danger onPress={()=>{setSelectionMenu(false);deleteSelected();}}/>
              </View>
            )}

                        {sortMenu&&<View style={[styles.bottomSheet,{left:0,right:0,bottom:0,borderRadius:0,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:palette.surface,borderColor:palette.border,padding:16,gap:4}]}>
              <Text style={{fontSize:18,fontWeight:'600',color:palette.text,paddingVertical:10}}>Sort by</Text>
              {(['custom','created','modified','title'] as const).map(option=>(
                <Pressable key={option} accessibilityRole="button" accessibilityState={{selected:librarySort===option}}
                  accessibilityLabel={option==='custom'?'Custom sort':option==='created'?'Date created':option==='modified'?'Date modified':'Title'}
                  onPress={()=>{if(librarySort===option&&option!=='custom')toggleLibraryDirection();else setLibrarySort(option);setSortMenu(false);}}
                  style={{minHeight:52,flexDirection:'row',alignItems:'center',paddingHorizontal:12}}>
                  <View style={{width:30,alignItems:'flex-start'}}>
                    {librarySort===option&&(option==='custom'
                      ?<MaterialIcon name="✓" color={palette.text}/>
                      :<Svg width={22} height={22} viewBox="0 0 24 24"><Path d={sortDirection==='desc'?'M12 4v16m-6-6 6 6 6-6':'M12 20V4m-6 6 6-6 6 6'} stroke={palette.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/></Svg>)}
                  </View>
                  <Text style={{color:palette.text,fontSize:16}}>{option==='custom'?'Custom':option==='created'?'Date created':option==='modified'?'Date modified':'Title'}</Text>
                </Pressable>
              ))}
            </View>}
            <Modal visible={moveFolderMenu} animationType="slide" onRequestClose={()=>{setMoveFolderMenu(false);setLabelQuery('');}}>
              <InsetSafeAreaView edges={['top','bottom']} style={[styles.screen,{backgroundColor:palette.background}]}>
                <View style={{minHeight:74,flexDirection:'row',alignItems:'center',paddingHorizontal:10,gap:4}}>
                  <IconButton label="←" accessibilityLabel="Back to selected maps" onPress={()=>{setMoveFolderMenu(false);setLabelQuery('');Keyboard.dismiss();}}/>
                  <TextInput accessibilityLabel="Search or create labels" value={labelQuery} onChangeText={setLabelQuery} placeholder="Enter label name" placeholderTextColor={palette.muted} autoCapitalize="sentences"
                    returnKeyType="done" onSubmitEditing={()=>{
                      const name=labelQuery.trim();if(!name||folders.some(f=>f.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return;
                      const newId=id();setFolders(fs=>[...fs,{id:newId,name}]);setNotes(ns=>ns.map(note=>selected.includes(note.id)?{...addLabel(note,newId),updatedAt:Date.now()}:note));setLabelQuery('');Keyboard.dismiss();
                    }}
                    style={{flex:1,fontSize:17,color:palette.text,paddingVertical:10,paddingHorizontal:8}}/>
                  {labelQuery.length>0&&<IconButton label="×" accessibilityLabel="Clear label search" onPress={()=>setLabelQuery('')}/>}
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:40}}>
                  {folders.filter(f=>f.name.toLocaleLowerCase().includes(labelQuery.trim().toLocaleLowerCase())).map(f=>{
                    const all=selected.length>0&&selected.every(target=>{const note=notes.find(n=>n.id===target);return note?hasLabel(note,f.id):false;});
                    const some=selected.some(target=>{const note=notes.find(n=>n.id===target);return note?hasLabel(note,f.id):false;});
                    return <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{checked:all}} accessibilityLabel={'Assign label '+f.name} onPress={()=>moveSelection(f.id)}
                      style={{minHeight:64,flexDirection:'row',alignItems:'center',gap:22,paddingHorizontal:20}}>
                      <MaterialIcon name="label" color={palette.tertiaryInk} fillLabel/>
                      <Text style={{flex:1,fontSize:17,color:palette.text}}>{f.name}</Text>
                      <View style={{width:23,height:23,borderRadius:3,borderWidth:2.1,borderColor:all||some?palette.accent:palette.muted,backgroundColor:all?palette.accent:'transparent',alignItems:'center',justifyContent:'center'}}>
                        {all?<Svg width={17} height={17} viewBox="0 0 24 24"><Path d="M4 12l5 5L20 6" fill="none" stroke={palette.onAccent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></Svg>:some?<View style={{width:11,height:3,backgroundColor:palette.accent,borderRadius:1}}/>:null}
                      </View>
                    </Pressable>;
                  })}
                  {labelQuery.trim().length>0&&!folders.some(f=>f.name.toLocaleLowerCase()===labelQuery.trim().toLocaleLowerCase())&&
                    <Pressable accessibilityRole="button" accessibilityLabel={'Create and assign label '+labelQuery.trim()} onPress={()=>{
                      const name=labelQuery.trim();if(!name)return;
                      const newId=id();setFolders(fs=>[...fs,{id:newId,name}]);setNotes(ns=>ns.map(note=>selected.includes(note.id)?{...addLabel(note,newId),updatedAt:Date.now()}:note));setLabelQuery('');Keyboard.dismiss();
                    }} style={{minHeight:60,flexDirection:'row',alignItems:'center',gap:20,paddingHorizontal:20}}>
                      <MaterialIcon name="+" color={palette.accent}/>
                      <Text style={{color:palette.text,fontSize:16}}>Create “{labelQuery.trim()}”</Text>
                    </Pressable>}
                </ScrollView>
              </InsetSafeAreaView>
            </Modal>

            {sidebar&&(
              <GestureDetector gesture={Gesture.Pan().activeOffsetX([-40,40]).onEnd(e=>{if(e.translationX<-55)runOnJS(setSidebar)(false);})}>
              <Animated.View entering={FadeInLeft.duration(220)} exiting={FadeOutLeft.duration(160)} style={[styles.sidebar,{backgroundColor:palette.surface,borderRightColor:palette.border}]}>
                <View style={[styles.header,{paddingTop:Math.max(StatusBar.currentHeight||24,24),minHeight:88}]}>
                   <Text style={[styles.section,{color:palette.text}]}>
                     Orbit Notes
                  </Text>
                </View>
                <ScrollView contentContainerStyle={{
                  padding:12,
                  gap:10
                }}>

                  <Pressable accessibilityRole="button" accessibilityLabel="Maps" onPress={()=>{setFolderFilter(null);setShowTrash(false);setShowArchive(false);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:!showArchive&&!showTrash&&!folderFilter?selectedSidebarColor:'transparent'}}>
                    <MaterialIcon name="allMaps" color={!showArchive&&!showTrash&&!folderFilter?selectedSidebarText:palette.text}/><Text style={{color:!showArchive&&!showTrash&&!folderFilter?selectedSidebarText:palette.text}}>Maps</Text>
                  </Pressable>
                  {folders.length>0&&<>
                    <View style={{height:1,backgroundColor:palette.border,marginVertical:5}}/>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12}}>
                      <Text style={{color:palette.muted,fontWeight:'600'}}>Labels</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Edit labels" onPress={()=>{setLabelManager(true);setSidebar(false);}} style={{padding:8}}><Text style={{color:palette.accent,fontWeight:'600'}}>Edit</Text></Pressable>
                    </View>
                    {folders.map(item=>(
                      <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Filter '+item.name} onPress={()=>{setFolderFilter(item.id);setShowTrash(false);setShowArchive(false);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:folderFilter===item.id?selectedSidebarColor:'transparent'}}>
                        <MaterialIcon name="label" color={folderFilter===item.id?selectedSidebarText:palette.text}/>
                        <Text style={{color:folderFilter===item.id?selectedSidebarText:palette.text,flex:1}}>{item.name}</Text>
                      </Pressable>
                    ))}
                  </>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Create new label" onPress={()=>{setEditingFolderId(null);setFolderName('');setCreatingFolder(true);setLabelManager(true);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',padding:12,gap:14}}>
                    <MaterialIcon name="+" color={palette.text}/><Text style={{color:palette.text}}>Create new label</Text>
                  </Pressable>
                  {folders.length>0&&<View style={{height:1,backgroundColor:palette.border,marginVertical:5}}/>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Archive" onPress={()=>{setShowArchive(true);setShowTrash(false);setFolderFilter(null);setSelected([]);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:showArchive?selectedSidebarColor:'transparent'}}>
                    <MaterialIcon name="archive" color={showArchive?selectedSidebarText:palette.text}/><Text style={{color:showArchive?selectedSidebarText:palette.text}}>Archive</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Deleted" onPress={()=>{setShowTrash(true);setShowArchive(false);setFolderFilter(null);setSelectedTrash([]);setSelected([]);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:showTrash?selectedSidebarColor:'transparent'}}>
                    <MaterialIcon name="🗑" color={showTrash?selectedSidebarText:palette.text}/><Text style={{color:showTrash?selectedSidebarText:palette.text}}>Deleted</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={()=>{setSettings(true);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12}}>
                    <MaterialIcon name="settingsIcon" color={palette.text}/><Text style={{color:palette.text}}>Settings</Text>
                  </Pressable>
                </ScrollView>
              </Animated.View>
              </GestureDetector>
            )}

            <Modal visible={labelManager} animationType="slide" onRequestClose={()=>{setLabelManager(false);setEditingFolderId(null);setCreatingFolder(false);}}>
              <SafeAreaView style={[styles.screen,{backgroundColor:palette.background,padding:18}]}>
                <View style={[styles.header,{paddingHorizontal:0}]}>
                  <Text style={[styles.section,{color:palette.text}]}>Edit labels</Text>
                  <IconButton label="×" accessibilityLabel="Close label editor" onPress={()=>{setLabelManager(false);setEditingFolderId(null);setCreatingFolder(false);}}/>
                </View>
                <ScrollView contentContainerStyle={{gap:4}}>
                  {creatingFolder?(
                    <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:8,minHeight:56,borderRadius:28,backgroundColor:palette.tertiarySoft}}>
                      <IconButton label="×" accessibilityLabel="Cancel new label" color={palette.tertiaryInk} onPress={()=>{setCreatingFolder(false);setFolderName('');}}/>
                      <TextInput accessibilityLabel="New label name" autoFocus value={folderName} onChangeText={setFolderName} placeholder="Label name" placeholderTextColor={palette.tertiaryInk} style={{flex:1,borderBottomWidth:1,borderBottomColor:palette.tertiaryInk,color:palette.tertiaryInk,fontSize:16}}/>
                      <IconButton label="✓" accessibilityLabel="Create label" color={palette.tertiaryInk} onPress={()=>{
                        const nextName=folderName.trim();if(!nextName)return;
                        const newId=id();setFolders(fs=>[...fs,{id:newId,name:nextName}]);
                        if(selected.length)setNotes(ns=>ns.map(note=>selected.includes(note.id)?{...addLabel(note,newId),updatedAt:Date.now()}:note));
                        setCreatingFolder(false);setFolderName('');setLabelManager(false);
                      }}/>
                    </View>
                  ):(
                    <Pressable accessibilityRole="button" accessibilityLabel="Create new label" style={{flexDirection:'row',alignItems:'center',padding:12,gap:16,minHeight:48,borderRadius:28,backgroundColor:palette.tertiarySoft}} onPress={()=>{setEditingFolderId(null);setFolderName('');setCreatingFolder(true);}}>
                      <MaterialIcon name="+" color={palette.tertiaryInk}/><Text style={{color:palette.tertiaryInk,fontSize:16}}>Create new label</Text>
                    </Pressable>
                  )}
                  {folders.map(item=>(
                    <View key={item.id} style={{flexDirection:'row',alignItems:'center',gap:10,padding:8,minHeight:56,backgroundColor:editingFolderId===item.id?palette.control:'transparent'}}>
                      {editingFolderId===item.id?(
                        <>
                          <IconButton label="🗑" accessibilityLabel={'Delete label '+item.name} danger onPress={()=>requestDeleteLabel(item)}/>
                          <TextInput accessibilityLabel="Rename label" value={folderName} onChangeText={setFolderName} autoFocus style={{flex:1,borderBottomWidth:1,borderBottomColor:palette.accent,color:palette.text,fontSize:16}}/>
                          <IconButton label="✓" accessibilityLabel="Save label name" onPress={()=>{if(folderName.trim())setFolders(fs=>fs.map(x=>x.id===item.id?{...x,name:folderName.trim()}:x));setEditingFolderId(null);}}/>
                        </>
                      ):(
                        <>
                          <IconButton label="🗑" accessibilityLabel={'Delete label '+item.name} danger onPress={()=>requestDeleteLabel(item)}/>
                          <Text style={{flex:1,color:palette.text,fontSize:16}}>{item.name}</Text>
                          <IconButton label="✎" accessibilityLabel={'Edit label '+item.name} onPress={()=>{setEditingFolderId(item.id);setFolderName(item.name);}}/>
                        </>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </SafeAreaView>
            </Modal>
            <View style={{flex:1}}>
              {showTrash?(
                <ScrollView contentContainerStyle={{padding:12}} contentOffset={deletedListOffset.current}
                  scrollEventThrottle={32} onScroll={e=>{deletedScrollY.current=e.nativeEvent.contentOffset.y;}}>
                  <View style={{width:'100%',gap:12,padding:8}}>
                  {!mapPrefs.trashRetentionAcknowledged&&trash.length>0&&(
                    <View style={{gap:8,padding:12,borderColor:palette.border,borderWidth:1,borderRadius:14}}>
                      <Text style={{color:palette.text}}>Review existing deleted items before activating the seven-day retention policy.</Text>
                      <Button label="Apply seven-day retention" onPress={acknowledgeTrashRetention}/>
                    </View>
                  )}
                  {trash.length===0?(
                    <View style={{alignItems:'center',justifyContent:'center',paddingVertical:96,gap:12,width:'100%'}}>
                      <Svg width={112} height={112} viewBox="0 0 112 112"><Path d="M28 30h56M42 20h28M34 30l4 63h36l4-63M48 44v36M64 44v36" stroke={palette.tertiaryInk} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>
                      <Text style={{color:palette.muted,fontSize:16,textAlign:'center'}}>No notes in Deleted</Text>
                    </View>
                  ):<View style={{flexDirection:mapPrefs.viewMode==='grid'?'row':'column',flexWrap:mapPrefs.viewMode==='grid'?'wrap':'nowrap',gap:10,justifyContent:'space-between'}}>{trash.map(batch=>{
                    const card=cardAppearance(batch.notes[0]?.id);
                    return (
                    <Pressable key={batch.id} accessibilityRole="button" accessibilityLabel={'Open deleted map '+(batch.notes[0]?.title||'Untitled')} accessibilityHint="Tap for read-only preview; long press to select"
                      onPress={()=>{if(selectedTrash.length)setSelectedTrash(v=>v.includes(batch.id)?v.filter(x=>x!==batch.id):[...v,batch.id]);else openDeletedMap(batch);}}
                      onLongPress={()=>setSelectedTrash(v=>v.includes(batch.id)?v:[...v,batch.id])}
                      style={[styles.listRow,{width:mapPrefs.viewMode==='grid'?'48.2%':'100%',minHeight:mapPrefs.viewMode==='grid'?110:66,backgroundColor:card.backgroundColor,borderColor:selectedTrash.includes(batch.id)?(trashMenu?palette.accent:palette.tertiaryInk):palette.border,borderWidth:selectedTrash.includes(batch.id)?3:1},mapPrefs.viewMode==='grid'&&{alignItems:'stretch',flexDirection:'column',padding:10}]}>
                      <View style={{flex:1,width:'100%'}}>
                        <Text numberOfLines={2} style={[styles.listTitle,{color:card.color}]}>{batch.notes[0]?.title||'Untitled map'}</Text>
                        {mapPrefs.viewMode==='grid'&&<View style={{overflow:'hidden',borderRadius:10}}>{mapPreview(batch.notes.find(n=>n.parentId==='root')||batch.notes[0],batch.notes)}</View>}
                        {labelIds(batch.notes[0]).length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:7}}>{labelIds(batch.notes[0]).map(labelId=>{const label=folders.find(f=>f.id===labelId)?.name;const chip=card.chip;return label?<View key={labelId} style={{...chip,borderWidth:1,borderRadius:8,paddingHorizontal:9,paddingVertical:4}}><Text style={{color:chip.color,fontSize:11}}>{label}</Text></View>:null;})}</View>}
                      </View>
                    </Pressable>
                  );})}</View>}
                </View></ScrollView>
              ):(
                <View style={{flex:1}}>
                  <FlatList ref={libraryListRef} style={{flex:1}} contentContainerStyle={{gap:10,paddingHorizontal:12,paddingTop:0,paddingBottom:64}}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={32}
                    onScroll={e=>{libraryScrollOffset.current=e.nativeEvent.contentOffset.y;}}
                    ListHeaderComponent={<View style={{opacity:selected.length>0?0:1}}>{libraryToolbar}</View>}
                    data={libraryChunks} extraData={libraryCardHeights} keyExtractor={(_,index)=>'chunk-'+index}
                    initialNumToRender={2} maxToRenderPerBatch={2} windowSize={5} removeClippedSubviews={false}
                    renderItem={({item:chunk,index:chunkIndex})=>{
                     const grid=mapPrefs.viewMode==='grid';
                     const availableWidth=W-24;
                     const gutter=10;
                     const cellWidth=grid?(availableWidth-gutter)/2:availableWidth;
                     // Each label has its own masonry columns. Never reuse All Maps custom
                     // column assignments for a filtered label.
                     const labelColumns=folderFilter?(labelColumnRefs.current[folderFilter]??(labelColumnRefs.current[folderFilter]={})):null;
                     const activeColumns=showArchive?archiveColumnRef.current:labelColumns||layoutColumnRef.current;
                     const positions=balancedLibraryPositions(chunk,libraryCardHeights,grid,activeColumns,showArchive||folderFilter?{}:(mapPrefs.customColumns||{}))
                       .map(({item,column,top})=>({n:item,column,top}));
                     positions.forEach(({n,column})=>{activeColumns[n.id]=column;});
                     const columns=[0,0];
                     positions.forEach(({n,column,top})=>{columns[column]=Math.max(columns[column],top+(libraryCardHeights[n.id]??(grid?152:88))+gutter);});
                     const chunkHeight=Math.max(0,...columns)-gutter;
                     return <View style={{height:Math.max(0,chunkHeight),width:'100%',position:'relative'}}>
                      {positions.map(({n,column,top})=>{
                    const card=cardAppearance(n.id);
                    return (
                    <LibraryGestureCard key={n.id}
                      position={{top:dragOrigin?.id===n.id&&dragOrigin.chunk===chunkIndex?dragOrigin.top:top,left:dragOrigin?.id===n.id&&dragOrigin.chunk===chunkIndex?dragOrigin.left:column*(cellWidth+gutter),width:cellWidth}}
                      onMeasure={height=>recordCardHeight(n.id,height)} canSwipe={!showArchive&&selected.length===0} canDrag={librarySort==='custom'&&!showArchive&&(selected.length===0||(selected.length===1&&selected.includes(n.id)))}
                      registerRef={view=>{libraryCardRefs.current[n.id]=view;}}
                      onArchive={()=>archiveOne(n.id,true)}
                      onSelect={()=>setSelected(v=>v.includes(n.id)?v:[...v,n.id])}
                      onDragStart={()=>{dragSession.current++;pendingDrop.current=null;lastDragTarget.current=null;setSelected([]);setSelectionMenu(false);setDragOrigin({id:n.id,top,left:column*(cellWidth+gutter),chunk:chunkIndex});}}
                      onDragMove={(dx,dy)=>{
                        reorderCard(n.id,dx,dy);
                        libraryCardRefs.current[n.id]?.measureInWindow((_x,y,_w,h)=>{
                          const fingerY=y+dy+h/2;
                          if(fingerY>H-135)libraryListRef.current?.scrollToOffset({offset:libraryScrollOffset.current+24,animated:true});
                          else if(fingerY<130)libraryListRef.current?.scrollToOffset({offset:Math.max(0,libraryScrollOffset.current-24),animated:true});
                        });
                      }}
                      onDrop={(dx,dy)=>reorderCard(n.id,dx,dy,true)}
                      onDragCancel={finishDrag}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${n.title||'Untitled map'}${mapPrefs.pinned.includes(n.id)?', pinned':''}${selected.includes(n.id)?', selected':''}`}
                      accessibilityHint={showArchive?'Tap to open; long press to select':
                        librarySort==='custom'?'Tap to open; long press to select or drag to reorder; swipe to archive':'Tap to open; long press to select; swipe to archive'}
                      style={[styles.listRow,{backgroundColor:card.backgroundColor,borderColor:selected.includes(n.id)?(selectionMenu?palette.accent:palette.tertiaryInk):palette.border,borderWidth:selected.includes(n.id)?3:1},mapPrefs.viewMode==='grid'&&{width:'100%',alignItems:'stretch',flexDirection:'column',padding:10}]}
                      onPress={()=>{
                        if(selected.length){
                          setSelected(v=>
                            v.includes(n.id)
                              ?v.filter(x=>x!==n.id)
                              :[...v,n.id]
                          );
                        }else{
                          setFocused(n.id);
                          tx.value=withTiming(0);
                          ty.value=withTiming(0);
                          scale.value=withTiming(preferredFit*1.1);
                          setMenu(false);
                          setSidebar(false);
                        }
                      }}
                      onLongPress={()=>
                        (showArchive||librarySort!=='custom')&&setSelected(v=>
                          v.includes(n.id)
                            ?v
                            :[...v,n.id]
                        )
                      }
                    >
                      <View style={{flex:1,width:'100%'}}>
                        <Text style={[styles.listTitle,{color:card.color,paddingRight:mapPrefs.pinned.includes(n.id)?80:43}]} numberOfLines={2}>{n.title||'Untitled map'}</Text>
                        {mapPrefs.viewMode==='grid'&&mapPreview(n)}
                         {labelIds(n).length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:7}}>
                         {labelIds(n).map(labelId=>{const name=folders.find(f=>f.id===labelId)?.name;return name?<View key={labelId} style={{...card.chip,borderWidth:1,borderRadius:8,paddingVertical:4,paddingHorizontal:9}}><Text style={{color:card.chip.color,fontSize:11}}>{name}</Text></View>:null;})}
                       </View>}
 
                      </View>

                      {selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel={'More actions for '+(n.title||'Untitled map')} onPress={event=>{
                        event.stopPropagation();
                        setCardMenuPosition({top:Math.max(64,Math.min(H-345,event.nativeEvent.pageY+7)),left:Math.max(8,Math.min(W-185,event.nativeEvent.pageX-162))});
                        setCardMenuId(n.id);
                      }} style={{position:'absolute',right:5,top:4,width:37,height:37,alignItems:'center',justifyContent:'center',zIndex:4}}>
                        <MaterialIcon name="⋮" color={card.color}/>
                      </Pressable>}
                      {selected.length===0&&mapPrefs.pinned.includes(n.id)&&
                        <Pressable accessibilityRole="button" accessibilityLabel="Unpin map" onPress={()=>setMapPrefs(p=>({...p,pinned:p.pinned.filter(x=>x!==n.id)}))}
                          hitSlop={8} style={{position:'absolute',right:47,top:7,width:34,height:34,alignItems:'center',justifyContent:'center',zIndex:2}}>
                          <Svg width={21} height={21} viewBox="0 0 24 24">
                            <Path d="M8 3h8v2l-1.5 2.3v4.1l3.2 3V16H6.3v-1.6l3.2-3V7.3L8 5V3z" fill={palette.accent}/>
                            <Path d="M12 16v6" stroke={palette.accent} strokeWidth={2} strokeLinecap="round"/>
                          </Svg>
                        </Pressable>}

                    </Pressable>
                    </LibraryGestureCard>
                    );})}
                     </View>;
                    }}/>

                  {shown.length===0&&!showArchive&&!showEmptyLabel&&(
                    <View style={{position:'absolute',left:0,right:0,top:44,alignItems:'center',paddingVertical:48,paddingHorizontal:20,gap:12}}>
                      <MaterialIcon name="label" color={palette.muted}/>
                      <Text style={[styles.listTitle,{textAlign:'center',color:palette.text,fontWeight:'600'}]}>{librarySearch.trim()?'No matching maps':'Your library is ready'}</Text>
                      <Text style={[styles.muted,{color:palette.muted,textAlign:'center'}]}>{librarySearch.trim()?'No maps match this search. Try different words or clear the search.':'Create your first map to start building your notes.'}</Text>
                      {librarySearch.trim()?<Button label="Clear search" onPress={clearLibrarySearch}/>:<Button label="Create map" primary onPress={newMap}/>}
                    </View>
                  )}
                </View>
              )}
            </View>
            {(showEmptyLabel||showArchive&&shown.length===0&&!showTrash)&&<View pointerEvents="box-none" style={{position:'absolute',left:0,right:0,top:96,bottom:showEmptyLabel?60:0,alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
              {showEmptyLabel?(
                <Svg width={116} height={92} viewBox="0 0 24 24" preserveAspectRatio="none" accessible={false}>
                  <Path d={ICON_PATHS.label} stroke={palette.tertiaryInk} fill="none" strokeWidth={0.85} strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              ):(
                <Svg width={116} height={116} viewBox="0 0 24 24" accessibilityLabel="Empty Archive illustration"><Path d={ICON_PATHS.archive} stroke={palette.tertiaryInk} fill="none" strokeWidth={0.85} strokeLinecap="round" strokeLinejoin="round"/></Svg>
              )}
              <Text style={{color:palette.muted,fontSize:16,fontWeight:'500',textAlign:'center',marginTop:14}}>{showEmptyLabel?'No maps in this label':librarySearch.trim()?'No matching maps':'Your archived maps appear here'}</Text>
            </View>}
            {!showTrash&&!showArchive&&selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel="Create new map" onPress={newMap} style={{position:'absolute',right:22,bottom:48,width:60,height:60,borderRadius:20,backgroundColor:sidebar?palette.accent:palette.tertiary,alignItems:'center',justifyContent:'center',elevation:5,zIndex:10}}>
              <Text style={{fontSize:32,color:sidebar?palette.onAccent:palette.onTertiary}}>+</Text>
            </Pressable>}
          {deletionUndo&&(
            <SwipeUndoNotice message={deletionUndo.kind==='branch'?'Branch deleted':'Moved to Deleted'} onUndo={undoDeletion} onDismiss={clearUndoNotification} bottom={archiveUndoIds.length?150:90}/>
          )}
          {archiveUndoIds.length>0&&(
            <SwipeUndoNotice message={archiveUndoIds.length===1?'Map archived':archiveUndoIds.length+' maps archived'} onUndo={undoArchive} onDismiss={()=>setArchiveUndoIds([])}/>
          )}
          </InsetSafeAreaView></GestureHandlerRootView>
        </Modal>
        <Modal visible={retentionNotice} transparent animationType="fade" onRequestClose={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));}}>
          <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.55)'}}>
            <View style={{backgroundColor:palette.surface,padding:22,borderRadius:24,gap:16}}>
              <Text style={[styles.section,{color:palette.text}]}>Deleted policy update</Text>
              <Text style={{color:palette.text}}>Deleted notes will be kept for seven days. Existing deleted notes older than seven days may be removed permanently after you activate the policy. Review and restore important notes first.</Text>
              <Button label="Review Deleted" tertiary onPress={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));setShowTrash(true);setShowArchive(false);setMenu(true);}}/>
              <Button label="Later — keep existing items" onPress={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));}}/>
            </View>
          </View>
        </Modal>
        <Modal visible={colorTarget!==null} transparent animationType="fade" onRequestClose={()=>setColorTarget(null)}>
          <View style={{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:24,backgroundColor:'rgba(0,0,0,0.48)'}}>
            <Pressable accessibilityLabel="Dismiss color palette" onPress={()=>setColorTarget(null)} style={StyleSheet.absoluteFill}/>
            <View style={{width:'100%',maxWidth:380,borderRadius:28,padding:22,gap:18,backgroundColor:palette.surface,elevation:14}}>
              <Text style={{fontSize:20,fontWeight:'600',color:palette.text}}>Note colour</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-around',gap:14}}>
                {CARD_PALETTE.map((color,index)=>{
                  const targets=colorTarget==='cards'?selected:colorTarget==='node'?[focused]:[reader||''];
                  const source=colorTarget==='cards'?mapPrefs.cardColors:colorTarget==='node'?mapPrefs.colors:mapPrefs.noteColors;
                  const chosen=targets.length>0&&targets.every(target=>(source[target]||CARD_PALETTE[0]).toLowerCase()===color.toLowerCase());
                  const swatch=swatchKeepColor(index,effectiveTheme);
                  return <Pressable key={color} accessibilityRole="button" accessibilityState={{selected:chosen}} accessibilityLabel={index===0?'Default color':`Color ${index+1}`} onPress={()=>applyChosenColor(color)}
                    style={{width:paletteSwatchSize,height:paletteSwatchSize,borderRadius:paletteSwatchSize/2,backgroundColor:swatch,borderWidth:chosen?3:1.3,borderColor:chosen?palette.accent:palette.border,alignItems:'center',justifyContent:'center'}}>
                    {index===0&&<Svg width={27} height={27} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={8.5} stroke={palette.muted} strokeWidth={2} fill="none"/><Line x1={6} y1={18} x2={18} y2={6} stroke={palette.muted} strokeWidth={2}/></Svg>}
                    {chosen&&<View style={{position:'absolute',top:-6,right:-7,width:22,height:22,borderRadius:11,backgroundColor:palette.accent,alignItems:'center',justifyContent:'center'}}><MaterialIcon name="✓" color={palette.onAccent}/></View>}
                  </Pressable>;
                })}
              </View>

            </View>
          </View>
        </Modal>
      {renderAppDialog()}
      </SafeAreaView>
    </GestureHandlerRootView>
  </SafeAreaProvider>
  </PaletteContext.Provider>
);
}

const styles=StyleSheet.create({
  bottomSheet:{
    position:'absolute',
    bottom:10,
    left:12,
    right:12,
    zIndex:32,
    elevation:18,
    backgroundColor:'#fffdfb',
    padding:14,
    borderRadius:22,
    gap:10,
    maxHeight:'75%',
    borderWidth:1,
    borderColor:'#e7cfc7'
  },
  screen:{
    flex:1,
    backgroundColor:'#fff8f5'
  },
  header:{
    minHeight:60,
    paddingHorizontal:16,
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between'
  },
  logo:{
    fontSize:21,
    fontWeight:'800',
    color:'#362722'
  },
  button:{
    borderRadius:12,
    backgroundColor:'#e2e8f0',
    paddingVertical:12,
    paddingHorizontal:14,
    minHeight:48,
    justifyContent:'center'
  },
  buttonText:{
    fontSize:14,
    fontWeight:'700',
    color:'#563f38'
  },
  canvas:{
    flex:1,
    overflow:'hidden',
    backgroundColor:'#fff9f6'
  },
  world:{
    position:'absolute',
    width:0,
    height:0
  },
  node:{
    position:'absolute',
    borderWidth:1.5,
    alignItems:'center',
    justifyContent:'center',
    padding:6
  },
  nodeTitle:{
    fontWeight:'700',
    textAlign:'center'
  },
  popup:{
    position:'absolute',
    top:65,
    right:10,
    zIndex:30,
    elevation:15,
    backgroundColor:'white',
    padding:12,
    borderRadius:16,
    gap:8,
    minWidth:152,
    maxWidth:208,
    borderWidth:1,
    borderColor:'#cbd5e1'
  },
  sidebar:{
    position:'absolute',
    top:0,
    bottom:0,
    left:0,
    width:'82%',
    backgroundColor:'#fffdfb',
    zIndex:40,
    elevation:20,
    borderRightWidth:1,
    borderRightColor:'#cbd5e1'
  },
  muted:{
    fontSize:12,
    color:'#755d55'
  },
  editor:{
    paddingHorizontal:20,
    paddingVertical:24,
    flex:1,
    gap:20
  },
  editorField:{
    gap:8
  },
  editorLabel:{
    fontSize:14,
    fontWeight:'700',
    color:'#334155'
  },
  input:{
    borderWidth:1,
    borderColor:'#e7cfc7',
    borderRadius:14,
    backgroundColor:'#fffdfb',
    padding:14,
    fontSize:16
  },
  readerTitle:{
    fontSize:28,
    fontFamily:'Roboto',
    fontWeight:'600',
    color:'#0f172a'
  },
  readBody:{
    fontSize:17,
    lineHeight:27,
    color:'#334155',
    marginVertical:15
  },
  section:{
    fontSize:17,
    fontFamily:'Roboto',
    fontWeight:'600',
    color:'#0f172a'
  },
  wrap:{
    flexDirection:'row',
    flexWrap:'wrap',
    gap:8,
    alignItems:'center'
  },
  listRow:{
    flexDirection:'row',
    gap:12,
    alignItems:'center',
    backgroundColor:'white',
    padding:14,
    borderRadius:14,
    borderWidth:1,
    borderColor:'#e2e8f0'
  },
  listTitle:{
    fontSize:16,
    fontFamily:'Roboto',
    fontWeight:'600',
    color:'#0f172a'
  },
});
