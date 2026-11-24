import React,{useEffect,useMemo,useState,useRef} from 'react';
import {ICON_PATHS} from './orbitIcons';
import {LIGHT,DARK,uiRoles} from './orbitThemeTokens';
import {partitionLibraryColumns} from './libraryColumns';
import {AppState,BackHandler,Dimensions,KeyboardAvoidingView,useColorScheme,Modal,Platform,Pressable,ScrollView,FlatList,Keyboard,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Svg,{Line,Circle,Rect,Path,Text as SvgText} from 'react-native-svg';
import {SafeAreaProvider,SafeAreaView as InsetSafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated,{FadeInLeft,FadeOutLeft,LinearTransition,runOnJS,useAnimatedReaction,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';
import {loadSnapshot,saveSnapshot,loadMapPreferences,saveMapPreferences,emptyMapPreferences} from './storage';
import {radialTree,fitMap} from './mapGeometry';
import {hasPin,isPinLockEnabled,setPinLockEnabled,setPin,checkPin,credentialKind,removePin,biometricEnabled,setBiometricEnabled,authenticateBiometric,lockStatus,recordPinAttempt} from './appLock';
import {exportPDF,exportMultipleMapsPDF,Note} from './export';
import {safeExportName,saveExportToAndroid,saveMultiplePDFsToAndroid,ExportFormat} from './localSave';
import * as FileSystem from 'expo-file-system/legacy';
import {saveEncryptedBackup,selectBackupFile,decryptSelectedBackup} from './backup';
import {TrashBatch,deleteBranches,restoreBatch,pruneTrash,splitDeletedMaps} from './trash';
import {formatSelection,parseRichLine} from './noteFormatting';
import RichNoteEditor,{RichNoteEditorHandle,RichEditorState} from './RichNoteEditor';
import DeletedMapReader from './DeletedMapReader';
import OrbitSettings from './OrbitSettings';
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
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const PaletteContext=React.createContext(LIGHT);
const CARD_PALETTE=[...KEEP_LIGHT_PRESETS];
// Exactly four columns on phone widths: 12 original swatches + two additional rows of four.
const paletteSwatchSize=Math.min(60,(Math.min(W-48,380)-44-42)/4);

const Button=({label,onPress,primary=false,danger=false,active=false}:{label:string;onPress:()=>void;primary?:boolean;danger?:boolean;active?:boolean})=>{const palette=React.useContext(PaletteContext);return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.button,{backgroundColor:active?palette.control:'transparent'},primary&&{backgroundColor:palette.accent}]}><Text style={[styles.buttonText,{color:danger?'#dc2626':active?palette.accent:palette.text},primary&&{color:keepForeground(palette.accent)}]}>{label==='🗑'?<Svg width={23} height={23} viewBox="0 0 24 24"><Line x1={4} y1={7} x2={20} y2={7} stroke="#dc2626" strokeWidth={1.8}/><Line x1={9} y1={4} x2={15} y2={4} stroke="#dc2626" strokeWidth={1.8}/><Rect x={6} y={7} width={12} height={14} rx={2} stroke="#dc2626" strokeWidth={1.8} fill="none"/><Line x1={10} y1={11} x2={10} y2={17} stroke="#dc2626" strokeWidth={1.5}/><Line x1={14} y1={11} x2={14} y2={17} stroke="#dc2626" strokeWidth={1.5}/></Svg>:label}</Text></Pressable>;}

const MaterialIcon=({name,color}:{name:string;color:string})=>{
  if(name==='restoreIcon')return <Svg width={25} height={25} viewBox="0 0 24 24"><Path d={ICON_PATHS.restoreIcon} fill={color}/></Svg>;
  if(name==='format')return <Svg width={25} height={25} viewBox="0 0 24 24"><SvgText x={5} y={17} fontSize={17} fontWeight="bold" fill={color}>A</SvgText><Line x1={4} y1={20} x2={20} y2={20} stroke={color} strokeWidth={2}/></Svg>;
  if(name==='clearFormat')return <Svg width={25} height={25} viewBox="0 0 24 24"><SvgText x={4} y={18} fontSize={18} fontWeight="bold" fill={color}>T</SvgText><Line x1={4} y1={20} x2={21} y2={3} stroke={color} strokeWidth={2.5} strokeLinecap="round"/></Svg>;
  if(['bold','italic','underline'].includes(name))return <Text style={{fontSize:21,color,fontWeight:name==='bold'?'900':'600',fontStyle:name==='italic'?'italic':'normal',textDecorationLine:name==='underline'?'underline':'none'}}>{name==='bold'?'B':name==='italic'?'I':'U'}</Text>;
  const data=ICON_PATHS[name];
  return data?<Svg width={23} height={23} viewBox="0 0 24 24"><Path d={data} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>{name==='centerFocus'&&<Circle cx={12} cy={12} r={3.6} fill={color}/>}</Svg>:<Text style={{fontSize:name==='Fit'?14:22,color,fontWeight:'700'}}>{name}</Text>;
};

const LibraryGestureCard=({children,position,onMeasure,canSwipe,onArchive,canDrag,onDragStart,onDragMove,onDrop,registerRef}:{children:React.ReactNode;position:{top:number;left:number;width:number};onMeasure:(height:number)=>void;canSwipe:boolean;onArchive:()=>void;canDrag:boolean;onDragStart:()=>void;onDragMove:(x:number,y:number)=>void;onDrop:(x:number,y:number)=>void;registerRef:(view:View|null)=>void})=>{
 const dx=useSharedValue(0),dy=useSharedValue(0),dragging=useSharedValue(false);
 const cardWidth=useSharedValue(W);
 const lastDragUpdate=useSharedValue(0);
 const swipeCommitted=useSharedValue(false);
 const swipe=Gesture.Pan().enabled(canSwipe).activeOffsetX([-18,18]).failOffsetY([-15,15])
   .onUpdate(e=>{dx.value=e.translationX;})
   .onEnd(e=>{
     if(Math.abs(e.translationX)>cardWidth.value*0.65){swipeCommitted.value=true;dx.value=withTiming(e.translationX>0?W+cardWidth.value:-W-cardWidth.value,{duration:180},finished=>{if(finished)runOnJS(onArchive)();});}
     else dx.value=withTiming(0,{duration:190});
   }).onFinalize(()=>{if(!swipeCommitted.value)dx.value=withTiming(0);});
 const drag=Gesture.Pan().enabled(canDrag).activateAfterLongPress(330)
   .onStart(()=>{dragging.value=true;runOnJS(onDragStart)();})
   .onUpdate(e=>{dx.value=e.translationX;dy.value=e.translationY;if(Math.abs(e.translationX)+Math.abs(e.translationY)-lastDragUpdate.value>14){lastDragUpdate.value=Math.abs(e.translationX)+Math.abs(e.translationY);runOnJS(onDragMove)(e.absoluteX,e.absoluteY);}})
   .onEnd(e=>{runOnJS(onDrop)(e.absoluteX,e.absoluteY);})
   .onFinalize(()=>{dragging.value=false;dx.value=withTiming(0,{duration:180});dy.value=withTiming(0,{duration:180});});
 const gesture=Gesture.Race(drag,swipe);
 const animated=useAnimatedStyle(()=>({
   transform:[{translateX:dx.value},{translateY:dy.value},{scale:dragging.value?1.035:1}],
   opacity:dragging.value?0.9:Math.max(0.16,1-Math.abs(dx.value)/(W*1.1)),
   zIndex:dragging.value?100:0,elevation:dragging.value?12:0
 }));
 return <Animated.View layout={LinearTransition.duration(480)} ref={registerRef} collapsable={false} style={{position:'absolute',top:position.top,left:position.left,width:position.width}} onLayout={e=>{cardWidth.value=e.nativeEvent.layout.width;onMeasure(e.nativeEvent.layout.height);}}><GestureDetector gesture={gesture}><Animated.View style={animated}>{children}</Animated.View></GestureDetector></Animated.View>;
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

const IconButton=({label,onPress,danger=false,active=false,disabled=false,accessibilityLabel}:{label:string;onPress:()=>void;danger?:boolean;active?:boolean;disabled?:boolean;accessibilityLabel?:string})=>{
  const palette=React.useContext(PaletteContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel||label} accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={{opacity:disabled?0.35:1,paddingHorizontal:12,paddingVertical:10,minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:active&&['bold','italic','underline'].includes(label)?palette.accent:active?palette.control:'transparent'}}>
    <MaterialIcon name={label} color={danger?'#dc2626':active&&['bold','italic','underline'].includes(label)?keepForeground(palette.accent):palette.text}/>
  </Pressable>;
};

const ActionRow=({label,icon,onPress,danger=false}:{label:string;icon?:string;onPress:()=>void;danger?:boolean})=>{
  const theme=React.useContext(PaletteContext);
  const foreground=danger?'#dc2626':theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:11,borderRadius:12}}>
    {icon&&<MaterialIcon name={icon} color={foreground}/>}
    <Text style={{fontSize:16,color:foreground,flex:1}}>{label}</Text>
  </Pressable>;
};

