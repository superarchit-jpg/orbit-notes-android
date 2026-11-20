import React,{useEffect,useMemo,useState,useRef} from 'react';
import {Alert,AppState,BackHandler,Dimensions,KeyboardAvoidingView,useColorScheme,Modal,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Svg,{Line,Circle,Rect,Path} from 'react-native-svg';
import {SafeAreaProvider,SafeAreaView as InsetSafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated,{FadeInLeft,FadeOutLeft,runOnJS,useAnimatedReaction,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';
import {loadSnapshot,saveSnapshot,loadMapPreferences,saveMapPreferences,emptyMapPreferences} from './storage';
import {radialTree,fitMap,pointSegmentDistance} from './mapGeometry';
import {hasPin,isPinLockEnabled,setPinLockEnabled,setPin,checkPin,credentialKind,removePin,biometricEnabled,setBiometricEnabled,biometricAvailable,authenticateBiometric,lockStatus,recordPinAttempt} from './appLock';
import {exportPDF,exportMultipleMapsPDF,Note} from './export';
import {safeExportName,saveExportToAndroid,saveMultiplePDFsToAndroid,ExportFormat} from './localSave';
import * as FileSystem from 'expo-file-system/legacy';
import {saveEncryptedBackup,selectBackupFile,decryptSelectedBackup} from './backup';
import {radialLayout,overviewLayout} from './layout';
import {TrashBatch,deleteBranches,restoreBatch,pruneTrash} from './trash';
import {formatSelection,parseRichLine} from './noteFormatting';
import RichNoteEditor,{RichNoteEditorHandle,RichEditorState} from './RichNoteEditor';
import {labelIds,addLabel,removeLabel,hasLabel,normalizeLabels} from './labels';

const SafeAreaView=InsetSafeAreaView;
const W=Dimensions.get('window').width,H=Dimensions.get('window').height;
const now=Date.now();
const initial:Note[]=[{id:'root',parentId:null,title:'My Notes',body:'',updatedAt:now,folderId:null}];
type Folder={id:string;name:string};
const stamp=(t:number)=>new Date(t).toLocaleString();
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const LIGHT={background:'#ffffff',surface:'#ffffff',control:'#e8eef7',text:'#202124',muted:'#5f6368',border:'#dadce0',accent:'#52658e',canvas:'#ffffff',node:'#e8eef7',subnode:'#f4f6fa',connector:'#9aa4b4'};
const DARK={background:'#202124',surface:'#292a2d',control:'#3c4043',text:'#e8eaed',muted:'#bdc1c6',border:'#5f6368',accent:'#a8c7fa',canvas:'#202124',node:'#414852',subnode:'#363a41',connector:'#80868b'};
const PaletteContext=React.createContext(LIGHT);
const CARD_PALETTE=['#ffffff','#FAAFA9','#F29F75','#FFF8B9','#E2F6D3','#B4DED4','#D5E3EE','#AFCCDC','#D3BFDB','#F5E2DC','#E9E3D3','#EFEFF1'];

const Button=({label,onPress,primary=false,danger=false,active=false}:{label:string;onPress:()=>void;primary?:boolean;danger?:boolean;active?:boolean})=>{const palette=React.useContext(PaletteContext);return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.button,{backgroundColor:active?palette.control:'transparent'},primary&&{backgroundColor:palette.accent}]}><Text style={[styles.buttonText,{color:danger?'#dc2626':active?palette.accent:palette.text},primary&&{color:'white'}]}>{label==='🗑'?<Svg width={23} height={23} viewBox="0 0 24 24"><Line x1={4} y1={7} x2={20} y2={7} stroke="#dc2626" strokeWidth={1.8}/><Line x1={9} y1={4} x2={15} y2={4} stroke="#dc2626" strokeWidth={1.8}/><Rect x={6} y={7} width={12} height={14} rx={2} stroke="#dc2626" strokeWidth={1.8} fill="none"/><Line x1={10} y1={11} x2={10} y2={17} stroke="#dc2626" strokeWidth={1.5}/><Line x1={14} y1={11} x2={14} y2={17} stroke="#dc2626" strokeWidth={1.5}/></Svg>:label}</Text></Pressable>;}

const ICON_PATHS:Record<string,string>={
  '☰':'M4 6h16M4 12h16M4 18h16',
  '✓':'M4 12l5 5L20 6',
  'search':'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM17 17l5 5',
  '←':'M20 12H4m7-7-7 7 7 7',
  '⋮':'M12 5h.01M12 12h.01M12 19h.01',
  '×':'M5 5l14 14M19 5L5 19',
  '+':'M12 4v16M4 12h16',
  '✎':'M4 20l4-1 11-11-3-3L5 16l-1 4M14 7l3 3',
  '🗑':'M4 7h16M9 4h6M7 7v13h10V7M10 11v6M14 11v6',
  '☆':'M12 2l3.1 6.4 7.1 1.1-5.1 5 .9 7-6-3.3-6 3.3.9-7-5.1-5 7.1-1.1L12 2z',
  '★':'M12 2l3.1 6.4 7.1 1.1-5.1 5 .9 7-6-3.3-6 3.3.9-7-5.1-5 7.1-1.1L12 2z',
  '☑':'M3 3h18v18H3zM7 12l3 3 7-7',
  'selectAll':'M5 5h14v14H5zM8 12l3 3 5-6',
  '☷':'M5 6h14M5 12h14M5 18h14',
  '▦':'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  'Fit':'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  'listView':'M4 4h16v7H4zM4 14h16v7H4z',
  'sort':'M4 6h12M4 12h9M4 18h6M19 6v12m-3-3 3 3 3-3',
  'pin':'M8 3h8v2l-1.5 2v5l3 3v1H6v-1l3-3V7L8 5zM12 16v6',
  'label':'M4 5h11l6 7-6 7H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM7 12h.01',
  'archive':'M3 4h18v5H3zM5 10h14v10H5zM9 14h6',
  'unarchive':'M3 4h18v5H3zM5 10h14v10H5zM9 16h6M12 11v8m-4-4 4-4 4 4',
  'exportIcon':'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',
  'readIcon':'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  'childIcon':'M12 3v11m-5-5 5 5 5-5M5 20h14',
  'allMaps':'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'settingsIcon':'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  'centerFocus':'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  'parentNote':'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 13c0-5 12-5 12 0v2H6zM12 15v3M4 18h16M4 18v2M12 18v2M20 18v2',
  'miniMapIcon':'M5 12h14M12 5v14M12 12m-7 5-2 2m16-2 2 2M12 5a3 3 0 1 0 0 6M5 16a2 2 0 1 0 0 4M19 16a2 2 0 1 0 0 4',
  'restoreIcon':'M3 11v-7h7M3 4l6 6M4 13a8 8 0 1 0 7-9',
  'gridView':'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  'palette':'M12 3a9 9 0 1 0 0 18h1.2c1.1 0 1.9-.9 1.9-2 0-.7-.4-1.3-.8-1.8-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2H19A7 7 0 0 0 12 3zM6.9 12h.01M8.5 7.9h.01M13.4 6.8h.01M17.1 9.4h.01',
  'collapseBranch':'M5 12h14M12 5l7 7-7 7',
  'expandBranch':'M5 4l7 7 7-7M12 11v9M4 15v5h5M20 15v5h-5',
  'bullets':'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  'numbers':'M9 6h12M9 12h12M9 18h12M3 4h2v4M3 12h2l-2 3h2M3 17h2v4H3'
};
const MaterialIcon=({name,color}:{name:string;color:string})=>{
  if(['bold','italic','underline'].includes(name))return <Text style={{fontSize:21,color,fontWeight:name==='bold'?'900':'600',fontStyle:name==='italic'?'italic':'normal',textDecorationLine:name==='underline'?'underline':'none'}}>{name==='bold'?'B':name==='italic'?'I':'U'}</Text>;
  const data=ICON_PATHS[name];
  return data?<Svg width={23} height={23} viewBox="0 0 24 24"><Path d={data} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>{name==='centerFocus'&&<Circle cx={12} cy={12} r={3.6} fill={color}/>}</Svg>:<Text style={{fontSize:name==='Fit'?14:22,color,fontWeight:'700'}}>{name}</Text>;
};
const Upright=({angle,children}:{angle:SharedValue<number>;children:React.ReactNode})=>{
  const style=useAnimatedStyle(()=>({transform:[{rotateZ:`${-angle.value}rad`}]}));
  return <Animated.View style={[{alignItems:'center',justifyContent:'center'},style]}>{children}</Animated.View>;
};

const IconButton=({label,onPress,danger=false,active=false,accessibilityLabel}:{label:string;onPress:()=>void;danger?:boolean;active?:boolean;accessibilityLabel?:string})=>{
  const palette=React.useContext(PaletteContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel||label} accessibilityState={{selected:active}} onPress={onPress} style={{paddingHorizontal:12,paddingVertical:10,minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:active?palette.control:'transparent'}}>
    <MaterialIcon name={label} color={danger?'#dc2626':palette.text}/>
  </Pressable>;
};

const ActionRow=({label,icon,onPress,danger=false}:{label:string;icon:string;onPress:()=>void;danger?:boolean})=>{
  const theme=React.useContext(PaletteContext);
  const foreground=danger?'#dc2626':theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:52,flexDirection:'row',alignItems:'center',gap:18,paddingHorizontal:14,borderRadius:12}}>
    <MaterialIcon name={icon} color={foreground}/>
    <Text style={{fontSize:16,color:foreground,flex:1}}>{label}</Text>
  </Pressable>;
};