export default function App(){
const [notes,setNotes]=useState<Note[]>(initial),[folders,setFolders]=useState<Folder[]>([]),[focused,setFocused]=useState('root'),[overview,setOverview]=useState(false),[menu,setMenu]=useState(true),[reader,setReader]=useState<string|null>(null),[editing,setEditing]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[folderName,setFolderName]=useState(''),[creatingFolder,setCreatingFolder]=useState(false),[selected,setSelected]=useState<string[]>([]),[folderFilter,setFolderFilter]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState<string|null>(null),[trash,setTrash]=useState<TrashBatch[]>([]),[showTrash,setShowTrash]=useState(false),[undoBatch,setUndoBatch]=useState<string|null>(null);

const [mapPrefs,setMapPrefs]=useState(emptyMapPreferences);
const [archiveUndoIds,setArchiveUndoIds]=useState<string[]>([]);
const [pendingBranch,setPendingBranch]=useState<TrashBatch|null>(null);
 // Branch undo exists only in memory; never in the recoverable seven-day Deleted store.
 const branchUndoDeadline=useRef<number|null>(null);
const [undoOpen,setUndoOpen]=useState(false);
 const [undoMapIds,setUndoMapIds]=useState<string[]>([]);
const [trashMenu,setTrashMenu]=useState(false);
const [themeMenu,setThemeMenu]=useState(false);
const [labelManager,setLabelManager]=useState(false);
const [labelQuery,setLabelQuery]=useState('');
const bioPromptInProgress=useRef(false),bioPrompted=useRef(false);
const richEditorRef=useRef<RichNoteEditorHandle|null>(null);
const [editorFormats,setEditorFormats]=useState<RichEditorState>({bold:false,italic:false,underline:false,bullets:false,numbers:false,canUndo:false,canRedo:false});
const [colorTarget,setColorTarget]=useState<'cards'|'note'|'node'|null>(null);
const deviceTheme=useColorScheme();
const effectiveTheme=mapPrefs.themeMode==='system'?(deviceTheme==='dark'?'dark':'light'):mapPrefs.theme;
const palette=effectiveTheme==='dark'?DARK:LIGHT;
 const roles=uiRoles(palette);
const darkSelection=effectiveTheme==='dark';
const selectedSidebarColor=darkSelection?'#AFC3F9':'#FEF3C7';
const selectedSidebarText=darkSelection?'#172441':palette.text;
const noteDisplayColor=displayKeepColor(mapPrefs.noteColors[reader||''],effectiveTheme,palette.background);
const noteDisplayText=keepForeground(noteDisplayColor);
const [showMiniMap,setShowMiniMap]=useState(false);
const [showEntireMap,setShowEntireMap]=useState(false);
 const preExpandViewport=useRef<{x:number;y:number;zoom:number;angle:number}|null>(null);
const [gestureHelp,setGestureHelp]=useState(false);
const [nodeActions,setNodeActions]=useState<string|null>(null);
const [draftChildId,setDraftChildId]=useState<string|null>(null);
const [readerTapAt,setReaderTapAt]=useState(0);
const [textSelection,setTextSelection]=useState({start:0,end:0});
const [librarySearch,setLibrarySearch]=useState('');
const [librarySearching,setLibrarySearching]=useState(false);
const [cardMenuId,setCardMenuId]=useState<string|null>(null);
const [cardMenuPosition,setCardMenuPosition]=useState({top:70,left:12});
const [deletedPreview,setDeletedPreview]=useState<TrashBatch|null>(null);
const [formatToolbar,setFormatToolbar]=useState(false);
const [manualColor,setManualColor]=useState('');
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
const [foldersExpanded,setFoldersExpanded]=useState(true);
const [editingFolderId,setEditingFolderId]=useState<string|null>(null);
const [mapMenu,setMapMenu]=useState(false),[selectionMenu,setSelectionMenu]=useState(false),[sidebar,setSidebar]=useState(false),[moveFolderMenu,setMoveFolderMenu]=useState(false),[exportTarget,setExportTarget]=useState<string|null>(null);

const [backupMode,setBackupMode]=useState<'save'|'restore'|null>(null),[backupPassword,setBackupPassword]=useState(''),[backupBusy,setBackupBusy]=useState(false),[backupFile,setBackupFile]=useState<{uri:string;name:string}|null>(null);
const [exportKind,setExportKind]=useState<ExportFormat|null>(null),[exportName,setExportName]=useState(''),[exportBusy,setExportBusy]=useState(false),[exportSeparate,setExportSeparate]=useState(false);

const tx=useSharedValue(0),ty=useSharedValue(0),scale=useSharedValue(1),rotation=useSharedValue(0),startRotation=useSharedValue(0),startX=useSharedValue(0),startY=useSharedValue(0),startScale=useSharedValue(1);

const [credentialFallback,setCredentialFallback]=useState(false);
const settingsBack=useRef<()=>void>(()=>setSettings(false));
const [storedCredentialType,setStoredCredentialType]=useState<'pin'|'password'>('pin'),[appActive,setAppActive]=useState(AppState.currentState==='active'),[locked,setLocked]=useState(true),[pinConfigured,setPinConfigured]=useState(false),[pinLockEnabled,setPinLockEnabledState]=useState(false),[pinInput,setPinInput]=useState(''),[pinAttempts,setPinAttempts]=useState(0),[blockedUntil,setBlockedUntil]=useState(0),[settings,setSettings]=useState(false),[biometrics,setBiometrics]=useState(false);

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
        const lock=await lockStatus();
        setPinAttempts(lock.attempts);
        setBlockedUntil(lock.blockedUntil);
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
},[notes,folders,focused,trash,loaded,storageError]);

useEffect(()=>{
  if(!loaded||storageError)return;
  saveMapPreferences(mapPrefs).catch(e=>showDialog('Map preferences save failed',String(e)));
},[mapPrefs,loaded,storageError]);

useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>{
    if(state==='active'&&branchUndoDeadline.current!==null&&Date.now()>=branchUndoDeadline.current){
      branchUndoDeadline.current=null;setPendingBranch(null);setUndoOpen(false);
    }
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
  try{
    const status=await lockStatus();
    if(Date.now()<status.blockedUntil){
      showDialog('Try again later','Too many incorrect PIN attempts.');
      return;
    }
    const valid=await checkPin(pinInput);
    const next=await recordPinAttempt(valid);
    setPinAttempts(next.attempts);
    setBlockedUntil(next.blockedUntil);
    setPinInput('');
    if(valid){setLocked(false);setCredentialFallback(false);}
    else showDialog('Incorrect PIN',next.blockedUntil>Date.now()?'Try again in one minute.':'Please try again.');
  }catch(e){
    showDialog('Unlock error',String(e));
  }
};

const current=notes.find(n=>n.id===focused)||notes[0];
const parent=notes.find(n=>n.id===current.parentId);
const ancestors=useMemo(()=>{
  const a:Note[]=[];
  let n:Note|undefined=current;
  while(n){
    a.unshift(n);
    n=notes.find(x=>x.id===n?.parentId);
  }
  return a;
},[current,notes]);

const moveTo=(target:string)=>{
  const point=completeMap.find(x=>x.note.id===target);
  if(!point)return;
  setFocused(target);
  const angle=rotation.value;
   tx.value=withTiming(-scale.value*(point.x*Math.cos(angle)-point.y*Math.sin(angle)),{duration:560});
  ty.value=withTiming(-scale.value*(point.x*Math.sin(angle)+point.y*Math.cos(angle)),{duration:560});
  
};

const openReader=(target:string)=>{
  setReader(target);
  setEditing(false);
};

const beginEdit=(target:string)=>{
  const n=notes.find(x=>x.id===target);
  if(!n)return;
  setFormatToolbar(false);
  setReader(target);
  setTitle(n.title);
  setBody(n.body);
  setEditing(true);
};

const saveEdit=()=>{
  if(!reader)return;
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
  const newId=id();
  setNotes(ns=>[...ns,{id:newId,parentId,title:'',body:'',updatedAt:Date.now(),folderId:null}]);
  setMenu(false);
  setDraftChildId(newId);
  beginNew(newId);
};

const beginNew=(newId:string)=>{
  setReader(newId);
  setTitle('');
  setBody('');
  setEditing(true);
};

const clearUndoNotification=()=>{
  branchUndoDeadline.current=null;
  setUndoOpen(false);setUndoBatch(null);setPendingBranch(null);setUndoMapIds([]);
 };
 const undoDeletion=()=>{
  if(pendingBranch){
    if(branchUndoDeadline.current!==null&&Date.now()>=branchUndoDeadline.current){clearUndoNotification();return;}
    setNotes(existing=>restoreBatch(existing,pendingBranch));
  }else if(undoMapIds.length){
    const batches=trash.filter(batch=>undoMapIds.includes(batch.id));
    try{
      let updated=notes;
      for(const batch of batches)updated=restoreBatch(updated,batch);
      setNotes(updated);
      setTrash(existing=>existing.filter(batch=>!undoMapIds.includes(batch.id)));
    }catch(e){showDialog('Cannot undo map deletion',String(e));}
  }else if(undoBatch){
    const batch=trash.find(t=>t.id===undoBatch);
    if(batch)restore(batch);
  }
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
      branchUndoDeadline.current=null;
      setUndoBatch(deletedMaps[0].id);
      setUndoMapIds(deletedMaps.map(batch=>batch.id));
      setPendingBranch(null);setUndoOpen(true);
      if(result.batch.notes.some(n=>n.id===focused))setFocused('root');
      setSelected([]);setReader(null);
    }}
  ]);
};

useEffect(()=>{
  if(!undoOpen)return;
  const remaining=branchUndoDeadline.current===null?5000:Math.max(0,branchUndoDeadline.current-Date.now());
  const timer=setTimeout(()=>{
    branchUndoDeadline.current=null;setUndoOpen(false);setUndoBatch(null);setPendingBranch(null);setUndoMapIds([]);
  },remaining);
  return()=>clearTimeout(timer);
},[undoOpen,undoBatch,pendingBranch]);
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
      branchUndoDeadline.current=null;
      setNotes(result.remaining);
      setMapPrefs(p=>({...p,archived:p.archived.filter(item=>!result.batch.notes.some(n=>n.id===item))}));
      if(wholeMap){
        setTrash(existing=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...existing]):[result.batch,...existing]);
        setPendingBranch(null);setUndoBatch(result.batch.id);setUndoMapIds([result.batch.id]);
      }else{
        // Exclude branch deletion from the permanent seven-day Deleted store.
        setUndoBatch(null);setUndoMapIds([]);
        branchUndoDeadline.current=Date.now()+5000;
        setPendingBranch(result.batch);
      }
      setUndoOpen(true);
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

useEffect(()=>{
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(reader||settings||backupMode||exportKind||labelManager||creatingFolder)return false;
    if(menu){
      if(sidebar){setSidebar(false);return true;}
      if(selectionMenu||moveFolderMenu||sortMenu||trashMenu||cardMenuId){setSelectionMenu(false);setMoveFolderMenu(false);setSortMenu(false);setTrashMenu(false);setCardMenuId(null);return true;}
      if(selected.length){setSelected([]);return true;}
      if(selectedTrash.length){setSelectedTrash([]);return true;}
      if(pinLockEnabled)setLocked(true);
      BackHandler.exitApp();return true;
    }
    if(mapMenu||nodeActions){setMapMenu(false);setNodeActions(null);return true;}
    setMenu(true);return true;
  });
  return()=>sub.remove();
},[menu,reader,settings,backupMode,exportKind,labelManager,creatingFolder,sidebar,selectionMenu,moveFolderMenu,sortMenu,trashMenu,cardMenuId,selected,selectedTrash,mapMenu,nodeActions,pinLockEnabled]);

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
const restore=(batch:TrashBatch)=>{
  try{
    const restored=restoreBatch(notes,batch);
    setNotes(restored);
    setTrash(t=>t.filter(b=>b.id!==batch.id));
    setUndoBatch(null);
  }catch(e){
    showDialog('Restore unavailable',String(e));
  }
};

const updateChildRotation=(parentId:string,delta:number)=>setMapPrefs(p=>({...p,offsets:{...p.offsets,[parentId]:(p.offsets[parentId]||0)+delta}}));
 // Release-only settling: unrelated branches never move to make way.
 // A modest flick coasts briefly; holding still yields near-zero velocity.
 const finishChildRotation=(parentId:string,angularVelocity:number)=>{
   const parent=visible.find(n=>n.note.id===parentId);
   if(!parent)return;
   const mapRoot=visible.find(n=>n.level===0)?.note;
   if(!mapRoot)return;
   const start=mapPrefs.offsets[parentId]||0;
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
     setMapPrefs(p=>({...p,offsets:{...p.offsets,[parentId]:value}}));
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

const rotateChildren=Gesture.Pan().minPointers(1).maxPointers(1).minDistance(12).enabled(false);

 const rotate=Gesture.Rotation()
  .onStart(()=>{startRotation.value=rotation.value;})
  .onUpdate(e=>{rotation.value=startRotation.value+e.rotation;});

const pinch=Gesture.Pinch()
  .onStart(()=>{
    startScale.value=Number.isFinite(scale.value)&&scale.value>0?scale.value:1;
  })
  .onUpdate(e=>{
    const baseline=Number.isFinite(preferredFit)&&preferredFit>0?preferredFit:1;
    const factor=Number.isFinite(e.scale)&&e.scale>0?e.scale:1;
    const next=startScale.value*factor;
    if(Number.isFinite(next)&&next>0)
      scale.value=Math.min(baseline*2,Math.max(baseline*0.1,next));
  });

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
  let n=current;
  const seen=new Set<string>();
  while(n.parentId&&n.parentId!=='root'&&!seen.has(n.id)){
    seen.add(n.id);
    const p=notes.find(x=>x.id===n.parentId);
    if(!p)break;
    n=p;
  }
  return n;
},[current,notes]);
const completeMap=useMemo(()=>radialTree(mapRoot,notes,mapPrefs.offsets,{},focused),
  [mapRoot,notes,mapPrefs.offsets,focused]);
const fullMap=useMemo(()=>showEntireMap?completeMap:radialTree(mapRoot,notes,mapPrefs.offsets,mapPrefs.collapsed,focused),
  [showEntireMap,completeMap,mapRoot,notes,mapPrefs.offsets,mapPrefs.collapsed,focused]);
const visible=useMemo(()=>{
  const focus=fullMap.find(n=>n.note.id===focused);
  const depth=focus?.level||0;
  const ancestors=new Set<string>();
  let id=focused;
  while(id&&!ancestors.has(id)){
    ancestors.add(id);
    id=notes.find(n=>n.id===id)?.parentId||'';
  }
  return fullMap.filter(n=>showEntireMap||n.level<=1||ancestors.has(n.note.id)||
    (ancestors.has(n.note.parentId||'')&&n.level<=depth+1));
},[fullMap,focused,notes,showEntireMap]);

const [canvasW,setCanvasW]=useState(W);
const [canvasH,setCanvasH]=useState(H-180);

// Fixed 100% reference: changes in node count or focus must not redefine zoom.
// Retain the former sparse-map reference for the initial view.
const preferredFit=useMemo(()=>{const fit=fitMap([{x:-313.5,y:0},{x:313.5,y:0}],Math.max(1,canvasW),Math.max(1,canvasH)).scale;return Number.isFinite(fit)&&fit>0?fit*(1.75/1.2)*1.1:1;},[canvasW,canvasH]);
// Only reset zoom when entering a map, not after a node change.
useEffect(()=>{if(!menu)scale.value=withTiming(preferredFit*1.1,{duration:300});},[menu]);
useAnimatedReaction(
  ()=>Number.isFinite(scale.value)&&Number.isFinite(preferredFit)&&preferredFit>0?Math.round(Math.max(10,Math.min(200,scale.value/(preferredFit*1.1)*100))):100,
  (value,previous)=>{if(value!==previous)runOnJS(setZoomPercent)(value);}
);

// Use a fixed local drawing space and transform every point into it.
// This avoids SVG viewport width/preserveAspectRatio mismatches that made
// the overview appear pushed to the right on Android.
const miniBounds=useMemo(()=>{
  const width=1000,height=540,pad=16;
  if(!completeMap.length)return {width,height,scale:1,dx:width/2,dy:height/2};
  const xs=completeMap.map(v=>v.x),ys=completeMap.map(v=>v.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
  const scale=Math.min((width-2*pad)/spanX,(height-2*pad)/spanY);
  const dx=width/2-(minX+maxX)*scale/2;
  const dy=height/2-(minY+maxY)*scale/2;
  return {width,height,scale,dx,dy};
},[visible]);
const focusPoint=visible.find(x=>x.note.id===focused)||visible[0];
const toggleEntireMap=()=>{
   if(!showEntireMap){
     preExpandViewport.current={x:tx.value,y:ty.value,zoom:scale.value,angle:rotation.value};
     setShowEntireMap(true);
     return;
   }
   setShowEntireMap(false);
   const previous=preExpandViewport.current;
   preExpandViewport.current=null;
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
  if(!showEntireMap)return;
  const fit=fitMap(completeMap,canvasW,canvasH);
  tx.value=withTiming(fit.x);
  ty.value=withTiming(fit.y);
  scale.value=withTiming(fit.scale);
  rotation.value=withTiming(0);
},[showEntireMap,completeMap,canvasW,canvasH]);
const parentPoint:{x:number;y:number}={x:0,y:0};

const miniLines=completeMap.filter(n=>n.note.parentId&&n.note.parentId!=='root').flatMap(n=>{
  const p=completeMap.find(x=>x.note.id===n.note.parentId);
  return p?[{id:n.note.id,x1:p.x,y1:p.y,x2:n.x,y2:n.y}]:[];
});
// Use the uncollapsed hierarchy so manually collapsed children retain
// their small indicators around the visible parent.
const hiddenIndicators=completeMap.filter(n=>!visible.some(v=>v.note.id===n.note.id)&&
  visible.some(v=>v.note.id===n.note.parentId)).map(n=>{
  const p=completeMap.find(v=>v.note.id===n.note.parentId)!;
  const radius=[60,55,45,40,37.5,35][Math.min(p.level,5)];
  const angle=Math.atan2(n.y-p.y,n.x-p.x);
  return {note:n.note,x:p.x+radius*Math.cos(angle),y:p.y+radius*Math.sin(angle)};
});
const lines=visible
  .filter(x=>x.note.parentId&&x.note.parentId!=='root')
  .map(x=>{
    const p=visible.find(y=>y.note.id===x.note.parentId);
    return {
      x1:p?.x||0,y1:p?.y||0,
      x2:x.x,y2:x.y,id:x.note.id
    };
  });

const navigateIndicator=(targetId:string)=>{
  const target=notes.find(n=>n.id===targetId);
  if(!target)return;
  const ancestors:string[]=[];
  let parentId=target.parentId;
  const seen=new Set<string>();
  while(parentId&&parentId!=='root'&&!seen.has(parentId)){
    seen.add(parentId);
    ancestors.push(parentId);
    parentId=notes.find(n=>n.id===parentId)?.parentId||null;
  }
  setMapPrefs(p=>{
    const collapsed={...p.collapsed};
    ancestors.forEach(id=>{collapsed[id]=false;});
    return {...p,collapsed};
  });
  moveTo(targetId);
};

const nodePress=(n:Note)=>{
  if(n.id!==focused)moveTo(n.id);
};