export default function App(){
const [notes,setNotes]=useState<Note[]>(initial),[folders,setFolders]=useState<Folder[]>([]),[focused,setFocused]=useState('root'),[overview,setOverview]=useState(false),[menu,setMenu]=useState(true),[reader,setReader]=useState<string|null>(null),[editing,setEditing]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[folderName,setFolderName]=useState(''),[creatingFolder,setCreatingFolder]=useState(false),[selected,setSelected]=useState<string[]>([]),[folderFilter,setFolderFilter]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState<string|null>(null),[trash,setTrash]=useState<TrashBatch[]>([]),[showTrash,setShowTrash]=useState(false),[undoBatch,setUndoBatch]=useState<string|null>(null);

const [mapPrefs,setMapPrefs]=useState(emptyMapPreferences);
const [pendingBranch,setPendingBranch]=useState<TrashBatch|null>(null);
const [undoOpen,setUndoOpen]=useState(false);
const [trashMenu,setTrashMenu]=useState(false);
const [themeMenu,setThemeMenu]=useState(false);
const [labelManager,setLabelManager]=useState(false);
const bioPromptInProgress=useRef(false),bioPrompted=useRef(false);
const richEditorRef=useRef<RichNoteEditorHandle|null>(null);
const [editorFormats,setEditorFormats]=useState<RichEditorState>({bold:false,italic:false,underline:false,bullets:false,numbers:false});
const [colorTarget,setColorTarget]=useState<'cards'|'note'|null>(null);
const deviceTheme=useColorScheme();
const effectiveTheme=mapPrefs.themeMode==='system'?(deviceTheme==='dark'?'dark':'light'):mapPrefs.theme;
const palette=effectiveTheme==='dark'?DARK:LIGHT;
const [showMiniMap,setShowMiniMap]=useState(false);
const [gestureHelp,setGestureHelp]=useState(false);
const [nodeActions,setNodeActions]=useState<string|null>(null);
const [draftChildId,setDraftChildId]=useState<string|null>(null);
const [readerTapAt,setReaderTapAt]=useState(0);
const [textSelection,setTextSelection]=useState({start:0,end:0});
const [librarySearch,setLibrarySearch]=useState('');
const [zoomPercent,setZoomPercent]=useState(100);
const [librarySort,setLibrarySort]=useState<'modified'|'title'|'created'>('modified');
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
           <Pressable key={index} accessibilityRole="button" accessibilityLabel={action.text} onPress={()=>{setAppDialog(null);action.onPress?.();}} style={{paddingHorizontal:12,paddingVertical:12}}><Text style={{color:action.style==='destructive'?'#dc2626':palette.accent,fontWeight:'600',fontSize:15}}>{action.text}</Text></Pressable>
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

const [credentialType,setCredentialType]=useState<'pin'|'password'>('pin'),[storedCredentialType,setStoredCredentialType]=useState<'pin'|'password'>('pin'),[appActive,setAppActive]=useState(AppState.currentState==='active'),[locked,setLocked]=useState(true),[pinConfigured,setPinConfigured]=useState(false),[pinLockEnabled,setPinLockEnabledState]=useState(false),[pinInput,setPinInput]=useState(''),[pinSetup,setPinSetup]=useState(''),[pinOld,setPinOld]=useState(''),[pinNew,setPinNew]=useState(''),[pinAction,setPinAction]=useState<'change'|'delete'|null>(null),[pinAttempts,setPinAttempts]=useState(0),[blockedUntil,setBlockedUntil]=useState(0),[settings,setSettings]=useState(false),[biometrics,setBiometrics]=useState(false);

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
          setTrash(preferences.trashRetentionAcknowledged?pruneTrash(existing.trash):existing.trash);
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
         setStoredCredentialType(kind);setCredentialType(kind);
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
    // Android biometric prompts can temporarily deactivate the app; do not relock or cancel that prompt.
    if(bioPromptInProgress.current)return;
    setAppActive(state==='active');
     if(state!=='active')bioPrompted.current=false;
     if(state!=='active'&&pinLockEnabled){
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
    if(valid)setLocked(false);
    else showDialog('Incorrect PIN',next.blockedUntil>Date.now()?'Try again in one minute.':'Please try again.');
  }catch(e){
    showDialog('Unlock error',String(e));
  }
};

const enablePin=async()=>{
  try{
    if(pinConfigured)await setPinLockEnabled(true);
    else {await setPin(pinSetup,credentialType);setPinConfigured(true);setStoredCredentialType(credentialType);}
    setPinLockEnabledState(true);
    setPinSetup('');
    showDialog('App lock enabled','Your existing PIN will be required after leaving the app.');
  }catch(e){
    showDialog('Cannot enable PIN lock',String(e));
  }
};

const disablePin=()=>showDialog('Disable app lock?','Your PIN will remain saved. You can enable the lock again without resetting it.',[
  {text:'Cancel'},
  {text:'Disable',style:'destructive',onPress:async()=>{
    try{
      await setPinLockEnabled(false);
      setPinLockEnabledState(false);
      setLocked(false);
    }catch(e){showDialog('Unable to disable lock',String(e));}
  }}
]);
const confirmPinChange=async()=>{
  try{
    const status=await lockStatus();
    if(Date.now()<status.blockedUntil){showDialog('Try again later','PIN changes are temporarily blocked.');return;}
    const valid=await checkPin(pinOld);
    await recordPinAttempt(valid);
    if(!valid){showDialog('Incorrect PIN','Enter your current PIN to continue.');return;}
    if(pinAction==='change'){
      await setPin(pinNew,credentialType);
      setStoredCredentialType(credentialType);
      // Updating a PIN does not alter the existing enabled/disabled choice.
      await setPinLockEnabled(pinLockEnabled);
      showDialog('PIN changed','Your updated PIN is stored on this device.');
    }else if(pinAction==='delete'){
      await removePin();
      setPinConfigured(false);
      setPinLockEnabledState(false);
      setLocked(false);
      setBiometrics(false);
      showDialog('PIN deleted','App lock is no longer configured.');
    }
    setPinOld('');setPinNew('');setPinAction(null);
  }catch(e){showDialog('PIN change failed',String(e));}
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
  // Back/dismiss preserves the approved automatic-save behavior.
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
  cancelReader();
};

// Debounced local autosave preserves edits if Android suspends the app.
useEffect(()=>{
  if(!loaded||!editing||!reader)return;
  const targetId=reader;
  const timer=setTimeout(()=>{
    setNotes(ns=>{
      const old=ns.find(n=>n.id===targetId);
      if(!old||old.title===title.trim()&&old.body===body)return ns;
      return ns.map(n=>n.id===targetId?{...n,title:title.trim(),body,updatedAt:Date.now()}:n);
    });
  },500);
  return ()=>clearTimeout(timer);
},[loaded,editing,reader,title,body]);

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