const node=(n:Note,x:number,y:number,level:number)=>{
  const size=[120,110,90,80,75,70][Math.min(level,5)];
  const touchMargin=level>=2?42:30;
  // Calculate stable branch geometry outside the UI-thread gesture worklet.
  // Looking up React arrays inside onChange can fail intermittently.
  const branchParent=visible.find(v=>v.note.id===n.parentId);
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

  return (
    <GestureDetector
      key={n.id}
      gesture={branchParent?Gesture.Simultaneous(
        Gesture.Exclusive(long,triple,double,single),
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
      ):Gesture.Exclusive(long,triple,double,single)}
    >
      <View collapsable={false} style={{
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
          backgroundColor:displayKeepColor(mapPrefs.colors[n.id],effectiveTheme,n.id===focused?palette.accent:level<=1?palette.node:palette.subnode),
          borderColor:n.id===focused?palette.accent:palette.border
        }
      ]}>
        <Upright angle={rotation}>
          <Text
            numberOfLines={2}
            style={[
              styles.nodeTitle,
              {
                color:keepForeground(displayKeepColor(mapPrefs.colors[n.id],effectiveTheme,n.id===focused?palette.accent:palette.node)),
                fontSize:level>=2?14:16
              }
            ]}
          >
            {n.title}
          </Text>
          {Boolean(n.body.trim())&&(
            <Text style={{
              color:keepForeground(displayKeepColor(mapPrefs.colors[n.id],effectiveTheme,n.id===focused?palette.accent:palette.node)),
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

const activeReader=notes.find(n=>n.id===reader)||initial[0];
const mapPreview=(root:Note,previewNotes:Note[]=notes)=>{
  const points=radialTree(root,previewNotes,mapPrefs.offsets);
  const visiblePoints=points;
  const maxDepth=points.reduce((depth,point)=>Math.max(depth,point.level),0);
  const thumbnailHeight=Math.min(332,Math.max(119,88+Math.ceil(Math.log2(points.length+1))*27+maxDepth*13));
  // Thumbnail framing must not inherit the interactive canvas's minimum zoom.
  const bounds=points.reduce((v,p)=>({
    minX:Math.min(v.minX,p.x),maxX:Math.max(v.maxX,p.x),
    minY:Math.min(v.minY,p.y),maxY:Math.max(v.maxY,p.y)
  }),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  const thumbScale=Math.min(152/Math.max(1,bounds.maxX-bounds.minX),(thumbnailHeight-16)/Math.max(1,bounds.maxY-bounds.minY),1);
  const thumbX=80-(bounds.minX+bounds.maxX)*thumbScale/2;
  const thumbY=thumbnailHeight/2-(bounds.minY+bounds.maxY)*thumbScale/2;
  const byId=new Map(visiblePoints.map(v=>[v.note.id,v]));
  return (
    <Svg width="100%" height={thumbnailHeight} viewBox={`0 0 160 ${thumbnailHeight}`} accessibilityLabel={`Preview of ${root.title||'untitled map'}`}>
      {visiblePoints.map(v=>{
        const parent=byId.get(v.note.parentId||'');
        return parent?<Line key={v.note.id} x1={thumbX+parent.x*thumbScale} y1={thumbY+parent.y*thumbScale} x2={thumbX+v.x*thumbScale} y2={thumbY+v.y*thumbScale} stroke={palette.connector} strokeWidth={1.2}/>:null;
      })}
      {visiblePoints.map(v=><Circle key={v.note.id} cx={thumbX+v.x*thumbScale} cy={thumbY+v.y*thumbScale} r={v.note.id===root.id?4:2.7} fill={displayKeepColor(mapPrefs.colors[v.note.id],effectiveTheme,v.note.id===root.id?palette.accent:palette.node)} stroke={palette.border} strokeWidth={0.8}/>)}
    </Svg>
  );
};
const applyNoteFormat=(kind:'bold'|'italic'|'underline'|'bullets'|'numbers'|'clear')=>{if(richEditorRef.current)richEditorRef.current.format(kind);else if(kind!=='clear')setBody(value=>formatSelection(value,textSelection.start,textSelection.end,kind));};
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
const listNotes=notes.filter(n=>n.parentId==='root'&&(showArchive?mapPrefs.archived.includes(n.id):!mapPrefs.archived.includes(n.id)));
const shown=useMemo(()=>{
 const order=mapPrefs.customOrder||[];
 const direction=sortDirection==='asc'?1:-1;
 return listNotes.filter(n=>(!folderFilter||hasLabel(n,folderFilter))&&matchesMapQuery(n,notes,librarySearch)).sort((a,b)=>{
   if(librarySort==='custom'){
     const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
     return (ai<0?Number.MAX_SAFE_INTEGER:ai)-(bi<0?Number.MAX_SAFE_INTEGER:bi) || (ai<0&&bi<0?b.updatedAt-a.updatedAt:0);
   }
   const pinned=Number(mapPrefs.pinned.includes(b.id))-Number(mapPrefs.pinned.includes(a.id));
   if(pinned)return pinned;
   const result=librarySort==='title'?a.title.localeCompare(b.title,undefined,{sensitivity:'base'}):librarySort==='created'?Number(a.id.split('-')[0])-Number(b.id.split('-')[0]):a.updatedAt-b.updatedAt;
   return direction*result || a.id.localeCompare(b.id);
 });
},[notes,folderFilter,librarySearch,librarySort,sortDirection,mapPrefs.customOrder,mapPrefs.pinned,mapPrefs.archived,showArchive]);

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
const [draggingMapId,setDraggingMapId]=useState<string|null>(null);
const dragUpdateBusy=useRef(false);
// Keep-like insertion: move only when the drag enters another card.
 // Do not rewrite state for repeated samples over an unchanged destination.
 const reorderCard=(draggedId:string,x:number,y:number)=>{
  if(librarySort!=='custom'||dragUpdateBusy.current)return;
  const candidates=shown.filter(n=>n.id!==draggedId)
    .map(n=>({id:n.id,ref:libraryCardRefs.current[n.id]}))
    .filter(n=>n.ref);
  if(!candidates.length)return;
  dragUpdateBusy.current=true;
  let remaining=candidates.length;
  let hoveredId:string|null=null;
  let closest=Infinity;
  for(const candidate of candidates){
    candidate.ref!.measureInWindow((cx,cy,w,h)=>{
      // Only rearrange when the finger is actually over an adjacent map.
      if(w>0&&h>0&&x>=cx-w*0.22&&x<=cx+w*1.22&&y>=cy-h*0.22&&y<=cy+h*1.22){
        const distance=Math.pow(cx+w/2-x,2)+Math.pow(cy+h/2-y,2);
        if(distance<closest){closest=distance;hoveredId=candidate.id;}
      }
      if(--remaining!==0)return;
      dragUpdateBusy.current=false;
      if(!hoveredId)return;
      const targetId=hoveredId;
      setMapPrefs(p=>{
        const allRoots=notes.filter(n=>n.parentId==='root').map(n=>n.id);
        const original=[...new Set([...(p.customOrder||[]),...shown.map(n=>n.id),...allRoots])]
          .filter(id=>allRoots.includes(id));
        const currentIndex=original.indexOf(draggedId);
        const targetIndex=original.indexOf(targetId);
        if(currentIndex<0||targetIndex<0||currentIndex===targetIndex)return p;
        const next=original.slice();
        next.splice(currentIndex,1);
        next.splice(next.indexOf(targetId),0,draggedId);
        if(next.every((id,i)=>id===original[i]))return p;
        return {...p,customOrder:next};
      });
    });
  }
};
const moveSelection=(folderId:string|null)=>{
  if(!folderId)return;
  const allAssigned=selected.length>0&&selected.every(id=>{const n=notes.find(x=>x.id===id);return n?hasLabel(n,folderId):false;});
  setNotes(ns=>ns.map(n=>selected.includes(n.id)?{...(allAssigned?removeLabel(n,folderId):addLabel(n,folderId)),updatedAt:Date.now()}:n));
};

const exportOne=(kind:ExportFormat,targetId?:string)=>{
  const target=notes.find(n=>n.id===(targetId||current.id))||current;
  setExportTarget(target.id);
  let mapRoot=target;
  const seen=new Set<string>();
  while(mapRoot.parentId&&mapRoot.parentId!=='root'&&!seen.has(mapRoot.id)){
    seen.add(mapRoot.id);
    const parent=notes.find(n=>n.id===mapRoot.parentId);
    if(!parent)break;
    mapRoot=parent;
  }
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
        const count=await saveMultiplePDFsToAndroid(files);
        if(count){setExportKind(null);showDialog('PDFs saved',`${count} separate PDF files saved to the selected folder.`);}
        else showDialog('Save cancelled','No files were saved.');
      }finally{
        for(const file of files){try{await FileSystem.deleteAsync(file.uri,{idempotent:true});}catch{}}
      }
      return;
    }
    tempUri=exportTarget==='__selection__'
      ?await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes,mapPrefs.colors,effectiveTheme)
      :await exportPDF(notes.find(n=>n.id===exportTarget)||current,notes,mapPrefs.colors,effectiveTheme);

    const fallbackExportName=exportTarget==='__selection__'?(selected.length===1?(notes.find(n=>n.id===selected[0])?.title||'Orbit Notes'):'Selected maps'):(notes.find(n=>n.id===exportTarget)?.title||current.title);
    const finalExportName=exportName.trim()||fallbackExportName;
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
      await saveSnapshot({notes,folders,focused,trash});
      const saved=await saveEncryptedBackup(
        {notes,folders,focused,trash,mapPreferences:mapPrefs},
        backupPassword
      );

      if(saved){
        setBackupMode(null);
        setBackupPassword('');
        showDialog(
          'Backup saved',
          'Keep your backup password safe. There is no password recovery.'
        );
      }
    }else{
      const restored=await decryptSelectedBackup(backupFile!.uri,backupPassword);

      if(restored){
        await saveSnapshot({...restored,trash:splitDeletedMaps(restored.trash)});
        setNotes(normalizeLabels(restored.notes));
        setFolders(restored.folders);
        setTrash(splitDeletedMaps(restored.trash));
         if(restored.trash.length>0&&!restored.mapPreferences?.trashRetentionAcknowledged)setRetentionNotice(true);
         setShowArchive(false);setShowTrash(false);
        setFocused(restored.focused);
        if(restored.mapPreferences)setMapPrefs({...emptyMapPreferences(),...restored.mapPreferences,...(restored.trash.length>0&&!restored.mapPreferences.trashRetentionAcknowledged?{trashRetentionAcknowledged:false,trashRetentionWarningSeen:false}:{})});
         else if(restored.trash.length>0)setMapPrefs(p=>({...p,trashRetentionAcknowledged:false,trashRetentionWarningSeen:false,archived:[]}));
        setBackupMode(null);
        setBackupFile(null);
        setBackupPassword('');
        setSettings(false);
        showDialog(
          'Restore complete',
          'The local notebook was replaced by the selected backup.'
        );
      }
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
      <Text style={[styles.section,{color:palette.text}]}>Unable to open local notebook</Text>
      <Text style={styles.muted}>{storageError}</Text>
      <Text style={styles.muted}>
        Orbit Notes has stopped writes to protect existing data.
        Restart the app after resolving the storage issue.
      </Text>
    </SafeAreaView>
  );
}

if(!loaded){
  return (
    <SafeAreaView style={[styles.screen,{backgroundColor:palette.background}]}>
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
      <View style={{alignItems:'center',gap:16}}>
        <MaterialIcon name="lockIcon" color={palette.muted}/>
        <Text style={[styles.logo,{color:palette.text}]}>Orbit Notes</Text>
      </View>
      {biometrics&&!credentialFallback?(
        <View style={{alignItems:'center',gap:20}}>
          <Svg width={62} height={62} viewBox="0 0 24 24"><Path d="M12 3c-5 0-8 3-8 8m16 0c0-5-3-8-8-8M4 15c1 4 3 6 8 6m8-6c-1 4-3 6-8 6M8 15c.5 3 1.5 4 4 4s3.5-1 4-4M8 11c0-3 1.5-5 4-5s4 2 4 5m-4-2v7m-8-4v2m16-2v2" stroke={palette.accent} strokeWidth={1.8} strokeLinecap="round" fill="none"/></Svg>
          <Text style={{color:palette.text,fontSize:19,fontWeight:'600'}}>Unlock with biometrics</Text>
          <Button label="Use biometrics" primary onPress={async()=>{
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
          <Button label="Unlock" primary onPress={unlock}/>
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
  return (
  <PaletteContext.Provider value={palette}>
  <SafeAreaProvider>
    <GestureHandlerRootView style={{flex:1}}>
      <SafeAreaView style={[styles.screen,{backgroundColor:palette.background}]}>
        <StatusBar barStyle={effectiveTheme==='dark'?'light-content':'dark-content'}/>

        <View style={[
          styles.header,
          {justifyContent:'space-between'}
        ]}>
          <IconButton
            label="←"
            accessibilityLabel="Back to library"
            onPress={()=>{
              setMenu(true);
              setMapMenu(false);
            }}
          />

          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label="Fit" accessibilityLabel="Fit map to screen" onPress={fitCurrentMap}/>
            <IconButton label="parentNote" accessibilityLabel="Go to parent note" onPress={()=>{if(parent)moveTo(parent.id);}}/>
             <IconButton label="centerFocus" accessibilityLabel="Center focused note" onPress={()=>{tx.value=withTiming(-scale.value*(focusPoint?.x||0));ty.value=withTiming(-scale.value*(focusPoint?.y||0));rotation.value=withTiming(0);}}/>
             <IconButton label="miniMapIcon" accessibilityLabel={showMiniMap?"Hide mini-map":"Show mini-map"} onPress={()=>setShowMiniMap(v=>!v)}/>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,maxHeight:48}} contentContainerStyle={{alignItems:'center',paddingHorizontal:12,gap:4}}>
          {ancestors.filter(n=>n.id!=='root').map((n,i)=><Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Focus ${n.title||'Untitled'}`} onPress={()=>moveTo(n.id)} style={{padding:8}}><Text style={{color:n.id===focused?'#1d4ed8':'#475569',fontWeight:n.id===focused?'800':'500'}}>{i?'› ':''}{n.title||'Untitled'}</Text></Pressable>)}
        </ScrollView>
        {(nodeActions||mapMenu)&&<Pressable accessibilityLabel="Close menu" onPress={()=>{setNodeActions(null);setMapMenu(false);}} style={[StyleSheet.absoluteFill,{zIndex:20,elevation:10}]}/>}
        {nodeActions&&<View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:8,left:0,right:0}]}>
          <Text style={{fontWeight:'700',color:palette.text}} numberOfLines={2}>{notes.find(n=>n.id===nodeActions)?.title||'Note actions'}</Text>
          <ActionRow label="Read note" icon="readIcon" onPress={()=>{openReader(nodeActions);setNodeActions(null);}}/>
          <ActionRow label="Edit note" icon="✎" onPress={()=>{beginEdit(nodeActions);setNodeActions(null);}}/>
          <ActionRow label="Add child" icon="childIcon" onPress={()=>{addChild(nodeActions);setNodeActions(null);}}/>
          <ActionRow label="Move up a level" icon="upLevel" onPress={()=>{reparent(nodeActions,'up');setNodeActions(null);}}/>
          <ActionRow label="Move down a level" icon="downLevel" onPress={()=>{reparent(nodeActions,'down');setNodeActions(null);}}/>
          {notes.find(n=>n.id===nodeActions)?.parentId==='root'&&!mapPrefs.archived.includes(nodeActions)&&<ActionRow icon="archive" label="Archive map" onPress={()=>{archiveOne(nodeActions,true);setNodeActions(null);setMenu(true);setShowArchive(false);}}/>}
          <ActionRow label="Delete branch" icon="🗑" danger onPress={()=>{removeBranch(nodeActions);setNodeActions(null);}}/>
          
        </View>}
        {mapMenu&&(
          <View style={[styles.popup,{top:'auto',bottom:72,right:12,width:181,backgroundColor:palette.surface,borderColor:palette.border}]}>
            <ActionRow label="Export" icon="exportIcon" onPress={()=>{setMapMenu(false);exportOne('pdf');}}/>
            {current.parentId==='root'&&!mapPrefs.archived.includes(current.id)&&<ActionRow icon="archive" label="Archive" onPress={()=>{archiveOne(current.id,true);setMapMenu(false);setMenu(true);setShowArchive(false);}}/>}
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
            gesture={Gesture.Simultaneous(pan,pinch,rotate,rotateChildren)}
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

          {!menu&&<Pressable accessibilityRole="button" accessibilityLabel="Add child note" onPress={()=>{setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:false}}));addChild(focused);}} style={{position:'absolute',right:18,bottom:17,width:58,height:58,borderRadius:19,backgroundColor:palette.accent,alignItems:'center',justifyContent:'center',elevation:6,zIndex:9}}>
            <Text style={{color:'white',fontSize:32}}>+</Text>
          </Pressable>}
        </View>

        {!menu&&<View style={{height:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:6,backgroundColor:palette.surface}}>
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label="−" accessibilityLabel="Zoom out" onPress={()=>{scale.value=withTiming(Math.max(preferredFit*1.1*0.1,preferredFit*1.1*(Math.round(scale.value/(preferredFit*1.1)*10)-1)/10));}}/>
            <Text accessibilityLabel={`Zoom ${zoomPercent} percent`} style={{fontSize:13,color:palette.text,minWidth:44,textAlign:'center'}}>{zoomPercent}%</Text>
            <IconButton label="+" accessibilityLabel="Zoom in" onPress={()=>{scale.value=withTiming(Math.min(preferredFit*1.1*2,preferredFit*1.1*(Math.round(scale.value/(preferredFit*1.1)*10)+1)/10));}}/>
          </View>
          <IconButton label={showEntireMap?'shrinkAll':'expandAll'} accessibilityLabel={showEntireMap?'Collapse entire map':'Expand entire map'} onPress={toggleEntireMap}/>
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label={mapPrefs.collapsed[focused]?'expandBranch':'collapseBranch'} accessibilityLabel={mapPrefs.collapsed[focused]?'Expand branch':'Collapse branch'} onPress={()=>setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:!p.collapsed[focused]}}))}/>
            <IconButton label="palette" accessibilityLabel="Node color" onPress={()=>{setManualColor(mapPrefs.colors[focused]||'');setColorTarget('node');}}/>
            <IconButton label="⋮" accessibilityLabel="More map actions" onPress={()=>setMapMenu(v=>!v)}/>
          </View>
        </View>}
          {!menu&&showMiniMap&&<View style={{height:150,marginHorizontal:12,marginBottom:6,backgroundColor:palette.surface,borderColor:palette.border,borderWidth:1,borderRadius:16,overflow:'hidden',padding:10}}><Text style={styles.muted}>Map overview · {completeMap.length} notes</Text><Animated.View style={miniRotationStyle}><Svg width="100%" height={118} viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet">{miniLines.map(l=><Line key={l.id} x1={l.x1*miniBounds.scale+miniBounds.dx} y1={l.y1*miniBounds.scale+miniBounds.dy} x2={l.x2*miniBounds.scale+miniBounds.dx} y2={l.y2*miniBounds.scale+miniBounds.dy} stroke={palette.connector} strokeWidth={2}/>)}{completeMap.map(v=><Circle key={v.note.id} cx={v.x*miniBounds.scale+miniBounds.dx} cy={v.y*miniBounds.scale+miniBounds.dy} r={v.note.id===focused?5:3.5} fill={v.note.id===focused?palette.accent:palette.muted}/>)}</Svg></Animated.View></View>}

        {undoOpen&&(undoBatch||pendingBranch)&&(<SwipeUndoNotice message={pendingBranch?'Branch deleted':'Moved to Deleted'} onUndo={undoDeletion} onDismiss={clearUndoNotification} bottom={74}/>)}
        <Modal visible={gestureHelp} transparent animationType="fade" onRequestClose={()=>setGestureHelp(false)}>
          <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.35)'}}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss gesture help" onPress={()=>setGestureHelp(false)}/>
            <View style={{backgroundColor:palette.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,gap:12}}>
              <Text style={[styles.section,{color:palette.text}]}>Map gestures</Text>
              <Text style={{color:palette.text,fontSize:15,lineHeight:24}}>Tap to focus a node.{"\n"}Double-tap to read.{"\n"}Triple-tap to edit.{"\n"}Long-press for note actions.{"\n"}Drag around a branch to rotate children.{"\n"}Use two fingers to zoom or rotate the map.{"\n"}Fit shows the visible map.</Text>

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
              <Text style={styles.section}>
                Save {exportKind?.toUpperCase()} to device
              </Text>
              <Text style={styles.muted}>
                Android requires folder access through its system picker when saving files to a chosen folder.
              </Text>
              {exportTarget==='__selection__'&&selected.length>1&&<View style={styles.wrap}>
                <Button label={`${!exportSeparate?'✓ ':''}Single PDF`} onPress={()=>setExportSeparate(false)}/>
                <Button label={`${exportSeparate?'✓ ':''}Separate PDFs`} onPress={()=>setExportSeparate(true)}/>
              </View>}
              {!exportSeparate&&<TextInput
                style={styles.input}
                value={exportName}
                onChangeText={setExportName}
                editable={!exportBusy}
                maxLength={100}
                autoCapitalize="sentences"
              />}
              <Text style={styles.muted}>
                {exportSeparate?`${selected.length} individual PDF files (named after each map)` :safeExportName(exportName.trim()||(exportTarget==='__selection__'?(selected.length===1?(notes.find(n=>n.id===selected[0])?.title||'Orbit Notes'):'Selected maps'):(notes.find(n=>n.id===exportTarget)?.title||current.title)),exportKind||'pdf')}
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
                  primary
                  onPress={confirmExport}
                />
              </View>
            </View>
          </View>
        </Modal>


        {settings&&<Modal visible animationType="slide" onRequestClose={()=>settingsBack.current()} >
          <OrbitSettings key="orbit-settings"
            palette={palette}
            themeMode={mapPrefs.themeMode??mapPrefs.theme}
            onTheme={choice=>setMapPrefs(p=>({...p,themeMode:choice,theme:choice==='system'?p.theme:choice}))}
            lockEnabled={pinLockEnabled}
            configured={pinConfigured}
            selectedKind={storedCredentialType}
            biometric={biometrics}
            registerBack={handler=>{settingsBack.current=handler;}}
            appVersion={appInfo.expo.version}
            buildNumber={String(appInfo.expo.android.versionCode)}
            onClose={()=>setSettings(false)}
            onToggleLock={async enabled=>{await setPinLockEnabled(enabled);setPinLockEnabledState(enabled);if(!enabled)setLocked(false);}}
            onToggleBiometric={async enabled=>{await setBiometricEnabled(enabled);setBiometrics(enabled);}}
            onVerify={async value=>{
              const status=await lockStatus();
              if(Date.now()<status.blockedUntil)throw new Error('Too many attempts. Please try later.');
              const ok=await checkPin(value);
              const next=await recordPinAttempt(ok);
              setPinAttempts(next.attempts);setBlockedUntil(next.blockedUntil);
              return ok;
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
            onBackup={kind=>{setBackupPassword('');setBackupFile(null);setBackupMode(kind);}}
            onLockNow={()=>{bioPrompted.current=false;setCredentialFallback(false);setSettings(false);setLocked(true);}}
          />
        </Modal>}

        <Modal
          visible={backupMode!==null}
          transparent
          animationType="fade"
          onRequestClose={()=>{
            if(!backupBusy)setBackupMode(null);
          }}
        >
          <View style={{
            flex:1,
            backgroundColor:'rgba(15,23,42,0.55)',
            justifyContent:'center',
            padding:22
          }}>
            <Pressable accessibilityLabel="Close backup dialog" onPress={()=>{if(!backupBusy){setBackupMode(null);setBackupFile(null);setBackupPassword('');}}} style={StyleSheet.absoluteFill}/>
            <View style={{
              backgroundColor:palette.surface,
               padding:20,
               borderRadius:26,
              gap:14
            }}>
              <Text style={styles.section}>
                {backupMode==='save'
                  ?'Create encrypted backup'
                  :'Restore encrypted backup'}
              </Text>
              <Text style={styles.muted}>
                {backupMode==='save'
                  ?'Choose an Android folder and keep the password somewhere safe.'
                  :'Select the backup file first. Then enter its password. Restoring will REPLACE the current notebook.'}
              </Text>
              {backupMode==='restore'&&<>
                <Button label={backupFile?'Change backup file':'Select backup file'} onPress={async()=>{
                  try{const file=await selectBackupFile();if(file){setBackupFile(file);setBackupPassword('');}}
                  catch(e){showDialog('Backup selection failed',String(e));}
                }}/>
                {backupFile&&<Text style={styles.muted}>{backupFile.name}</Text>}
              </>}
              {(backupMode==='save'||backupFile!==null)&&<TextInput
                secureTextEntry
                value={backupPassword}
                onChangeText={setBackupPassword}
                placeholder="Backup password (12+ characters)"
                style={styles.input}
                editable={!backupBusy}
              />}
              <View style={styles.wrap}>
                <Button
                  label="Cancel"
                  onPress={()=>{
                    if(!backupBusy){
                      setBackupMode(null);
                      setBackupFile(null);
                      setBackupPassword('');
                    }
                  }}
                />
                <Button
                  label={backupBusy
                    ?'Working…'
                    :backupMode==='save'
                      ?'Choose folder & save'
                      :'Restore selected backup'}
                  primary
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
              <IconButton label="←" accessibilityLabel="Back to map" onPress={cancelReader}/>
              <View style={styles.wrap}>
                {editing&&(
                  <Button
                    label="Done"
                    primary
                    onPress={saveEdit}
                  />
                )}
                {!editing&&<IconButton label="+" accessibilityLabel="Add child note" onPress={()=>reader&&addChild(reader)}/>}
                {!editing&&<IconButton label="✎" accessibilityLabel="Edit note" onPress={()=>reader&&beginEdit(reader)}/>}
                <IconButton label="×" accessibilityLabel={draftChildId===reader?'Discard new child note':'Close note'} onPress={closeReaderWithCross}/>
              </View>
            </View>

            {editing?(
              <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[styles.editor,{backgroundColor:noteDisplayColor}]}>
                <View style={styles.editorField}>
                  <Text style={[styles.editorLabel,{color:palette.muted}]}>Note title</Text>
                  <TextInput
                    accessibilityLabel="Note title"
                    style={[styles.input,{backgroundColor:noteDisplayColor,color:noteDisplayText,borderColor:palette.border}]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Heading"
                    placeholderTextColor={effectiveTheme==='dark'?'#DCE5F5':'#65708A'}
                  />
                </View>
                <View style={[styles.editorField,{flex:1}]}>
                  <Text style={[styles.editorLabel,{color:palette.muted}]}>Note content</Text>
                  <RichNoteEditor key={reader||'note'} ref={richEditorRef} initialText={body} onChangeText={setBody} onFormatStateChange={state=>setEditorFormats(previous=>({...previous,...state}))}
                     dark={effectiveTheme==='dark'} textColor={noteDisplayText} backgroundColor={noteDisplayColor}/>
                </View>
                <View style={{gap:5}}>
                  {formatToolbar&&<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:16,borderWidth:1,borderColor:palette.border,backgroundColor:palette.surface,paddingHorizontal:2}}>
                    <IconButton label="bold" active={editorFormats.bold} accessibilityLabel="Bold text" onPress={()=>applyNoteFormat('bold')}/>
                    <IconButton label="italic" active={editorFormats.italic} accessibilityLabel="Italic text" onPress={()=>applyNoteFormat('italic')}/>
                    <IconButton label="underline" active={editorFormats.underline} accessibilityLabel="Underline text" onPress={()=>applyNoteFormat('underline')}/>
                    <IconButton label="clearFormat" accessibilityLabel="Remove formatting" onPress={()=>applyNoteFormat('clear')}/>
                    <IconButton label="×" accessibilityLabel="Close formatting toolbar" onPress={()=>setFormatToolbar(false)}/>
                  </View>}
                  <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
                    <IconButton label="undo" disabled={!editorFormats.canUndo} accessibilityLabel="Undo note edit" onPress={()=>richEditorRef.current?.format('undo')}/>
                    <IconButton label="redo" disabled={!editorFormats.canRedo} accessibilityLabel="Redo note edit" onPress={()=>richEditorRef.current?.format('redo')}/>
                    <IconButton label="format" active={formatToolbar} accessibilityLabel="Text formatting" onPress={()=>setFormatToolbar(true)}/>
                    <IconButton label="bullets" active={editorFormats.bullets} accessibilityLabel="Bulleted list" onPress={()=>applyNoteFormat('bullets')}/>
                    <IconButton label="numbers" active={editorFormats.numbers} accessibilityLabel="Numbered list" onPress={()=>applyNoteFormat('numbers')}/>
                    <IconButton label="palette" accessibilityLabel="Note color" onPress={()=>{setManualColor(mapPrefs.noteColors[reader||'']||'');setColorTarget('note');}}/>
                  </View>
                </View>
              </KeyboardAvoidingView>
            ):(
              <ScrollView contentContainerStyle={[styles.editor,{backgroundColor:noteDisplayColor}]}>
                <Pressable onPress={()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  <Text style={[styles.readerTitle,{color:noteDisplayText}]}>{activeReader?.title}</Text>
                </Pressable>
                <Pressable onPress={()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  {activeReader?.body?<View style={{marginVertical:15,gap:3}}>{noteBodyView(activeReader.body)}</View>:<Text style={[styles.readBody,{color:palette.muted}]}>This note is empty.</Text>}
                </Pressable>
                 

              </ScrollView>
            )}
          </SafeAreaView>
        </Modal> 
        
        

        <Modal
          visible={menu}
          animationType="slide"
          onRequestClose={()=>{if(sidebar)setSidebar(false);else if(selectionMenu||moveFolderMenu||sortMenu||trashMenu||cardMenuId){setSelectionMenu(false);setMoveFolderMenu(false);setSortMenu(false);setTrashMenu(false);setCardMenuId(null);}else if(selected.length)setSelected([]);else if(selectedTrash.length)setSelectedTrash([]);else BackHandler.exitApp();}}
        >
          <GestureHandlerRootView style={{flex:1}}><InsetSafeAreaView style={[styles.screen,{backgroundColor:palette.background}]} edges={['top','bottom']}>
            <View style={[styles.header,{gap:2}]}>
              <IconButton label={selected.length||showTrash&&selectedTrash.length?'×':'☰'} accessibilityLabel={selected.length||showTrash&&selectedTrash.length?'Clear selection':'Open sidebar'} onPress={()=>{if(showTrash&&selectedTrash.length)setSelectedTrash([]);else if(selected.length)setSelected([]);else setSidebar(v=>!v);}}/>
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
              ):selected.length===0?(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:palette.control,borderRadius:26,paddingLeft:12,minHeight:48}}>
                  <MaterialIcon name="search" color={palette.muted}/>
                  <TextInput accessibilityLabel="Search all map contents" placeholder="Search Orbit Notes" placeholderTextColor={palette.muted} value={librarySearch} onFocus={()=>{setLibrarySearching(true);setSortMenu(false);}} onChangeText={setLibrarySearch} style={{flex:1,minWidth:20,fontSize:15,color:palette.text,paddingVertical:7}}/>
                  {librarySearching||librarySearch.length>0?<IconButton label="×" accessibilityLabel="Clear search" onPress={()=>{setLibrarySearch('');setLibrarySearching(false);Keyboard.dismiss();}}/>:<>
                    <IconButton label={mapPrefs.viewMode==='grid'?'listView':'gridView'} accessibilityLabel={mapPrefs.viewMode==='grid'?'Switch to list view':'Switch to card view'} onPress={()=>setMapPrefs(p=>({...p,viewMode:p.viewMode==='grid'?'list':'grid'}))}/>
                    <Pressable accessibilityRole="button" accessibilityLabel="Sort maps" onPress={()=>setSortMenu(v=>!v)} style={{minWidth:48,minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:24,backgroundColor:librarySort==='created'||librarySort==='modified'?palette.background:'transparent'}}>
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
                  <IconButton label="palette" accessibilityLabel="Change selected card colors" onPress={()=>{setManualColor(selected.length===1?mapPrefs.cardColors[selected[0]]||'':'');setColorTarget('cards');}}/>
                  <IconButton label="label" accessibilityLabel="Assign labels to selected maps" onPress={()=>{setLabelQuery('');setMoveFolderMenu(true);}}/>
                  <IconButton label="⋮" accessibilityLabel="More selection actions" onPress={()=>setSelectionMenu(v=>!v)}/>
                </View>
              )}
            </View>

            {(selectionMenu||moveFolderMenu||sidebar||sortMenu||trashMenu||cardMenuId)&&<Pressable accessibilityLabel="Close menu" onPress={()=>{setSelectionMenu(false);setMoveFolderMenu(false);setSidebar(false);setSortMenu(false);setTrashMenu(false);setCardMenuId(null);}} style={[StyleSheet.absoluteFill,{zIndex:20,elevation:10,backgroundColor:sidebar?'rgba(0,0,0,0.32)':'transparent'}]}/>}
            {cardMenuId&&<View style={{position:'absolute',top:cardMenuPosition.top,left:cardMenuPosition.left,zIndex:34,elevation:22,width:176,borderRadius:15,padding:6,backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border}}>
              <ActionRow label={mapPrefs.pinned.includes(cardMenuId)?'Unpin':'Pin'} icon="pin" onPress={()=>{
                const target=cardMenuId!;setMapPrefs(p=>({...p,pinned:p.pinned.includes(target)?p.pinned.filter(item=>item!==target):[...p.pinned,target]}));setCardMenuId(null);
              }}/>
              <ActionRow label="Labels" icon="label" onPress={()=>{setSelected([cardMenuId!]);setCardMenuId(null);setLabelQuery('');setMoveFolderMenu(true);}}/>
              <ActionRow label="Color" icon="palette" onPress={()=>{setSelected([cardMenuId!]);setManualColor(mapPrefs.cardColors[cardMenuId!]||'');setCardMenuId(null);setColorTarget('cards');}}/>
              <ActionRow label={showArchive?'Unarchive':'Archive'} icon={showArchive?'unarchive':'archive'} onPress={()=>{archiveOne(cardMenuId!,!showArchive);setCardMenuId(null);}}/>
              <ActionRow label="Export PDF" icon="exportIcon" onPress={()=>{exportOne('pdf',cardMenuId!);setCardMenuId(null);}}/>
              <View style={{height:1,backgroundColor:palette.border,marginVertical:3}}/>
              <ActionRow label="Delete" icon="🗑" danger onPress={()=>{removeBranch(cardMenuId!);setCardMenuId(null);}}/>
            </View>}
            {trashMenu&&showTrash&&<View style={[styles.popup,{backgroundColor:palette.surface,borderColor:palette.border,top:56,right:12,zIndex:32,paddingVertical:6,minWidth:220}]}>
              <ActionRow label={selectedTrash.length?'Delete forever':'Empty bin'} icon="🗑" danger onPress={()=>{setTrashMenu(false);if(selectedTrash.length)removeSelectedTrash();else if(trash.length)showDialog('Empty Deleted?','Permanently delete all items in Deleted?',[
                {text:'Cancel',style:'cancel'},
                {text:'Empty Deleted',style:'destructive',onPress:()=>{setTrash([]);setSelectedTrash([]);}}
              ]);}}/>
            </View>}
            {selectionMenu&&selected.length>0&&(
              <View style={[styles.popup,{top:56,right:12,left:undefined,bottom:undefined,width:225,backgroundColor:palette.surface,borderColor:palette.border,zIndex:32}]}>
                <ActionRow icon={showArchive?'unarchive':'archive'} label={showArchive?'Unarchive':'Archive'} onPress={()=>archiveSelection(!showArchive)}/>
                <ActionRow label="Export" icon="exportIcon" onPress={()=>{setSelectionMenu(false);exportSelected();}}/>
                <View style={{height:1,backgroundColor:palette.border,marginVertical:4}}/>
                <ActionRow label="Delete" icon="🗑" danger onPress={()=>{setSelectionMenu(false);deleteSelected();}}/>
              </View>
            )}

                        {sortMenu&&<View style={[styles.bottomSheet,{left:0,right:0,bottom:0,borderRadius:0,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:palette.surface,borderColor:palette.border,padding:16,gap:4}]}>
              <Text style={{fontSize:18,fontWeight:'600',color:palette.text,paddingVertical:10}}>Sort by</Text>
              <View style={{height:1,backgroundColor:palette.border,marginHorizontal:-16}}/>
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
              <InsetSafeAreaView edges={['top','bottom']} style={[styles.screen,{backgroundColor:effectiveTheme==='dark'?palette.background:'#FAF7FE'}]}>
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
                      <MaterialIcon name="label" color={palette.accent}/>
                      <Text style={{flex:1,fontSize:17,color:palette.text}}>{f.name}</Text>
                      <View style={{width:23,height:23,borderRadius:3,borderWidth:2.1,borderColor:all||some?palette.accent:palette.muted,backgroundColor:all?palette.accent:'transparent',alignItems:'center',justifyContent:'center'}}>
                        {all?<Svg width={17} height={17} viewBox="0 0 24 24"><Path d="M4 12l5 5L20 6" fill="none" stroke={keepForeground(palette.accent)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></Svg>:some?<View style={{width:11,height:3,backgroundColor:palette.accent,borderRadius:1}}/>:null}
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
                    <View style={{flexDirection:'row',alignItems:'center',gap:10,padding:8,minHeight:56,borderBottomWidth:1,borderBottomColor:palette.border,backgroundColor:palette.control}}>
                      <IconButton label="×" accessibilityLabel="Cancel new label" onPress={()=>{setCreatingFolder(false);setFolderName('');}}/>
                      <TextInput accessibilityLabel="New label name" autoFocus value={folderName} onChangeText={setFolderName} placeholder="Label name" placeholderTextColor={palette.muted} style={{flex:1,borderBottomWidth:1,borderBottomColor:palette.accent,color:palette.text,fontSize:16}}/>
                      <IconButton label="✓" accessibilityLabel="Create label" onPress={()=>{
                        const nextName=folderName.trim();if(!nextName)return;
                        const newId=id();setFolders(fs=>[...fs,{id:newId,name:nextName}]);
                        if(selected.length)setNotes(ns=>ns.map(note=>selected.includes(note.id)?{...addLabel(note,newId),updatedAt:Date.now()}:note));
                        setCreatingFolder(false);setFolderName('');setLabelManager(false);
                      }}/>
                    </View>
                  ):(
                    <Pressable accessibilityRole="button" accessibilityLabel="Create new label" style={{flexDirection:'row',alignItems:'center',padding:12,gap:16}} onPress={()=>{setEditingFolderId(null);setFolderName('');setCreatingFolder(true);}}>
                      <MaterialIcon name="+" color={palette.text}/><Text style={{color:palette.text,fontSize:16}}>Create new label</Text>
                    </Pressable>
                  )}
                  {folders.map(item=>(
                    <View key={item.id} style={{flexDirection:'row',alignItems:'center',gap:10,padding:8,minHeight:56,borderBottomWidth:1,borderBottomColor:palette.border,backgroundColor:editingFolderId===item.id?palette.control:'transparent'}}>
                      {editingFolderId===item.id?(
                        <>
                          <IconButton label="🗑" accessibilityLabel={'Delete label '+item.name} danger onPress={()=>showDialog('Delete label?', 'Maps assigned this label will remain available.',[
                            {text:'Cancel',style:'cancel'},
                            {text:'Delete',style:'destructive',onPress:()=>{setNotes(ns=>ns.map(n=>hasLabel(n,item.id)?removeLabel(n,item.id):n));setTrash(previous=>previous.map(batch=>({...batch,notes:batch.notes.map(n=>hasLabel(n,item.id)?removeLabel(n,item.id):n)})));setFolders(fs=>fs.filter(x=>x.id!==item.id));if(folderFilter===item.id)setFolderFilter(null);setEditingFolderId(null);}}
                          ])}/>
                          <TextInput accessibilityLabel="Rename label" value={folderName} onChangeText={setFolderName} autoFocus style={{flex:1,borderBottomWidth:1,borderBottomColor:palette.accent,color:palette.text,fontSize:16}}/>
                          <IconButton label="✓" accessibilityLabel="Save label name" onPress={()=>{if(folderName.trim())setFolders(fs=>fs.map(x=>x.id===item.id?{...x,name:folderName.trim()}:x));setEditingFolderId(null);}}/>
                        </>
                      ):(
                        <>
                          <IconButton label="🗑" accessibilityLabel={'Delete label '+item.name} danger onPress={()=>showDialog('Delete label?', 'Maps assigned this label will remain available.',[
                            {text:'Cancel',style:'cancel'},
                            {text:'Delete',style:'destructive',onPress:()=>{setNotes(ns=>ns.map(n=>hasLabel(n,item.id)?removeLabel(n,item.id):n));setTrash(previous=>previous.map(batch=>({...batch,notes:batch.notes.map(n=>hasLabel(n,item.id)?removeLabel(n,item.id):n)})));setFolders(fs=>fs.filter(x=>x.id!==item.id));if(folderFilter===item.id)setFolderFilter(null);setEditingFolderId(null);}}
                          ])}/>
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
                <ScrollView contentContainerStyle={{padding:12}}><View style={{width:'100%',gap:12,padding:8}}>
                  {!mapPrefs.trashRetentionAcknowledged&&trash.length>0&&(
                    <View style={{gap:8,padding:12,borderColor:palette.border,borderWidth:1,borderRadius:14}}>
                      <Text style={{color:palette.text}}>Review existing deleted items before activating the seven-day retention policy.</Text>
                      <Button label="Apply seven-day retention" onPress={acknowledgeTrashRetention}/>
                    </View>
                  )}
                  {trash.length===0?(
                    <View style={{alignItems:'center',justifyContent:'center',paddingVertical:96,gap:12,width:'100%'}}>
                      <Svg width={112} height={112} viewBox="0 0 112 112"><Path d="M28 30h56M42 20h28M34 30l4 63h36l4-63M48 44v36M64 44v36" stroke={palette.muted} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>
                      <Text style={{color:palette.muted,fontSize:16,textAlign:'center'}}>No notes in Deleted</Text>
                    </View>
                  ):<View style={{flexDirection:mapPrefs.viewMode==='grid'?'row':'column',flexWrap:mapPrefs.viewMode==='grid'?'wrap':'nowrap',gap:10,justifyContent:'space-between'}}>{trash.map(batch=>(
                    <Pressable key={batch.id} accessibilityRole="button" accessibilityLabel={'Open deleted map '+(batch.notes[0]?.title||'Untitled')} accessibilityHint="Tap for read-only preview; long press to select"
                      onPress={()=>{if(selectedTrash.length)setSelectedTrash(v=>v.includes(batch.id)?v.filter(x=>x!==batch.id):[...v,batch.id]);else setDeletedPreview(batch);}}
                      onLongPress={()=>setSelectedTrash(v=>v.includes(batch.id)?v:[...v,batch.id])}
                      style={[styles.listRow,{width:mapPrefs.viewMode==='grid'?'48.2%':'100%',minHeight:mapPrefs.viewMode==='grid'?110:66,backgroundColor:displayKeepColor(mapPrefs.cardColors[batch.notes[0]?.id],effectiveTheme,palette.surface),borderColor:selectedTrash.includes(batch.id)?palette.accent:palette.border,borderWidth:selectedTrash.includes(batch.id)?3:1},mapPrefs.viewMode==='grid'&&{alignItems:'stretch',flexDirection:'column',padding:10}]}>
                      <View style={{flex:1,width:'100%'}}>
                        <Text numberOfLines={2} style={[styles.listTitle,{color:keepForeground(displayKeepColor(mapPrefs.cardColors[batch.notes[0]?.id],effectiveTheme,palette.surface))}]}>{batch.notes[0]?.title||'Untitled map'}</Text>
                        {mapPrefs.viewMode==='grid'&&<View style={{overflow:'hidden',borderRadius:10}}>{mapPreview(batch.notes.find(n=>n.parentId==='root')||batch.notes[0],batch.notes)}</View>}
                        {labelIds(batch.notes[0]).length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:7}}>{labelIds(batch.notes[0]).map(labelId=>{const label=folders.find(f=>f.id===labelId)?.name;const chip=keepChipStyle(displayKeepColor(mapPrefs.cardColors[batch.notes[0]?.id],effectiveTheme,palette.surface));return label?<View key={labelId} style={{...chip,borderWidth:1,borderRadius:8,paddingHorizontal:9,paddingVertical:4}}><Text style={{color:chip.color,fontSize:11}}>{label}</Text></View>:null;})}</View>}
                      </View>
                    </Pressable>
                  ))}</View>}
                </View></ScrollView>
              ):(
                <View style={{flex:1}}>
                  <FlatList style={{flex:1}} contentContainerStyle={{gap:10,paddingHorizontal:12,paddingTop:12,paddingBottom:24}}
                    data={libraryChunks} keyExtractor={(_,index)=>'chunk-'+index}
                    initialNumToRender={2} maxToRenderPerBatch={2} windowSize={5} removeClippedSubviews={false}
                    renderItem={({item:chunk})=>{
                     const grid=mapPrefs.viewMode==='grid';
                     const availableWidth=W-24;
                     const gutter=10;
                     const cellWidth=grid?(availableWidth-gutter)/2:availableWidth;
                     const columns=[0,0];
                     const positions=chunk.map((n,index)=>{
                       const column=grid?index%2:0;
                       const top=columns[column];
                       columns[column]+=(libraryCardHeights[n.id]??(grid?152:88))+gutter;
                       return {n,column,top};
                     });
                     const chunkHeight=Math.max(0,...columns)-gutter;
                     return <View style={{height:Math.max(0,chunkHeight),width:'100%',position:'relative'}}>
                      {positions.map(({n,column,top})=>(
                    <LibraryGestureCard key={n.id}
                      position={{top,left:column*(cellWidth+gutter),width:cellWidth}}
                      onMeasure={height=>recordCardHeight(n.id,height)} canSwipe={!showArchive&&selected.length===0} canDrag={librarySort==='custom'&&!showArchive&&(selected.length===0||(selected.length===1&&selected.includes(n.id)))}
                      registerRef={view=>{libraryCardRefs.current[n.id]=view;}}
                      onArchive={()=>archiveOne(n.id,true)}
                      onDragStart={()=>{setDraggingMapId(n.id);setSelected(v=>v.includes(n.id)?v:[...v,n.id]);}}
                      onDragMove={(x,y)=>reorderCard(n.id,x,y)}
                      onDrop={(x,y)=>{reorderCard(n.id,x,y);setDraggingMapId(null);}}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${n.title||'Untitled map'}${mapPrefs.pinned.includes(n.id)?', pinned':''}${selected.includes(n.id)?', selected':''}`}
                      accessibilityHint={librarySort==='custom'?"Tap to open; hold and drag to reorder; swipe to archive":"Tap to open; long press to select; swipe to archive"}
                      style={[styles.listRow,{backgroundColor:displayKeepColor(mapPrefs.cardColors[n.id],effectiveTheme,palette.surface),borderColor:selected.includes(n.id)?palette.accent:palette.border,borderWidth:selected.includes(n.id)?3:1},mapPrefs.viewMode==='grid'&&{width:'100%',alignItems:'stretch',flexDirection:'column',padding:10}]}
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
                          setSidebar(false);setFoldersExpanded(false);
                        }
                      }}
                      onLongPress={()=>
                        setSelected(v=>
                          v.includes(n.id)
                            ?v
                            :[...v,n.id]
                        )
                      }
                    >
                      <View style={{flex:1,width:'100%'}}>
                        <Text style={[styles.listTitle,{color:keepForeground(displayKeepColor(mapPrefs.cardColors[n.id],effectiveTheme,palette.surface)),paddingRight:mapPrefs.pinned.includes(n.id)?80:43}]} numberOfLines={2}>{n.title||'Untitled map'}</Text>
                        {mapPrefs.viewMode==='grid'&&mapPreview(n)}
                         {labelIds(n).length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:7}}>
                         {labelIds(n).map(labelId=>{const name=folders.find(f=>f.id===labelId)?.name;return name?<View key={labelId} style={{...keepChipStyle(displayKeepColor(mapPrefs.cardColors[n.id],effectiveTheme,palette.surface)),borderWidth:1,borderRadius:8,paddingVertical:4,paddingHorizontal:9}}><Text style={{color:keepChipStyle(displayKeepColor(mapPrefs.cardColors[n.id],effectiveTheme,palette.surface)).color,fontSize:11}}>{name}</Text></View>:null;})}
                       </View>}
 
                      </View>

                      {selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel={'More actions for '+(n.title||'Untitled map')} onPress={event=>{
                        event.stopPropagation();
                        setCardMenuPosition({top:Math.max(64,Math.min(H-345,event.nativeEvent.pageY+7)),left:Math.max(8,Math.min(W-185,event.nativeEvent.pageX-162))});
                        setCardMenuId(n.id);
                      }} style={{position:'absolute',right:5,top:4,width:37,height:37,alignItems:'center',justifyContent:'center',zIndex:4}}>
                        <MaterialIcon name="⋮" color={palette.text}/>
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
                      ))}
                     </View>;
                    }}/>

                  {shown.length===0&&!showArchive&&(
                    <View style={{position:'absolute',left:0,right:0,top:44,alignItems:'center',paddingVertical:48,paddingHorizontal:20,gap:12}}>
                      <MaterialIcon name="label" color={palette.muted}/>
                      <Text style={[styles.listTitle,{textAlign:'center',color:palette.text,fontWeight:'600'}]}>{librarySearch.trim()?'No matching maps':folderFilter?'No maps in this label':'Your library is ready'}</Text>
                      <Text style={[styles.muted,{color:palette.muted,textAlign:'center'}]}>{librarySearch.trim()?'No maps match this search. Try different words or clear the search.':folderFilter?'Create a map in this label, or move an existing map here from the library.':'Create your first map to start building your notes.'}</Text>
                      {librarySearch.trim()?<Button label="Clear search" onPress={()=>setLibrarySearch('')}/>:<Button label="Create map" primary onPress={newMap}/>}
                    </View>
                  )}
                </View>
              )}
            </View>
            {showArchive&&shown.length===0&&!showTrash&&<View pointerEvents="box-none" style={{position:'absolute',left:0,right:0,top:96,bottom:0,alignItems:'center',justifyContent:'center',paddingHorizontal:24}}>
              <Svg width={116} height={116} viewBox="0 0 116 116" accessibilityLabel="Empty Archive illustration"><Path d="M23 49h70v48H23z" stroke={palette.muted} fill="none" strokeWidth={3} strokeLinejoin="round"/><Path d="M17 36h82v13H17z" stroke={palette.muted} fill={palette.background} strokeWidth={3} strokeLinejoin="round"/><Path d="M58 56v23m-10-10 10 10 10-10" stroke={palette.muted} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/><Path d="M44 88h28" stroke={palette.muted} strokeWidth={3.5} strokeLinecap="round"/></Svg>
              <Text style={{color:palette.muted,fontSize:16,fontWeight:'500',textAlign:'center',marginTop:14}}>{librarySearch.trim()?'No matching maps':'Your archived maps appear here'}</Text>
            </View>}
            {!showTrash&&!showArchive&&selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel="Create new map" onPress={newMap} style={{position:'absolute',right:22,bottom:26,width:60,height:60,borderRadius:20,backgroundColor:palette.accent,alignItems:'center',justifyContent:'center',elevation:5,zIndex:10}}>
              <Text style={{fontSize:32,color:keepForeground(palette.accent)}}>+</Text>
            </Pressable>}
          {undoOpen&&(undoBatch||pendingBranch)&&(
            <SwipeUndoNotice message={pendingBranch?'Branch deleted':'Moved to Deleted'} onUndo={undoDeletion} onDismiss={clearUndoNotification} bottom={archiveUndoIds.length?150:90}/>
          )}
          {archiveUndoIds.length>0&&(
            <SwipeUndoNotice message={archiveUndoIds.length===1?'Map archived':archiveUndoIds.length+' maps archived'} onUndo={undoArchive} onDismiss={()=>setArchiveUndoIds([])}/>
          )}
          </InsetSafeAreaView></GestureHandlerRootView>
        </Modal>
        <Modal visible={deletedPreview!==null} animationType="slide" onRequestClose={()=>setDeletedPreview(null)}>
          {deletedPreview?<DeletedMapReader batch={deletedPreview} palette={palette} theme={effectiveTheme} colors={mapPrefs.colors} onClose={()=>setDeletedPreview(null)}/>:<View/>}
        </Modal>
        <Modal visible={retentionNotice} transparent animationType="fade" onRequestClose={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));}}>
          <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.55)'}}>
            <View style={{backgroundColor:palette.surface,padding:22,borderRadius:24,gap:16}}>
              <Text style={[styles.section,{color:palette.text}]}>Deleted policy update</Text>
              <Text style={{color:palette.text}}>Deleted notes will be kept for seven days. Existing deleted notes older than seven days may be removed permanently after you activate the policy. Review and restore important notes first.</Text>
              <Button label="Review Deleted" primary onPress={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));setShowTrash(true);setShowArchive(false);setMenu(true);}}/>
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
                    {chosen&&<View style={{position:'absolute',top:-6,right:-7,width:22,height:22,borderRadius:11,backgroundColor:palette.accent,alignItems:'center',justifyContent:'center'}}><MaterialIcon name="✓" color={keepForeground(palette.accent)}/></View>}
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
  primary:{
    backgroundColor:'#b65e4d'
  },
  danger:{
    backgroundColor:'#dc2626'
  },
  buttonText:{
    fontSize:14,
    fontWeight:'700',
    color:'#563f38'
  },
  toolbar:{
    flexDirection:'row',
    flexWrap:'wrap',
    justifyContent:'space-around',
    alignItems:'center',
    gap:6,
    paddingHorizontal:8,
    paddingVertical:7
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
  footer:{
    paddingBottom:12,
    paddingHorizontal:4
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
  listIndex:{
    fontSize:17,
    fontWeight:'800',
    color:'#315fd6'
  },
  listTitle:{
    fontSize:16,
    fontFamily:'Roboto',
    fontWeight:'600',
    color:'#0f172a'
  },
  checkbox:{
    fontSize:25,
    color:'#315fd6'
  }
});