const deleteSelected=()=>{
  const ids=selected.filter(x=>x!=='root');
  if(!ids.length)return;
  const result=deleteBranches(notes,ids);
  if(!result.batch.notes.length)return;
  showDialog('Move to Recently Deleted',`Move ${result.batch.notes.length} note(s), including descendants, to Recently Deleted?`,[
    {text:'Cancel',style:'cancel'},
    {text:'Move',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
       setMapPrefs(p=>({...p,archived:p.archived.filter(item=>!result.batch.notes.some(n=>n.id===item))}));
      setTrash(t=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...t]):[result.batch,...t]);
      setUndoBatch(result.batch.id);setPendingBranch(null);setUndoOpen(true);
      if(result.batch.notes.some(n=>n.id===focused))setFocused('root');
      setSelected([]);
      setReader(null);
    }}
  ]);
};

useEffect(()=>{
  if(!undoOpen)return;
  const timer=setTimeout(()=>{setUndoOpen(false);setUndoBatch(null);setPendingBranch(null);},5000);
  return()=>clearTimeout(timer);
},[undoOpen,undoBatch,pendingBranch]);
const removeBranch=(target:string)=>{
  if(target==='root')return;
  const result=deleteBranches(notes,[target]);
  if(!result.batch.notes.length)return;
  showDialog('Move note to Recently Deleted?', 'This note and its descendants can be restored for seven days after the retention policy is activated.',[
    {text:'Cancel',style:'cancel'},
    {text:'Move',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
      setMapPrefs(p=>({...p,archived:p.archived.filter(item=>!result.batch.notes.some(n=>n.id===item))}));
      setTrash(t=>mapPrefs.trashRetentionAcknowledged?pruneTrash([result.batch,...t]):[result.batch,...t]);
      setPendingBranch(null);
      setUndoBatch(result.batch.id);
      setUndoOpen(true);
      if(result.batch.notes.some(n=>n.id===focused))setFocused(notes.find(n=>n.id===target)?.parentId||'root');
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
    if(reader||settings||backupMode||exportKind)return false;
    if(menu){
      BackHandler.exitApp();
      return true;
    }
    setMenu(true);
    setMapMenu(false);
    return true;
  });
  return()=>sub.remove();
},[menu,reader,settings,backupMode,exportKind]);

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
const fullMap=useMemo(()=>radialTree(mapRoot,notes,mapPrefs.offsets,mapPrefs.collapsed,focused),
  [mapRoot,notes,mapPrefs.offsets,mapPrefs.collapsed,focused]);
const visible=useMemo(()=>{
  const focus=fullMap.find(n=>n.note.id===focused);
  const depth=focus?.level||0;
  const ancestors=new Set<string>();
  let id=focused;
  while(id&&!ancestors.has(id)){
    ancestors.add(id);
    id=notes.find(n=>n.id===id)?.parentId||'';
  }
  return fullMap.filter(n=>n.level<=1||ancestors.has(n.note.id)||
    (ancestors.has(n.note.parentId||'')&&n.level<=depth+1));
},[fullMap,focused,notes]);

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
const fitCurrentMap=()=>{
  const fit=fitMap(visible,canvasW,canvasH);
  tx.value=withTiming(fit.x*1.1);
  ty.value=withTiming(fit.y*1.1);
  scale.value=withTiming(fit.scale*1.1);
  rotation.value=withTiming(0);
};
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
          backgroundColor:mapPrefs.colors[n.id]|| (n.id===focused?palette.accent:level<=1?palette.node:palette.subnode),
          borderColor:n.id===focused?palette.accent:palette.border
        }
      ]}>
        <Upright angle={rotation}>
          <Text
            numberOfLines={2}
            style={[
              styles.nodeTitle,
              {
                color:n.id===focused&&!mapPrefs.colors[n.id]?'#ffffff':palette.text,
                fontSize:level>=2?14:16
              }
            ]}
          >
            {n.title}
          </Text>
          {Boolean(n.body.trim())&&(
            <Text style={{
              color:n.id===focused&&!mapPrefs.colors[n.id]?'#fff0e9':palette.muted,
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
const mapPreview=(root:Note)=>{
  const points=radialTree(root,notes,mapPrefs.offsets);
  const visiblePoints=points.slice(0,90);
  const thumbnailHeight=Math.min(244,Math.max(142,110+Math.ceil(Math.log2(points.length+1))*24));
  // Thumbnail framing must not inherit the interactive canvas's minimum zoom.
  const bounds=points.reduce((v,p)=>({
    minX:Math.min(v.minX,p.x),maxX:Math.max(v.maxX,p.x),
    minY:Math.min(v.minY,p.y),maxY:Math.max(v.maxY,p.y)
  }),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  const thumbScale=Math.min(140/Math.max(1,bounds.maxX-bounds.minX),(thumbnailHeight-22)/Math.max(1,bounds.maxY-bounds.minY),1);
  const thumbX=80-(bounds.minX+bounds.maxX)*thumbScale/2;
  const thumbY=thumbnailHeight/2-(bounds.minY+bounds.maxY)*thumbScale/2;
  const byId=new Map(visiblePoints.map(v=>[v.note.id,v]));
  return (
    <Svg width="100%" height={thumbnailHeight} viewBox={`0 0 160 ${thumbnailHeight}`} accessibilityLabel={`Preview of ${root.title||'untitled map'}`}>
      {visiblePoints.map(v=>{
        const parent=byId.get(v.note.parentId||'');
        return parent?<Line key={v.note.id} x1={thumbX+parent.x*thumbScale} y1={thumbY+parent.y*thumbScale} x2={thumbX+v.x*thumbScale} y2={thumbY+v.y*thumbScale} stroke={palette.connector} strokeWidth={1.2}/>:null;
      })}
      {visiblePoints.map(v=><Circle key={v.note.id} cx={thumbX+v.x*thumbScale} cy={thumbY+v.y*thumbScale} r={v.note.id===root.id?4:2.7} fill={mapPrefs.colors[v.note.id]|| (v.note.id===root.id?palette.accent:palette.node)} stroke={palette.border} strokeWidth={0.8}/>)}
    </Svg>
  );
};
const applyNoteFormat=(kind:'bold'|'italic'|'underline'|'bullets'|'numbers'|'clear')=>{if(richEditorRef.current)richEditorRef.current.format(kind);else if(kind!=='clear')setBody(value=>formatSelection(value,textSelection.start,textSelection.end,kind));};
const noteBodyView=(value:string)=>value.split('\n').map((line,index)=>(
  <View key={index} style={{minHeight:28}}>
    <Text style={{fontSize:17,lineHeight:27,color:palette.text}}>{parseRichLine(line).map((run,i)=><Text key={i} style={{fontWeight:run.bold?'700':'400',fontStyle:run.italic?'italic':'normal',textDecorationLine:run.underline?'underline':'none'}}>{run.text}</Text>)}</Text>
  </View>
));
const listNotes=notes.filter(n=>n.parentId==='root'&&(showArchive?mapPrefs.archived.includes(n.id):!mapPrefs.archived.includes(n.id)));
const shown=listNotes.filter(n=>(!folderFilter||hasLabel(n,folderFilter))&&n.title.toLowerCase().includes(librarySearch.toLowerCase())).sort((a,b)=>Number(mapPrefs.pinned.includes(b.id))-Number(mapPrefs.pinned.includes(a.id))||(librarySort==='title'?a.title.localeCompare(b.title):librarySort==='created'?Number(a.id.split('-')[0])-Number(b.id.split('-')[0]):b.updatedAt-a.updatedAt));

const archiveSelection=(archive:boolean)=>{
  const targetIds=new Set(selected.filter(x=>x!=='root'));
  setMapPrefs(p=>({...p,archived:archive?[...new Set([...p.archived,...targetIds])]:p.archived.filter(x=>!targetIds.has(x))}));
  setSelected([]);setSelectionMenu(false);
};
const archiveOne=(id:string,archive:boolean)=>{
  setMapPrefs(p=>({...p,archived:archive?[...new Set([...p.archived,id])]:p.archived.filter(x=>x!==id)}));
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
        for(const root of roots)files.push({uri:await exportPDF(root,notes),name:root.title});
        const count=await saveMultiplePDFsToAndroid(files);
        if(count){setExportKind(null);showDialog('PDFs saved',`${count} separate PDF files saved to the selected folder.`);}
        else showDialog('Save cancelled','No files were saved.');
      }finally{
        for(const file of files){try{await FileSystem.deleteAsync(file.uri,{idempotent:true});}catch{}}
      }
      return;
    }
    tempUri=exportTarget==='__selection__'
      ?await exportMultipleMapsPDF(notes.filter(n=>selected.includes(n.id)),notes)
      :await exportPDF(notes.find(n=>n.id===exportTarget)||current,notes);

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
        await saveSnapshot(restored);
        setNotes(normalizeLabels(restored.notes));
        setFolders(restored.folders);
        setTrash(restored.trash);
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
      <Text style={[styles.logo,{color:palette.text}]}>◉ Orbit Notes</Text>
      <Text style={[styles.section,{color:palette.text}]}>Unlock your private notebook</Text>

      <TextInput
        secureTextEntry
        keyboardType={storedCredentialType==='pin'?'number-pad':'default'}
        autoCapitalize="none"
        maxLength={12}
        value={pinInput}
        onChangeText={setPinInput}
        placeholder={storedCredentialType==='pin'?'Enter app PIN':'Enter app password'}
        placeholderTextColor={palette.muted}
        style={[styles.input,{backgroundColor:palette.surface,color:palette.text,borderColor:palette.border}]}
      />

      <Button
        label={storedCredentialType==='pin'?'Unlock with PIN':'Unlock with password'}
        primary
        onPress={unlock}
      />

      {biometrics&&(
        <Button
          label="Use biometrics"
          onPress={async()=>{
            if(await authenticateBiometric()){
              setLocked(false);
            }else{
              showDialog(
                'Unlock unsuccessful',
                'Use your PIN to unlock.'
              );
            }
          }}
        />
      )}

      <Text style={styles.muted}>
        No account or internet connection is required.
        If you forget your PIN, recovery is not currently supported.
      </Text>
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
        {nodeActions&&<View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:8}]}>
          <Text style={{fontWeight:'700',color:palette.text}} numberOfLines={2}>{notes.find(n=>n.id===nodeActions)?.title||'Note actions'}</Text>
          <ActionRow label="Read note" icon="readIcon" onPress={()=>{openReader(nodeActions);setNodeActions(null);}}/>
          <ActionRow label="Edit note" icon="✎" onPress={()=>{beginEdit(nodeActions);setNodeActions(null);}}/>
          <ActionRow label="Add child" icon="childIcon" onPress={()=>{addChild(nodeActions);setNodeActions(null);}}/>
          <Button label="Move up a level" onPress={()=>{reparent(nodeActions,'up');setNodeActions(null);}}/>
          <Button label="Move down a level" onPress={()=>{reparent(nodeActions,'down');setNodeActions(null);}}/>
          {notes.find(n=>n.id===nodeActions)?.parentId==='root'&&<ActionRow icon={mapPrefs.archived.includes(nodeActions)?'unarchive':'archive'} label={mapPrefs.archived.includes(nodeActions)?'Unarchive map':'Archive map'} onPress={()=>{archiveOne(nodeActions,!mapPrefs.archived.includes(nodeActions));setNodeActions(null);setMenu(true);setShowArchive(false);}}/>}
          <ActionRow label="Delete branch" icon="🗑" danger onPress={()=>{removeBranch(nodeActions);setNodeActions(null);}}/>
          <Button label="Cancel" onPress={()=>setNodeActions(null)}/>
        </View>}
        {mapMenu&&(
          <View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border}]}>
            <ActionRow label="Export" icon="exportIcon" onPress={()=>{setMapMenu(false);exportOne('pdf');}}/>
            {current.parentId==='root'&&<ActionRow icon={mapPrefs.archived.includes(current.id)?'unarchive':'archive'} label={mapPrefs.archived.includes(current.id)?'Unarchive':'Archive'} onPress={()=>{archiveOne(current.id,!mapPrefs.archived.includes(current.id));setMapMenu(false);setMenu(true);setShowArchive(false);}}/>}
            <Button label="Help" onPress={()=>{setGestureHelp(true);setMapMenu(false);}}/>
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
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <IconButton label={mapPrefs.collapsed[focused]?'expandBranch':'collapseBranch'} accessibilityLabel={mapPrefs.collapsed[focused]?'Expand branch':'Collapse branch'} onPress={()=>setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:!p.collapsed[focused]}}))}/>
            <IconButton label="palette" accessibilityLabel="Node color" onPress={()=>setMapPrefs(p=>{const colors=['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#e9d5ff'];const current=p.colors[focused]||colors[0];return {...p,colors:{...p.colors,[focused]:colors[(colors.indexOf(current)+1)%colors.length]}};})}/>
            <IconButton label="⋮" accessibilityLabel="More map actions" onPress={()=>setMapMenu(v=>!v)}/>
          </View>
        </View>}
          {!menu&&showMiniMap&&<View style={{height:150,marginHorizontal:12,marginBottom:6,backgroundColor:palette.surface,borderColor:palette.border,borderWidth:1,borderRadius:16,overflow:'hidden',padding:10}}><Text style={styles.muted}>Map overview · {completeMap.length} notes</Text><Svg width="100%" height={118} viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet">{miniLines.map(l=><Line key={l.id} x1={l.x1*miniBounds.scale+miniBounds.dx} y1={l.y1*miniBounds.scale+miniBounds.dy} x2={l.x2*miniBounds.scale+miniBounds.dx} y2={l.y2*miniBounds.scale+miniBounds.dy} stroke={palette.connector} strokeWidth={2}/>)}{completeMap.map(v=><Circle key={v.note.id} cx={v.x*miniBounds.scale+miniBounds.dx} cy={v.y*miniBounds.scale+miniBounds.dy} r={v.note.id===focused?5:3.5} fill={v.note.id===focused?palette.accent:palette.muted}/>)}</Svg></View>}

        {undoOpen&&(undoBatch||pendingBranch)&&(
          <GestureDetector gesture={Gesture.Pan().activeOffsetX([-20,20]).onEnd(e=>{if(Math.abs(e.translationX)>55){runOnJS(setUndoOpen)(false);runOnJS(setUndoBatch)(null);runOnJS(setPendingBranch)(null);}})}>
          <View style={{position:'absolute',bottom:74,left:16,right:16,zIndex:42,backgroundColor:palette.control,borderRadius:12,padding:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
            <Text style={{color:palette.text,flex:1}}>Deleted</Text>
            <Button
              label="Undo deletion"
              onPress={()=>{
                if(pendingBranch){setNotes(ns=>restoreBatch(ns,pendingBranch));setPendingBranch(null);}
                else {const batch=trash.find(t=>t.id===undoBatch);if(batch)restore(batch);}
                setUndoBatch(null);setUndoOpen(false);
              }}
            />
          </View>
          </GestureDetector>
        )}
        <Modal visible={gestureHelp} transparent animationType="fade" onRequestClose={()=>setGestureHelp(false)}>
          <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.35)'}}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss gesture help" onPress={()=>setGestureHelp(false)}/>
            <View style={{backgroundColor:palette.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,gap:12}}>
              <Text style={[styles.section,{color:palette.text}]}>Map gestures</Text>
              <Text style={{color:palette.text,fontSize:15,lineHeight:24}}>Tap to focus a node.{"\n"}Double-tap to read.{"\n"}Triple-tap to edit.{"\n"}Long-press for note actions.{"\n"}Drag around a branch to rotate children.{"\n"}Use two fingers to zoom or rotate the map.{"\n"}Fit shows the visible map.</Text>
              <Button label="Close" onPress={()=>setGestureHelp(false)}/>
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


        <Modal
          visible={settings}
          animationType="slide"
          onRequestClose={()=>setSettings(false)}
        >
          <SafeAreaView style={[styles.screen,{backgroundColor:palette.background}]}>
            <ScrollView contentContainerStyle={{padding:20,gap:18,paddingBottom:42}}>
            <View style={styles.header}>
              <Text style={[styles.logo,{color:palette.text}]}>Privacy & App Lock</Text>
              <Button
                label="Done"
                onPress={()=>setSettings(false)}
              />
            </View>

            <Text style={[styles.muted,{color:palette.muted}]}>
              All notes remain on this device. No cloud services
              or online accounts.
            </Text>

            <View style={{backgroundColor:palette.surface,padding:12,gap:8}}>
              <Text style={[styles.section,{color:palette.text}]}>Display options</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Theme" onPress={()=>setThemeMenu(true)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:54,paddingHorizontal:12}}>
                <Text style={{color:palette.text,fontSize:16}}>Theme</Text>
                <Text style={{color:palette.muted}}>{mapPrefs.themeMode==='system'?'System Default':mapPrefs.themeMode==='dark'?'Dark':'Light'}</Text>
              </Pressable>
            </View>
            <Modal visible={themeMenu} transparent animationType="fade" onRequestClose={()=>setThemeMenu(false)}>
              <View style={{flex:1,justifyContent:'center',padding:28,backgroundColor:'rgba(0,0,0,0.38)'}}>
                <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss theme options" onPress={()=>setThemeMenu(false)}/>
                <View style={{backgroundColor:palette.surface,borderRadius:24,padding:20,gap:12}}>
                  <Text style={{color:palette.text,fontSize:19,fontWeight:'600'}}>Theme</Text>
                  {(['light','dark','system'] as const).map(choice=>(
                    <Pressable key={choice} accessibilityRole="button" accessibilityState={{selected:mapPrefs.themeMode===choice}} onPress={()=>{setMapPrefs(p=>({...p,themeMode:choice,theme:choice==='system'?p.theme:choice}));setThemeMenu(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,minHeight:50}}>
                      <Text style={{color:palette.accent,fontSize:19}}>{mapPrefs.themeMode===choice?'◉':'○'}</Text>
                      <Text style={{color:palette.text,fontSize:16}}>{choice==='system'?'System Default':choice==='light'?'Light':'Dark'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Modal>
            <Text style={[styles.section,{color:palette.text}]}>Security</Text>
            <View style={{backgroundColor:palette.surface,borderColor:palette.border,borderWidth:1,borderRadius:20,padding:16,gap:12}}>
            {!pinConfigured?(
              <>
                <Text style={[styles.section,{color:palette.text}]}>
                  Enable optional app lock
                </Text>
                <View style={styles.wrap}><Button label="Numeric PIN" active={credentialType==='pin'} onPress={()=>setCredentialType('pin')}/><Button label="Alphanumeric password" active={credentialType==='password'} onPress={()=>setCredentialType('password')}/></View>
                <TextInput
                  secureTextEntry
                  keyboardType={credentialType==='pin'?'number-pad':'default'}
                  autoCapitalize="none"
                  maxLength={12}
                  value={pinSetup}
                  onChangeText={setPinSetup}
                  placeholder={credentialType==='pin'?'Choose a 4–6 digit PIN':'Choose a 6–12 character password'}
                  style={[styles.input,{backgroundColor:palette.background,color:palette.text,borderColor:palette.border}]}
                />
                <Button
                  label="Enable app lock"
                  primary
                  onPress={enablePin}
                />
              </>
            ):(
              <>
                <Text style={[styles.section,{color:palette.text}]}>
                  {pinLockEnabled?'App lock enabled':'PIN saved · App lock disabled'}
                </Text>
                {pinLockEnabled&&<Button
                  label="Lock now"
                  onPress={()=>{
                    bioPrompted.current=false;
                    setSettings(false);
                    setLocked(true);
                  }}
                />}
                <Button
                  label={biometrics
                    ?'Disable biometric unlock'
                    :'Enable biometric unlock'}
                  onPress={async()=>{
                    try{
                      if(!biometrics&&!await biometricAvailable()){
                        showDialog(
                          'Unavailable',
                          'Set up device biometrics first.'
                        );
                        return;
                      }
                      await setBiometricEnabled(!biometrics);
                      setBiometrics(!biometrics);
                    }catch(e){
                      showDialog('Biometrics',String(e));
                    }
                  }}
                />
                <Button label={pinLockEnabled?'Disable app lock':'Enable app lock'} onPress={pinLockEnabled?disablePin:enablePin}/>
                <Button label="Change PIN / password" onPress={()=>{setPinAction('change');setPinOld('');setPinNew('');}}/>
                <Button label="Delete stored PIN" danger onPress={()=>{setPinAction('delete');setPinOld('');setPinNew('');}}/>
                {pinAction&&<View style={{gap:10}}>
                  <Text style={{color:palette.text,fontWeight:'700'}}>{pinAction==='change'?'Change credentials':'Delete stored credentials'}</Text>
                  <TextInput accessibilityLabel="Current credential" secureTextEntry keyboardType={storedCredentialType==='pin'?'number-pad':'default'} autoCapitalize="none" placeholder="Current PIN or password" value={pinOld} onChangeText={setPinOld} maxLength={12} style={[styles.input,{color:palette.text,borderColor:palette.border}]}/>
                  {pinAction==='change'&&<View style={{gap:8}}>
                    <View style={styles.wrap}><Button label="Numeric PIN" active={credentialType==='pin'} onPress={()=>setCredentialType('pin')}/><Button label="Alphanumeric password" active={credentialType==='password'} onPress={()=>setCredentialType('password')}/></View>
                    <TextInput accessibilityLabel="New credential" secureTextEntry keyboardType={credentialType==='pin'?'number-pad':'default'} autoCapitalize="none" placeholder={credentialType==='pin'?'New 4–6 digit PIN':'New 6–12 character password'} value={pinNew} onChangeText={setPinNew} maxLength={12} style={[styles.input,{color:palette.text,borderColor:palette.border}]}/>
                  </View>}
                  <Button label={pinAction==='change'?'Save new PIN':'Confirm PIN deletion'} danger={pinAction==='delete'} primary={pinAction==='change'} onPress={()=>{
                    if(pinAction==='delete')showDialog('Delete your stored PIN?','PIN and biometric unlock settings will be erased.',[{text:'Cancel'},{text:'Delete PIN',style:'destructive',onPress:confirmPinChange}]);
                    else confirmPinChange();
                  }}/>
                  <Button label="Cancel PIN action" onPress={()=>{setPinAction(null);setPinOld('');setPinNew('');}}/>
                </View>}
              </>
            )}

            </View>
            <View style={{backgroundColor:palette.surface,borderColor:palette.border,borderWidth:1,borderRadius:20,padding:16,gap:12}}>
            <Text style={[styles.section,{color:palette.text}]}>
              Back up
            </Text>
            <Text style={[styles.muted,{color:palette.muted}]}>
              Backups are encrypted with your password and saved
              to a folder you choose. Restore replaces the current
              notebook. No cloud or sharing.
            </Text>
            <View style={styles.wrap}>
              <Button
                label="Save encrypted backup"
                primary
                onPress={()=>{
                  setBackupPassword('');
                  setBackupMode('save');
                }}
              />
              <Button
                label="Restore backup"
                danger
                onPress={()=>{
                  setBackupPassword('');
                  setBackupMode('restore');
                }}
              />
            </View>
            <Text style={[styles.muted,{color:palette.muted}]}>
              Security note: this app lock is an access gate, not
              full database encryption. Device encryption and
              OS screen lock remain important.
            </Text>
            </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

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
          <SafeAreaView style={[styles.screen,{backgroundColor:mapPrefs.noteColors[reader||'']||palette.background}]}>
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
              <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[styles.editor,{backgroundColor:mapPrefs.noteColors[reader||'']||palette.background}]}>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>Note title</Text>
                  <TextInput
                    accessibilityLabel="Note title"
                    style={[styles.input,{backgroundColor:palette.surface,color:mapPrefs.noteColors[reader||'']?'#362722':palette.text,borderColor:palette.border}]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Heading"
                  />
                </View>
                <View style={[styles.editorField,{flex:1}]}>
                  <Text style={styles.editorLabel}>Note content</Text>
                  <RichNoteEditor key={reader||'note'} ref={richEditorRef} initialText={body} onChangeText={setBody} onFormatStateChange={setEditorFormats}
                     dark={effectiveTheme==='dark'} textColor={mapPrefs.noteColors[reader||'']?'#362722':palette.text} backgroundColor={palette.surface}/>
                </View>
                <View style={{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <IconButton label="bold" active={editorFormats.bold} accessibilityLabel="Bold text" onPress={()=>applyNoteFormat('bold')}/>
                  <IconButton label="italic" active={editorFormats.italic} accessibilityLabel="Italic text" onPress={()=>applyNoteFormat('italic')}/>
                  <IconButton label="underline" active={editorFormats.underline} accessibilityLabel="Underline text" onPress={()=>applyNoteFormat('underline')}/>
                  <IconButton label="bullets" active={editorFormats.bullets} accessibilityLabel="Bulleted list" onPress={()=>applyNoteFormat('bullets')}/>
                  <IconButton label="numbers" active={editorFormats.numbers} accessibilityLabel="Numbered list" onPress={()=>applyNoteFormat('numbers')}/>
                   <IconButton label="Tx" accessibilityLabel="Remove formatting" onPress={()=>applyNoteFormat('clear')}/>
                  <IconButton label="palette" accessibilityLabel="Note color" onPress={()=>setColorTarget('note')}/>
                </View>
              </KeyboardAvoidingView>
            ):(
              <ScrollView contentContainerStyle={[styles.editor,{backgroundColor:mapPrefs.noteColors[reader||'']||palette.background}]}>
                <Pressable onPress={()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  <Text style={[styles.readerTitle,{color:palette.text}]}>{activeReader?.title}</Text>
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
          onRequestClose={()=>{if(sidebar)setSidebar(false);else if(selectionMenu||moveFolderMenu||sortMenu){setSelectionMenu(false);setMoveFolderMenu(false);setSortMenu(false);}else BackHandler.exitApp();}}
        >
          <InsetSafeAreaView style={[styles.screen,{backgroundColor:palette.background}]} edges={['top','bottom']}>
            <View style={[styles.header,{gap:2}]}>
              <IconButton label={selected.length?'×':'☰'} accessibilityLabel={selected.length?'Clear selection':'Open sidebar'} onPress={()=>selected.length?setSelected([]):setSidebar(v=>!v)}/>
              {showTrash?(
                <Text style={{flex:1,color:palette.text,fontSize:21,fontWeight:'600'}}>Bin</Text>
              ):selected.length===0?(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:palette.control,borderRadius:26,paddingLeft:12,minHeight:48}}>
                  <MaterialIcon name="search" color={palette.muted}/>
                  <TextInput accessibilityLabel="Search map titles" placeholder="Search Orbit Notes" placeholderTextColor={palette.muted} value={librarySearch} onChangeText={setLibrarySearch} style={{flex:1,minWidth:20,fontSize:15,color:palette.text,paddingVertical:7}}/>
                  <IconButton label="sort" accessibilityLabel="Sort maps" onPress={()=>setSortMenu(v=>!v)}/>
                  <IconButton label={mapPrefs.viewMode==='grid'?'listView':'gridView'} accessibilityLabel={mapPrefs.viewMode==='grid'?'Switch to list view':'Switch to card view'} onPress={()=>setMapPrefs(p=>({...p,viewMode:p.viewMode==='grid'?'list':'grid'}))}/>
                </View>
              ):(
                <View style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'flex-end'}}>
                  <IconButton label={selected.every(id=>mapPrefs.pinned.includes(id))?'★':'pin'} accessibilityLabel="Pin or unpin selected maps" onPress={()=>{
                    setMapPrefs(p=>{const allPinned=selected.every(id=>p.pinned.includes(id));return {...p,pinned:allPinned?p.pinned.filter(id=>!selected.includes(id)):[...new Set([...p.pinned,...selected])]};});
                    setSelected([]);
                  }}/>
                  <IconButton label="palette" accessibilityLabel="Change selected card colors" onPress={()=>setColorTarget('cards')}/>
                  <IconButton label="label" accessibilityLabel="Move selected maps to label" onPress={()=>setMoveFolderMenu(true)}/>
                  <IconButton label="⋮" accessibilityLabel="More selection actions" onPress={()=>setSelectionMenu(v=>!v)}/>
                </View>
              )}
            </View>

            {(selectionMenu||moveFolderMenu||sidebar||sortMenu)&&<Pressable accessibilityLabel="Close menu" onPress={()=>{setSelectionMenu(false);setMoveFolderMenu(false);setSidebar(false);setSortMenu(false);}} style={[StyleSheet.absoluteFill,{zIndex:20,elevation:10,backgroundColor:sidebar?'rgba(0,0,0,0.32)':'transparent'}]}/>}
            {selectionMenu&&selected.length>0&&(
              <View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border}]}>
                <ActionRow icon={showArchive?'unarchive':'archive'} label={showArchive?'Unarchive':'Archive'} onPress={()=>archiveSelection(!showArchive)}/>
                <ActionRow label="Delete" icon="🗑" danger onPress={()=>{setSelectionMenu(false);deleteSelected();}}/>
                <Button label="Export" onPress={()=>{setSelectionMenu(false);exportSelected();}}/>
              </View>
            )}

                        {sortMenu&&<View style={[styles.bottomSheet,{left:0,right:0,bottom:0,borderRadius:0,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:palette.surface,borderColor:palette.border,padding:16,gap:4}]}>
              <Text style={{fontSize:18,fontWeight:'600',color:palette.text,paddingVertical:10}}>Sort by</Text>
              <View style={{height:1,backgroundColor:palette.border,marginHorizontal:-16}}/>
              {(['created','modified','title'] as const).map(option=>(
                <Pressable key={option} accessibilityRole="button" accessibilityState={{selected:librarySort===option}} onPress={()=>{setLibrarySort(option);setSortMenu(false);}} style={{minHeight:52,flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:12}}>
                  <Text style={{fontSize:20,color:palette.accent}}>{librarySort===option?'◉':'○'}</Text>
                  <Text style={{color:palette.text,fontSize:16}}>{option==='created'?'Date created':option==='modified'?'Date modified':'Title'}</Text>
                </Pressable>
              ))}
            </View>}
                          {moveFolderMenu&&(
              <View style={[styles.bottomSheet,{backgroundColor:palette.surface,borderColor:palette.border}]}>
                <Text style={{color:palette.text,fontWeight:'600',fontSize:17,marginVertical:6}}>Labels</Text>
                <Text style={{color:palette.muted,fontSize:12}}>Select one or more labels for the selected maps.</Text>
                {folders.map(f=>{
                  const all=selected.length>0&&selected.every(id=>{const n=notes.find(x=>x.id===id);return n?hasLabel(n,f.id):false;});
                  const some=selected.some(id=>{const n=notes.find(x=>x.id===id);return n?hasLabel(n,f.id):false;});
                  return <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{checked:all}} accessibilityLabel={f.name} onPress={()=>moveSelection(f.id)} style={{flexDirection:'row',gap:12,alignItems:'center',minHeight:48,paddingHorizontal:10}}>
                    <View style={{width:24,height:24,borderWidth:2,borderColor:all||some?palette.accent:palette.muted,borderRadius:3,alignItems:'center',justifyContent:'center',backgroundColor:all?palette.accent:'transparent'}}>
                       {all?<MaterialIcon name="✓" color={palette.background}/>:some?<View style={{width:11,height:3,backgroundColor:palette.accent,borderRadius:1}}/>:null}
                     </View>
                    <Text style={{color:palette.text,flex:1,fontSize:15}}>{f.name}</Text>
                  </Pressable>;
                })}
                <Button label="+ Create new label" onPress={()=>{setEditingFolderId(null);setFolderName('');setCreatingFolder(true);setMoveFolderMenu(false);}}/>
                <Button label="Done" onPress={()=>{setSelected([]);setMoveFolderMenu(false);}}/>
              </View>
            )}

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

                  <Pressable accessibilityRole="button" accessibilityLabel="All maps" onPress={()=>{setFolderFilter(null);setShowTrash(false);setShowArchive(false);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:!showArchive&&!showTrash&&!folderFilter?(effectiveTheme==='dark'?'#473e2e':'#fef3c7'):'transparent'}}>
                    <MaterialIcon name="allMaps" color={palette.text}/><Text style={{color:palette.text}}>All maps</Text>
                  </Pressable>
                  {folders.length>0&&<>
                    <View style={{height:1,backgroundColor:palette.border,marginVertical:5}}/>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12}}>
                      <Text style={{color:palette.muted,fontWeight:'600'}}>Labels</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Edit labels" onPress={()=>{setLabelManager(true);setSidebar(false);}} style={{padding:8}}><Text style={{color:palette.accent,fontWeight:'600'}}>Edit</Text></Pressable>
                    </View>
                    {folders.map(item=>(
                      <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Filter '+item.name} onPress={()=>{setFolderFilter(item.id);setShowTrash(false);setShowArchive(false);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:folderFilter===item.id?(effectiveTheme==='dark'?'#473e2e':'#fef3c7'):'transparent'}}>
                        <MaterialIcon name="label" color={folderFilter===item.id?palette.accent:palette.text}/>
                        <Text style={{color:palette.text,flex:1}}>{item.name}</Text>
                      </Pressable>
                    ))}
                  </>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Create new label" onPress={()=>{setEditingFolderId(null);setFolderName('');setCreatingFolder(true);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',padding:12,gap:14}}>
                    <MaterialIcon name="+" color={palette.text}/><Text style={{color:palette.text}}>Create new label</Text>
                  </Pressable>
                  {folders.length>0&&<View style={{height:1,backgroundColor:palette.border,marginVertical:5}}/>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Archive" onPress={()=>{setShowArchive(true);setShowTrash(false);setFolderFilter(null);setSelected([]);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:showArchive?(effectiveTheme==='dark'?'#473e2e':'#fef3c7'):'transparent'}}>
                    <MaterialIcon name="archive" color={palette.text}/><Text style={{color:palette.text}}>Archive</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Recently Deleted" onPress={()=>{setShowTrash(true);setShowArchive(false);setFolderFilter(null);setSelectedTrash([]);setSelected([]);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12,borderRadius:28,backgroundColor:showTrash?(effectiveTheme==='dark'?'#473e2e':'#fef3c7'):'transparent'}}>
                    <MaterialIcon name="🗑" color={palette.text}/><Text style={{color:palette.text}}>Recently Deleted</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={()=>{setSettings(true);setSidebar(false);}} style={{flexDirection:'row',alignItems:'center',gap:14,padding:12}}>
                    <MaterialIcon name="settingsIcon" color={palette.text}/><Text style={{color:palette.text}}>Settings</Text>
                  </Pressable>
                </ScrollView>
              </Animated.View>
              </GestureDetector>
            )}

            <Modal visible={labelManager} animationType="slide" onRequestClose={()=>{setLabelManager(false);setEditingFolderId(null);}}>
              <SafeAreaView style={[styles.screen,{backgroundColor:palette.background,padding:18}]}>
                <View style={[styles.header,{paddingHorizontal:0}]}>
                  <Text style={[styles.section,{color:palette.text}]}>Edit labels</Text>
                  <IconButton label="×" accessibilityLabel="Close label editor" onPress={()=>{setLabelManager(false);setEditingFolderId(null);}}/>
                </View>
                <ScrollView contentContainerStyle={{gap:4}}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Create new label" style={{flexDirection:'row',alignItems:'center',padding:12,gap:16}} onPress={()=>{setEditingFolderId(null);setFolderName('');setLabelManager(false);setCreatingFolder(true);}}>
                    <MaterialIcon name="+" color={palette.text}/><Text style={{color:palette.text,fontSize:16}}>Create new label</Text>
                  </Pressable>
                  {folders.map(item=>(
                    <View key={item.id} style={{flexDirection:'row',alignItems:'center',gap:10,padding:8,minHeight:56}}>
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
                          <MaterialIcon name="label" color={palette.text}/>
                          <Text style={{flex:1,color:palette.text,fontSize:16}}>{item.name}</Text>
                          <IconButton label="✎" accessibilityLabel={'Edit label '+item.name} onPress={()=>{setEditingFolderId(item.id);setFolderName(item.name);}}/>
                        </>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </SafeAreaView>
            </Modal>
            {creatingFolder&&(
              <View style={[StyleSheet.absoluteFill,{zIndex:50,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.42)'}]}>
                <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss label editor" onPress={()=>{setCreatingFolder(false);setEditingFolderId(null);}}/>
                <View style={{backgroundColor:palette.surface,borderTopLeftRadius:26,borderTopRightRadius:26,padding:20,gap:12}}>
                  <Text style={[styles.section,{color:palette.text}]}>{editingFolderId?'Edit label':'Create label'}</Text>
                <TextInput
                  style={[
                    styles.input,
                    {minHeight:52,width:'100%',backgroundColor:palette.background,color:palette.text,borderColor:palette.border}
                  ]}
                  value={folderName}
                  onChangeText={setFolderName}
                  placeholder="Label name"
                />
                <Button
                  label={editingFolderId?'Save label':'Create label'}
                  primary
                  onPress={()=>{
                    const nextName=folderName.trim();
                    if(!nextName)return;
                    if(editingFolderId){
                      setFolders(fs=>fs.map(f=>f.id===editingFolderId?{...f,name:nextName}:f));
                    }else{
                      const newId=id();
                      setFolders(fs=>[...fs,{id:newId,name:nextName}]);
                      if(selected.length){setNotes(ns=>ns.map(n=>selected.includes(n.id)?{...addLabel(n,newId),updatedAt:Date.now()}:n));}
                    }
                    setEditingFolderId(null);
                    setFolderName('');
                    setCreatingFolder(false);
                    setMoveFolderMenu(false);
                  }}
                />
                <Button
                  label="Cancel"
                  onPress={()=>{setCreatingFolder(false);setEditingFolderId(null);setFolderName('');}}
                />
              </View>
              </View>
            )}

            <ScrollView contentContainerStyle={{
              padding:12,
              gap:10,
              flexDirection:!showTrash&&mapPrefs.viewMode==='grid'?'row':'column',
              flexWrap:'nowrap',
              alignItems:'flex-start',
              justifyContent:'space-between'
            }}>
              {showTrash?(
                <View style={{width:'100%',gap:12,padding:8}}>
                  <Text style={[styles.section,{color:palette.text}]}>Recently Deleted</Text>
                  <Text style={{color:palette.muted,fontSize:13}}>Items in the bin are permanently deleted after seven days.</Text>
                  {!mapPrefs.trashRetentionAcknowledged&&(
                    <View style={{gap:8,padding:12,borderColor:palette.border,borderWidth:1,borderRadius:14}}>
                      <Text style={{color:palette.text}}>Review existing deleted items before activating the seven-day retention policy.</Text>
                      <Button label="Apply seven-day retention" onPress={acknowledgeTrashRetention}/>
                    </View>
                  )}
                  <View style={{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8}}>
                    {selectedTrash.length>0&&<IconButton label="restoreIcon" accessibilityLabel="Restore selected deleted maps" onPress={restoreSelectedTrash}/>}
                    <IconButton label="⋮" accessibilityLabel="Deleted items menu" onPress={()=>setTrashMenu(v=>!v)}/>
                  </View>
                  {trashMenu&&<View style={{backgroundColor:palette.surface,borderRadius:16,padding:8}}>
                    {selectedTrash.length?(
                      <Button label="Delete forever" danger onPress={()=>{setTrashMenu(false);removeSelectedTrash();}}/>
                    ):(
                      <Button label="Empty bin" danger onPress={()=>{setTrashMenu(false);if(trash.length)showDialog('Empty bin?','Permanently delete all items in Recently Deleted?',[
                        {text:'Cancel',style:'cancel'},
                        {text:'Empty bin',style:'destructive',onPress:()=>{setTrash([]);setSelectedTrash([]);}}
                      ]);}}/>
                    )}
                  </View>}
                  {trash.length===0?(
                    <View style={{alignItems:'center',paddingVertical:64,gap:10}}>
                      <MaterialIcon name="🗑" color={palette.muted}/>
                      <Text style={{color:palette.muted,fontSize:16}}>Nothing in the bin</Text>
                      <Text style={{color:palette.muted,textAlign:'center'}}>Deleted maps will appear here for seven days.</Text>
                    </View>
                  ):trash.map(batch=>(
                    <Pressable key={batch.id} accessibilityRole="button" accessibilityLabel={'Select deleted map '+(batch.notes[0]?.title||'Untitled')} onPress={()=>setSelectedTrash(v=>v.includes(batch.id)?v.filter(x=>x!==batch.id):[...v,batch.id])}
                      style={{minHeight:120,borderRadius:16,padding:14,backgroundColor:palette.surface,borderColor:selectedTrash.includes(batch.id)?palette.accent:palette.border,borderWidth:selectedTrash.includes(batch.id)?3:1,gap:12}}>
                      <Text style={{color:palette.text,fontWeight:'600',fontSize:16}}>{batch.notes[0]?.title||'Untitled map'}</Text>
                      <Text style={{color:palette.muted,fontSize:12}}>Deleted {stamp(batch.deletedAt)}</Text>
                    </Pressable>
                  ))}
                </View>
              ):(
                <>
                  {(mapPrefs.viewMode==='grid'?[0,1]:[0]).map(column=>(
                    <View key={column} style={{width:mapPrefs.viewMode==='grid'?'48.5%':'100%',gap:10}}>
                    {shown.filter((_,index)=>mapPrefs.viewMode!=='grid'||index%2===column).map(n=>(
                    <Pressable
                      key={n.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.title||'Untitled map'}${mapPrefs.pinned.includes(n.id)?', pinned':''}${selected.includes(n.id)?', selected':''}`}
                      accessibilityHint="Tap to open; long press to select"
                      style={[styles.listRow,{backgroundColor:mapPrefs.cardColors[n.id]||palette.surface,borderColor:selected.includes(n.id)?palette.accent:palette.border,borderWidth:selected.includes(n.id)?3:1},mapPrefs.viewMode==='grid'&&{width:'100%',alignItems:'stretch',flexDirection:'column',padding:10}]}
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
                        <Text style={[styles.listTitle,{color:mapPrefs.cardColors[n.id]?'#362722':palette.text,paddingRight:mapPrefs.pinned.includes(n.id)?29:0}]} numberOfLines={2}>{n.title||'Untitled map'}</Text>
                        {mapPrefs.viewMode==='grid'&&mapPreview(n)}
                         {labelIds(n).length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:7}}>
                         {labelIds(n).map(labelId=>{const name=folders.find(f=>f.id===labelId)?.name;return name?<View key={labelId} style={{borderColor:palette.muted,borderWidth:1,borderRadius:6,paddingVertical:3,paddingHorizontal:7}}><Text style={{color:palette.muted,fontSize:11}}>{name}</Text></View>:null;})}
                       </View>}
 
                      </View>

                      {selected.length===0&&mapPrefs.pinned.includes(n.id)&&
                        <Pressable accessibilityRole="button" accessibilityLabel="Unpin map" onPress={()=>setMapPrefs(p=>({...p,pinned:p.pinned.filter(x=>x!==n.id)}))}
                          hitSlop={8} style={{position:'absolute',right:8,top:7,width:34,height:34,alignItems:'center',justifyContent:'center',zIndex:2}}>
                          <Svg width={21} height={21} viewBox="0 0 24 24">
                            <Path d="M8 3h8v2l-1.5 2.3v4.1l3.2 3V16H6.3v-1.6l3.2-3V7.3L8 5V3z" fill={palette.accent}/>
                            <Path d="M12 16v6" stroke={palette.accent} strokeWidth={2} strokeLinecap="round"/>
                          </Svg>
                        </Pressable>}
                      {showArchive&&selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel="Unarchive map" onPress={()=>archiveOne(n.id,false)}><Text style={{color:palette.accent,fontWeight:'700'}}>Unarchive</Text></Pressable>}
                    </Pressable>
                  ))}
                    </View>
                  ))}

                  {shown.length===0&&(
                    <View style={{alignItems:'center',paddingVertical:48,paddingHorizontal:20,gap:12}}>
                      {showArchive&&!librarySearch.trim()?<Svg width={112} height={112} viewBox="0 0 112 112"><Rect x={15} y={33} width={82} height={58} rx={10} fill="none" stroke={palette.muted} strokeWidth={3}/><Rect x={10} y={23} width={92} height={18} rx={4} fill={palette.background} stroke={palette.muted} strokeWidth={3}/><Path d="M40 59h32" fill="none" stroke={palette.muted} strokeWidth={4} strokeLinecap="round"/></Svg>:<MaterialIcon name={showArchive?'archive':'label'} color={palette.muted}/>}
                      <Text style={[styles.listTitle,{textAlign:'center',color:palette.text}]}>{librarySearch.trim()?'No matching maps':showArchive?'Your archived maps appear here':folderFilter?'No maps in this label':'Your library is ready'}</Text>
                      {!showArchive&&<Text style={[styles.muted,{color:palette.muted,textAlign:'center'}]}>{librarySearch.trim()?'No maps match this search. Try different words or clear the search.':folderFilter?'Create a map in this label, or move an existing map here from the library.':'Create your first map to start building your notes.'}</Text>}
                      {librarySearch.trim()?<Button label="Clear search" onPress={()=>setLibrarySearch('')}/>:!showArchive&&<Button label="Create map" primary onPress={newMap}/>}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
            {!showTrash&&!showArchive&&selected.length===0&&<Pressable accessibilityRole="button" accessibilityLabel="Create new map" onPress={newMap} style={{position:'absolute',right:22,bottom:26,width:60,height:60,borderRadius:20,backgroundColor:palette.accent,alignItems:'center',justifyContent:'center',elevation:5,zIndex:10}}>
              <Text style={{fontSize:32,color:'white'}}>+</Text>
            </Pressable>}
          {undoOpen&&undoBatch&&(
            <GestureDetector gesture={Gesture.Pan().activeOffsetX([-20,20]).onEnd(e=>{if(Math.abs(e.translationX)>55){runOnJS(setUndoOpen)(false);runOnJS(setUndoBatch)(null);runOnJS(setPendingBranch)(null);}})}>
              <View style={{position:'absolute',bottom:90,left:16,right:16,zIndex:60,backgroundColor:palette.control,borderRadius:12,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',elevation:8}}>
                <Text style={{color:palette.text}}>Moved to Recently Deleted</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Undo deletion" onPress={()=>{const batch=trash.find(t=>t.id===undoBatch);if(batch)restore(batch);setUndoOpen(false);setUndoBatch(null);}} style={{padding:8}}>
                  <Text style={{color:palette.accent,fontWeight:'700'}}>Undo</Text>
                </Pressable>
              </View>
            </GestureDetector>
          )}
          </InsetSafeAreaView>
        </Modal>
        <Modal visible={retentionNotice} transparent animationType="fade" onRequestClose={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));}}>
          <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.55)'}}>
            <View style={{backgroundColor:palette.surface,padding:22,borderRadius:24,gap:16}}>
              <Text style={[styles.section,{color:palette.text}]}>Recently Deleted policy update</Text>
              <Text style={{color:palette.text}}>Deleted notes will be kept for seven days. Existing deleted notes older than seven days may be removed permanently after you activate the policy. Review and restore important notes first.</Text>
              <Button label="Review Recently Deleted" primary onPress={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));setShowTrash(true);setShowArchive(false);setMenu(true);}}/>
              <Button label="Later — keep existing items" onPress={()=>{setRetentionNotice(false);setMapPrefs(p=>({...p,trashRetentionWarningSeen:true}));}}/>
            </View>
          </View>
        </Modal>
        <Modal visible={colorTarget!==null} transparent animationType="slide" onRequestClose={()=>setColorTarget(null)}>
          <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.35)'}}>
            <View style={{padding:20,gap:16,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:palette.surface}}>
              <Text style={[styles.section,{color:palette.text}]}>Choose {colorTarget==='cards'?'card':'note'} color</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:14}}>
                {CARD_PALETTE.map((color,index)=>{
                  const targets=colorTarget==='cards'?selected:[reader||''];
                  const chosen=targets.length>0&&targets.every(target=>((colorTarget==='cards'?mapPrefs.cardColors[target]:mapPrefs.noteColors[target])||CARD_PALETTE[0])===color);
                  return <Pressable key={color} accessibilityRole="button" accessibilityState={{selected:chosen}} accessibilityLabel={index===0?'Default color':`Color ${index+1}`} onPress={()=>{
                  if(colorTarget==='cards'){
                    setMapPrefs(p=>({...p,cardColors:{...p.cardColors,...Object.fromEntries(selected.map(id=>[id,color]))}}));
                    setSelected([]);
                  }else if(reader){
                    setMapPrefs(p=>({...p,noteColors:{...p.noteColors,[reader]:color}}));
                  }
                  setColorTarget(null);
                }} style={{width:46,height:46,borderRadius:23,backgroundColor:color,borderWidth:chosen?3:2,borderColor:chosen?palette.accent:palette.border,alignItems:'center',justifyContent:'center'}}>
                  {chosen?<View style={{width:24,height:24,borderRadius:12,backgroundColor:palette.surface,alignItems:'center',justifyContent:'center'}}><MaterialIcon name="✓" color={palette.text}/></View>:null}
                </Pressable>;
                })}
              </View>
              <Button label="Cancel" onPress={()=>setColorTarget(null)}/>
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
    gap:10,
    minWidth:190,
    maxWidth:260,
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
    fontWeight:'800',
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
    fontWeight:'800',
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
    fontWeight:'700',
    color:'#0f172a'
  },
  checkbox:{
    fontSize:25,
    color:'#315fd6'
  }
});
