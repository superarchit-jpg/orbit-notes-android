import React,{useEffect,useMemo,useState} from 'react';
import {Alert,AppState,BackHandler,Dimensions,Modal,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Svg,{Line,Circle,Rect} from 'react-native-svg';
import {SafeAreaProvider,SafeAreaView as InsetSafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated,{runOnJS,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';
import {loadSnapshot,saveSnapshot,loadMapPreferences,saveMapPreferences,emptyMapPreferences} from './storage';
import {radialTree,fitMap,pointSegmentDistance} from './mapGeometry';
import {hasPin,setPin,checkPin,removePin,biometricEnabled,setBiometricEnabled,biometricAvailable,authenticateBiometric,lockStatus,recordPinAttempt} from './appLock';
import {exportPDF,Note} from './export';
import {safeExportName,saveExportToAndroid,ExportFormat} from './localSave';
import * as FileSystem from 'expo-file-system/legacy';
import {saveEncryptedBackup,selectAndDecryptBackup} from './backup';
import {radialLayout,overviewLayout} from './layout';
import {TrashBatch,deleteBranches,restoreBatch,pruneTrash} from './trash';

const SafeAreaView=InsetSafeAreaView;
const W=Dimensions.get('window').width,H=Dimensions.get('window').height;
const now=Date.now();
const initial:Note[]=[{id:'root',parentId:null,title:'My Notes',body:'',updatedAt:now,folderId:null}];
type Folder={id:string;name:string};
const stamp=(t:number)=>new Date(t).toLocaleString();
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

const Button=({label,onPress,primary=false,danger=false}:{label:string;onPress:()=>void;primary?:boolean;danger?:boolean})=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.button,primary&&styles.primary,danger&&styles.danger]}><Text style={[styles.buttonText,(primary||danger)&&{color:'white'}]}>{label==='🗑'?<Svg width={23} height={23} viewBox="0 0 24 24"><Line x1={4} y1={7} x2={20} y2={7} stroke="#dc2626" strokeWidth={1.8}/><Line x1={9} y1={4} x2={15} y2={4} stroke="#dc2626" strokeWidth={1.8}/><Rect x={6} y={7} width={12} height={14} rx={2} stroke="#dc2626" strokeWidth={1.8} fill="none"/><Line x1={10} y1={11} x2={10} y2={17} stroke="#dc2626" strokeWidth={1.5}/><Line x1={14} y1={11} x2={14} y2={17} stroke="#dc2626" strokeWidth={1.5}/></Svg>:label}</Text></Pressable>;

const Upright=({angle,children}:{angle:SharedValue<number>;children:React.ReactNode})=>{
  const style=useAnimatedStyle(()=>({transform:[{rotateZ:`${-angle.value}rad`}]}));
  return <Animated.View style={[{alignItems:'center',justifyContent:'center'},style]}>{children}</Animated.View>;
};

const IconButton=({label,onPress,danger=false,accessibilityLabel}:{label:string;onPress:()=>void;danger?:boolean;accessibilityLabel?:string})=><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel||label} onPress={onPress} style={{paddingHorizontal:12,paddingVertical:9,minWidth:42,alignItems:'center'}}>{label==='🗑'?<Svg width={23} height={23} viewBox="0 0 24 24"><Line x1={4} y1={7} x2={20} y2={7} stroke="#dc2626" strokeWidth={1.8}/><Line x1={9} y1={4} x2={15} y2={4} stroke="#dc2626" strokeWidth={1.8}/><Rect x={6} y={7} width={12} height={14} rx={2} stroke="#dc2626" strokeWidth={1.8} fill="none"/><Line x1={10} y1={11} x2={10} y2={17} stroke="#dc2626" strokeWidth={1.5}/><Line x1={14} y1={11} x2={14} y2={17} stroke="#dc2626" strokeWidth={1.5}/></Svg>:<Text style={{fontSize:23,color:danger?'#dc2626':'#1e293b'}}>{label}</Text>}</Pressable>;

export default function App(){
const [notes,setNotes]=useState<Note[]>(initial),[folders,setFolders]=useState<Folder[]>([]),[focused,setFocused]=useState('root'),[overview,setOverview]=useState(false),[menu,setMenu]=useState(true),[reader,setReader]=useState<string|null>(null),[editing,setEditing]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[folderName,setFolderName]=useState(''),[creatingFolder,setCreatingFolder]=useState(false),[selected,setSelected]=useState<string[]>([]),[folderFilter,setFolderFilter]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState<string|null>(null),[trash,setTrash]=useState<TrashBatch[]>([]),[showTrash,setShowTrash]=useState(false),[undoBatch,setUndoBatch]=useState<string|null>(null);

const [mapPrefs,setMapPrefs]=useState(emptyMapPreferences);
const [showMiniMap,setShowMiniMap]=useState(false);
const [nodeActions,setNodeActions]=useState<string|null>(null);
const [draftChildId,setDraftChildId]=useState<string|null>(null);
const [readerTapAt,setReaderTapAt]=useState(0);
const [librarySearch,setLibrarySearch]=useState('');
const [librarySort,setLibrarySort]=useState<'modified'|'title'|'created'>('modified');
const [sortMenu,setSortMenu]=useState(false);
const [foldersExpanded,setFoldersExpanded]=useState(false);
const [mapMenu,setMapMenu]=useState(false),[libraryMenu,setLibraryMenu]=useState(false),[selectionMenu,setSelectionMenu]=useState(false),[sidebar,setSidebar]=useState(false),[moveFolderMenu,setMoveFolderMenu]=useState(false),[exportTarget,setExportTarget]=useState<string|null>(null);

const [backupMode,setBackupMode]=useState<'save'|'restore'|null>(null),[backupPassword,setBackupPassword]=useState(''),[backupBusy,setBackupBusy]=useState(false);
const [exportKind,setExportKind]=useState<ExportFormat|null>(null),[exportName,setExportName]=useState(''),[exportBusy,setExportBusy]=useState(false);

const tx=useSharedValue(0),ty=useSharedValue(0),scale=useSharedValue(1),rotation=useSharedValue(0),startRotation=useSharedValue(0),startX=useSharedValue(0),startY=useSharedValue(0),startScale=useSharedValue(1);

const [locked,setLocked]=useState(true),[pinConfigured,setPinConfigured]=useState(false),[pinInput,setPinInput]=useState(''),[pinSetup,setPinSetup]=useState(''),[pinAttempts,setPinAttempts]=useState(0),[blockedUntil,setBlockedUntil]=useState(0),[settings,setSettings]=useState(false),[biometrics,setBiometrics]=useState(false);

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
          setTrash(pruneTrash(existing.trash));
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
      const enabled=await hasPin();
      const bio=await biometricEnabled();
      if(alive){
        setPinConfigured(enabled);
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
  saveSnapshot({notes,folders,focused,trash}).catch(e=>Alert.alert('Save failed',String(e)));
},[notes,folders,focused,trash,loaded,storageError]);

useEffect(()=>{
  if(!loaded||storageError)return;
  saveMapPreferences(mapPrefs).catch(e=>Alert.alert('Map preferences save failed',String(e)));
},[mapPrefs,loaded,storageError]);

useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>{
    if(state!=='active'&&pinConfigured){
      setLocked(true);
      setPinInput('');
    }
  });
  return()=>sub.remove();
},[pinConfigured]);

const unlock=async()=>{
  try{
    const status=await lockStatus();
    if(Date.now()<status.blockedUntil){
      Alert.alert('Try again later','Too many incorrect PIN attempts.');
      return;
    }
    const valid=await checkPin(pinInput);
    const next=await recordPinAttempt(valid);
    setPinAttempts(next.attempts);
    setBlockedUntil(next.blockedUntil);
    setPinInput('');
    if(valid)setLocked(false);
    else Alert.alert('Incorrect PIN',next.blockedUntil>Date.now()?'Try again in one minute.':'Please try again.');
  }catch(e){
    Alert.alert('Unlock error',String(e));
  }
};

const enablePin=async()=>{
  try{
    await setPin(pinSetup);
    setPinConfigured(true);
    setPinSetup('');
    Alert.alert('App lock enabled','Your PIN will be required after leaving the app.');
  }catch(e){
    Alert.alert('Cannot set PIN',String(e));
  }
};

const disablePin=()=>Alert.alert('Disable app lock?','Anyone with access to your unlocked phone can open your notes.',[
  {text:'Cancel'},
  {text:'Disable',style:'destructive',onPress:async()=>{
    await removePin();
    setPinConfigured(false);
    setBiometrics(false);
  }}
]);

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
   tx.value=withTiming(-(point.x*Math.cos(angle)-point.y*Math.sin(angle)),{duration:560});
  ty.value=withTiming(-(point.x*Math.sin(angle)+point.y*Math.cos(angle)),{duration:560});
  scale.value=withTiming(1,{duration:560});
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
  setNotes(ns=>{const updated=Date.now();const target=ns.find(n=>n.id===reader);let parentId=target?.parentId;const ancestorIds=new Set<string>();while(parentId&&parentId!=='root'){ancestorIds.add(parentId);parentId=ns.find(n=>n.id===parentId)?.parentId;}return ns.map(n=>n.id===reader?{...n,title:title.trim()||'Untitled',body,updatedAt:updated}:ancestorIds.has(n.id)?{...n,updatedAt:updated}:n);});
  setEditing(false);
  setDraftChildId(null);
  setReader(null);
};

const cancelReader=()=>{
  if(draftChildId)setNotes(ns=>ns.filter(n=>n.id!==draftChildId));
  setDraftChildId(null);
  setReader(null);
  setEditing(false);
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

const deleteSelected=()=>{
  const ids=selected.filter(x=>x!=='root');
  if(!ids.length)return;
  const result=deleteBranches(notes,ids);
  if(!result.batch.notes.length)return;
  Alert.alert('Move to Recently Deleted',`Move ${result.batch.notes.length} note(s), including descendants, to Recently Deleted?`,[
    {text:'Cancel',style:'cancel'},
    {text:'Move',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
      setTrash(t=>pruneTrash([result.batch,...t]));
      setUndoBatch(result.batch.id);
      if(result.batch.notes.some(n=>n.id===focused))moveTo('root');
      setSelected([]);
      setReader(null);
    }}
  ]);
};

const removeBranch=(target:string)=>{
  if(target==='root')return;
  const result=deleteBranches(notes,[target]);
  if(!result.batch.notes.length)return;
  Alert.alert('Delete note?','This note and all its descendants will go to Recently Deleted.',[
    {text:'Cancel'},
    {text:'Delete',style:'destructive',onPress:()=>{
      setNotes(result.remaining);
      setTrash(t=>pruneTrash([result.batch,...t]));
      if(result.batch.notes.some(n=>n.id===focused))setFocused(current.parentId||'root');
    }}
  ]);
};
const reparent=(target:string,direction:'up'|'down')=>{
  const note=notes.find(n=>n.id===target);
  if(!note||note.id==='root')return;

  if(direction==='up'){
    const oldParent=notes.find(n=>n.id===note.parentId);
    if(!oldParent?.parentId){
      Alert.alert('Already at top level');
      return;
    }
    setNotes(ns=>ns.map(n=>n.id===target?{
      ...n,parentId:oldParent.parentId,updatedAt:Date.now()
    }:n));
    return;
  }

  const candidates=notes.filter(n=>n.parentId===note.parentId&&n.id!==target);
  if(!candidates.length){
    Alert.alert('No sibling level','Create another note at this level before moving this note under it.');
    return;
  }
  Alert.alert('Move under which note?',undefined,[
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
  scale.value=withTiming(1);
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

const restore=(batch:TrashBatch)=>{
  try{
    const restored=restoreBatch(notes,batch);
    setNotes(restored);
    setTrash(t=>t.filter(b=>b.id!==batch.id));
    setUndoBatch(null);
  }catch(e){
    Alert.alert('Restore unavailable',String(e));
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
  .onStart(()=>{startScale.value=scale.value;})
  .onUpdate(e=>{
    scale.value=Math.min(4,Math.max(.35,startScale.value*e.scale));
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
  tx.value=withTiming(fit.x);
  ty.value=withTiming(fit.y);
  scale.value=withTiming(fit.scale);
  rotation.value=withTiming(0);
};
const parentPoint:{x:number;y:number}={x:0,y:0};

const miniLines=completeMap.filter(n=>n.note.parentId&&n.note.parentId!=='root').flatMap(n=>{
  const p=completeMap.find(x=>x.note.id===n.note.parentId);
  return p?[{id:n.note.id,x1:p.x,y1:p.y,x2:n.x,y2:n.y}]:[];
});
const hiddenIndicators=fullMap.filter(n=>!visible.some(v=>v.note.id===n.note.id)&&
  visible.some(v=>v.note.id===n.note.parentId)).map(n=>{
  const p=fullMap.find(v=>v.note.id===n.note.parentId)!;
  const radius=p.level===0?56:p.level===1?44:35;
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

const nodePress=(n:Note)=>{
  if(n.id!==focused)moveTo(n.id);
};

const node=(n:Note,x:number,y:number,level:number)=>{
  const size=level===0?112:level===1?88:70;

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
      gesture={n.parentId&&n.parentId!=='root'?Gesture.Simultaneous(Gesture.Exclusive(long,triple,double,single),Gesture.Pan().minPointers(1).maxPointers(1).minDistance(12).onChange(e=>{const parent=visible.find(v=>v.note.id===n.parentId);const child=visible.find(v=>v.note.id===n.id);if(!parent||!child)return;const angle=rotation.value,c=Math.cos(angle),si=Math.sin(angle);const dx=scale.value*((child.x-parent.x)*c-(child.y-parent.y)*si),dy=scale.value*((child.x-parent.x)*si+(child.y-parent.y)*c);const delta=(dx*e.changeY-dy*e.changeX)/Math.max(2500,Math.min(dx*dx+dy*dy,160*160));if(Math.abs(delta)>0.00001)runOnJS(updateChildRotation)(n.parentId!,delta);}).onEnd(e=>{const parent=visible.find(v=>v.note.id===n.parentId);const child=visible.find(v=>v.note.id===n.id);if(!parent||!child)return;const a=rotation.value,c=Math.cos(a),si=Math.sin(a);const dx=scale.value*((child.x-parent.x)*c-(child.y-parent.y)*si),dy=scale.value*((child.x-parent.x)*si+(child.y-parent.y)*c);const speed=(dx*e.velocityY-dy*e.velocityX)/Math.max(2500,Math.min(dx*dx+dy*dy,160*160));runOnJS(finishChildRotation)(n.parentId!,Math.max(-2,Math.min(2,speed)));})) : Gesture.Exclusive(long,triple,double,single)}
    >
      <View collapsable={false} style={{
        position:'absolute',left:x-size/2-24,top:y-size/2-24,
        width:size+48,height:size+48,alignItems:'center',justifyContent:'center'
      }}>
      <View style={[
        styles.node,
        {
          width:size,
          height:size,
          borderRadius:size/2,
          left:24,
          top:24,
          backgroundColor:mapPrefs.colors[n.id]|| (n.id===focused?'#315fd6':level<=1?'#dbeafe':'#eef2ff'),
          borderColor:n.id===focused?'#315fd6':'#93c5fd'
        }
      ]}>
        <Upright angle={rotation}>
          <Text
            numberOfLines={2}
            style={[
              styles.nodeTitle,
              {
                color:n.id===focused&&!mapPrefs.colors[n.id]?'white':'#1e40af',
                fontSize:level===2?11:13
              }
            ]}
          >
            {n.title}
          </Text>
          {Boolean(n.body.trim())&&(
            <Text style={{
              color:n.id===focused&&!mapPrefs.colors[n.id]?'#dbeafe':'#2563eb',
              fontSize:15
            }}>≡</Text>
          )}
        </Upright>
      </View>
      </View>
    </GestureDetector>
  );
};

const [canvasW,setCanvasW]=useState(W);
const [canvasH,setCanvasH]=useState(H-180);
const centerX=canvasW/2,centerY=canvasH/2;

const activeReader=notes.find(n=>n.id===reader)||initial[0];
const listNotes=notes.filter(n=>n.parentId==='root');
const shown=listNotes.filter(n=>(!folderFilter||n.folderId===folderFilter)&&n.title.toLowerCase().includes(librarySearch.toLowerCase())).sort((a,b)=>Number(mapPrefs.pinned.includes(b.id))-Number(mapPrefs.pinned.includes(a.id))||(librarySort==='title'?a.title.localeCompare(b.title):librarySort==='created'?Number(a.id.split('-')[0])-Number(b.id.split('-')[0]):b.updatedAt-a.updatedAt));

const moveSelection=(folderId:string|null)=>{
  setNotes(ns=>ns.map(n=>selected.includes(n.id)?{
    ...n,folderId,updatedAt:Date.now()
  }:n));
  setSelected([]);
};

const exportOne=(kind:ExportFormat,targetId?:string)=>{
  const target=notes.find(n=>n.id===(targetId||current.id))||current;
  setExportTarget(target.id);
  setExportName(target.title);
  setExportKind(kind);
  setMapMenu(false);
  setLibraryMenu(false);
  setSelectionMenu(false);
};

const exportSelected=()=>{
  setExportTarget('__selection__');
  setExportName('Selected maps');
  setExportKind('pdf');
  setSelectionMenu(false);
};

const confirmExport=async()=>{
  if(!exportKind||exportBusy)return;
  const kind=exportKind;
  setExportBusy(true);
  let tempUri:string|undefined;

  try{
    const exportNotes=exportTarget==='__selection__'
      ?(()=>{
        const root:Note={
          id:'__export_root__',
          parentId:null,
          title:'Selected maps',
          body:'',
          updatedAt:Date.now(),
          folderId:null
        };
        return {
          root,
          all:[
            ...notes.filter(n=>!selected.includes(n.id)),
            ...notes.filter(n=>selected.includes(n.id)).map(n=>({
              ...n,parentId:root.id
            })),
            root
          ]
        };
      })()
      :null;

    tempUri=exportNotes
      ?await exportPDF(exportNotes.root,exportNotes.all)
      :await exportPDF(notes.find(n=>n.id===exportTarget)||current,notes);

    const destination=await saveExportToAndroid(tempUri,exportName,kind);

    if(destination){
      setExportKind(null);
      Alert.alert(
        'Saved to device',
        `${safeExportName(exportName,kind)} was saved to your chosen Android folder.`
      );
    }else{
      Alert.alert(
        'Save cancelled',
        'No file was saved to external storage.'
      );
    }
  }catch(e){
    Alert.alert('Export failed',String(e));
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

  if(backupPassword.length<12){
    Alert.alert(
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
        {notes,folders,focused,trash},
        backupPassword
      );

      if(saved){
        setBackupMode(null);
        setBackupPassword('');
        Alert.alert(
          'Backup saved',
          'Keep your backup password safe. There is no password recovery.'
        );
      }
    }else{
      const restored=await selectAndDecryptBackup(backupPassword);

      if(restored){
        await saveSnapshot(restored);
        setNotes(restored.notes);
        setFolders(restored.folders);
        setTrash(restored.trash);
        setFocused(restored.focused);
        setBackupMode(null);
        setBackupPassword('');
        setSettings(false);
        Alert.alert(
          'Restore complete',
          'The local notebook was replaced by the selected backup.'
        );
      }
    }
  }catch(e){
    Alert.alert('Backup operation failed',String(e));
  }finally{
    setBackupBusy(false);
  }
};

if(storageError){
  return (
    <SafeAreaView style={[
      styles.screen,
      {justifyContent:'center',padding:24,gap:12}
    ]}>
      <Text style={styles.section}>Unable to open local notebook</Text>
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
    <SafeAreaView style={styles.screen}>
      <Text style={styles.logo}>Loading Orbit Notes…</Text>
    </SafeAreaView>
  );
}

if(locked){
  return (
    <SafeAreaView style={[
      styles.screen,
      {justifyContent:'center',padding:28,gap:18}
    ]}>
      <Text style={styles.logo}>◉ Orbit Notes</Text>
      <Text style={styles.section}>Unlock your private notebook</Text>

      <TextInput
        secureTextEntry
        keyboardType="number-pad"
        maxLength={12}
        value={pinInput}
        onChangeText={setPinInput}
        placeholder="Enter app PIN"
        style={styles.input}
      />

      <Button
        label="Unlock with PIN"
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
              Alert.alert(
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
    </SafeAreaView>
  );
}
  return (
  <SafeAreaProvider>
    <GestureHandlerRootView style={{flex:1}}>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content"/>

        <View style={[
          styles.header,
          {justifyContent:'space-between'}
        ]}>
          <IconButton
            label="←"
            onPress={()=>{
              setMenu(true);
              setMapMenu(false);
            }}
          />

          <View style={{
            flexDirection:'row',
            alignItems:'center'
          }}>
            <IconButton
              label="↖"
              onPress={()=>parent&&moveTo(parent.id)}
            />
            <IconButton
              label="⌖"
              onPress={()=>{
                tx.value=withTiming(-(focusPoint?.x||0));
                ty.value=withTiming(-(focusPoint?.y||0));
                scale.value=withTiming(1);
                rotation.value=withTiming(0);
              }}
            />
            <IconButton label="Fit" onPress={fitCurrentMap}/>
            <IconButton label="↻" onPress={()=>{rotation.value=withTiming(0);}}/>
            <IconButton label="▣" onPress={()=>setShowMiniMap(v=>!v)}/>
            <IconButton
              label="⋮"
              onPress={()=>setMapMenu(v=>!v)}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,maxHeight:48}} contentContainerStyle={{alignItems:'center',paddingHorizontal:12,gap:4}}>
          {ancestors.filter(n=>n.id!=='root').map((n,i)=><Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Focus ${n.title||'Untitled'}`} onPress={()=>moveTo(n.id)} style={{padding:8}}><Text style={{color:n.id===focused?'#1d4ed8':'#475569',fontWeight:n.id===focused?'800':'500'}}>{i?'› ':''}{n.title||'Untitled'}</Text></Pressable>)}
        </ScrollView>
        {nodeActions&&<View style={[styles.popup,{top:115,right:12,maxWidth:220}]}>
          <Text style={{fontWeight:'800',color:'#334155'}} numberOfLines={2}>{notes.find(n=>n.id===nodeActions)?.title||'Note actions'}</Text>
          <Button label="Read note" onPress={()=>{openReader(nodeActions);setNodeActions(null);}}/>
          <Button label="Edit note" onPress={()=>{beginEdit(nodeActions);setNodeActions(null);}}/>
          <Button label="Add child" onPress={()=>{addChild(nodeActions);setNodeActions(null);}}/>
          <Button label="Move up a level" onPress={()=>{reparent(nodeActions,'up');setNodeActions(null);}}/>
          <Button label="Move down a level" onPress={()=>{reparent(nodeActions,'down');setNodeActions(null);}}/>
          <Button label="Delete branch" danger onPress={()=>{removeBranch(nodeActions);setNodeActions(null);}}/>
          <Button label="Cancel" onPress={()=>setNodeActions(null)}/>
        </View>}
        {mapMenu&&(
          <View style={styles.popup}>
            <Button
              label={overview?'Focus mode':'Overview'}
              onPress={()=>{
                setOverview(v=>!v);
                setMapMenu(false);
              }}
            />
            <Button
              label="Export as PDF"
              onPress={()=>exportOne('pdf')}
            />
            <Button
              label="App lock & settings"
              onPress={()=>{
                setSettings(true);
                setMapMenu(false);
              }}
            />
          </View>
        )}

        <View
          style={styles.canvas}
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
                return <View key={l.id} pointerEvents="none" style={{position:'absolute',left:(l.x1+l.x2)/2-length/2,top:(l.y1+l.y2)/2-1,width:length,height:2,backgroundColor:'#94a3b8',transform:[{rotate:`${Math.atan2(dy,dx)}rad`}]}}/>;
              })}
              {visible.map(({note,x,y,level})=>
                node(note,x,y,level)
              )}
              {hiddenIndicators.map(ind=><Pressable key={'indicator-'+ind.note.id}
                accessibilityRole="button"
                accessibilityLabel={'Expand '+(ind.note.title||'child note')}
                onPress={()=>moveTo(ind.note.id)}
                style={{position:'absolute',left:ind.x-11,top:ind.y-11,width:22,height:22,
                  borderRadius:11,borderWidth:1.5,borderColor:'#60a5fa',
                  backgroundColor:mapPrefs.colors[ind.note.id]||'#dbeafe',zIndex:5}}/> )}

            </Animated.View>
            </View>
          </GestureDetector>

        </View>

        {!menu&&<View style={{flexDirection:'row',justifyContent:'center',gap:6,paddingVertical:5,flexWrap:'wrap'}}>
          <Button label="+ Add child" onPress={()=>{setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:false}}));addChild(focused);}}/>
           <Button label="−" onPress={()=>{scale.value=withTiming(Math.max(.35,scale.value/1.2));}}/>
          <Button label="+" onPress={()=>{scale.value=withTiming(Math.min(4,scale.value*1.2));}}/>
          <Button label={mapPrefs.collapsed[focused]?'Expand branch':'Collapse branch'} onPress={()=>setMapPrefs(p=>({...p,collapsed:{...p.collapsed,[focused]:!p.collapsed[focused]}}))}/>
          <Button label="Node color" onPress={()=>setMapPrefs(p=>{const palette=['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#e9d5ff'];const current=p.colors[focused]||palette[0];return {...p,colors:{...p.colors,[focused]:palette[(palette.indexOf(current)+1)%palette.length]}};})}/>
        </View>}
        {!menu&&showMiniMap&&<View style={{height:310,marginHorizontal:14,marginBottom:6,backgroundColor:'#e2e8f0',borderRadius:12,overflow:'hidden',padding:6}}><Text style={styles.muted}>Map overview · {completeMap.length} notes</Text><Svg width="100%" height={270} viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet">{miniLines.map(l=><Line key={l.id} x1={l.x1*miniBounds.scale+miniBounds.dx} y1={l.y1*miniBounds.scale+miniBounds.dy} x2={l.x2*miniBounds.scale+miniBounds.dx} y2={l.y2*miniBounds.scale+miniBounds.dy} stroke="#94a3b8" strokeWidth={2}/>)}{completeMap.map(v=><Circle key={v.note.id} cx={v.x*miniBounds.scale+miniBounds.dx} cy={v.y*miniBounds.scale+miniBounds.dy} r={v.note.id===focused?5:3.5} fill={v.note.id===focused?'#2563eb':'#64748b'}/>)}</Svg></View>}
        {undoBatch&&(
          <View style={styles.toolbar}>
            <Button
              label="Undo deletion"
              onPress={()=>{
                const batch=trash.find(
                  t=>t.id===undoBatch
                );
                if(batch)restore(batch);
                setUndoBatch(null);
              }}
            />
          </View>
        )}
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
            <View style={{
              backgroundColor:'white',
              padding:22,
              borderRadius:18,
              gap:14
            }}>
              <Text style={styles.section}>
                Save {exportKind?.toUpperCase()} to device
              </Text>
              <Text style={styles.muted}>
                Enter a filename. Android will ask you to choose a folder
                such as Downloads or Documents.
              </Text>
              <TextInput
                style={styles.input}
                value={exportName}
                onChangeText={setExportName}
                editable={!exportBusy}
                maxLength={100}
                autoCapitalize="sentences"
              />
              <Text style={styles.muted}>
                {safeExportName(exportName,exportKind||'pdf')}
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
          <SafeAreaView style={[
            styles.screen,
            {padding:20,gap:18}
          ]}>
            <View style={styles.header}>
              <Text style={styles.logo}>Privacy & App Lock</Text>
              <Button
                label="Done"
                onPress={()=>setSettings(false)}
              />
            </View>

            <Text style={styles.muted}>
              All notes remain on this device. No cloud services
              or online accounts.
            </Text>

            {!pinConfigured?(
              <>
                <Text style={styles.section}>
                  Enable optional PIN lock
                </Text>
                <TextInput
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={12}
                  value={pinSetup}
                  onChangeText={setPinSetup}
                  placeholder="Choose a 6–12 digit PIN"
                  style={styles.input}
                />
                <Button
                  label="Enable PIN lock"
                  primary
                  onPress={enablePin}
                />
              </>
            ):(
              <>
                <Text style={styles.section}>
                  App lock enabled
                </Text>
                <Button
                  label="Lock now"
                  onPress={()=>{
                    setSettings(false);
                    setLocked(true);
                  }}
                />
                <Button
                  label={biometrics
                    ?'Disable biometric unlock'
                    :'Enable biometric unlock'}
                  onPress={async()=>{
                    try{
                      if(!biometrics&&!await biometricAvailable()){
                        Alert.alert(
                          'Unavailable',
                          'Set up device biometrics first.'
                        );
                        return;
                      }
                      await setBiometricEnabled(!biometrics);
                      setBiometrics(!biometrics);
                    }catch(e){
                      Alert.alert('Biometrics',String(e));
                    }
                  }}
                />
                <Button
                  label="Disable PIN lock"
                  danger
                  onPress={disablePin}
                />
              </>
            )}

            <Text style={styles.section}>
              Personal encrypted backup
            </Text>
            <Text style={styles.muted}>
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
            <Text style={styles.muted}>
              Security note: this app lock is an access gate, not
              full database encryption. Device encryption and
              OS screen lock remain important.
            </Text>
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
            <View style={{
              backgroundColor:'white',
              padding:20,
              borderRadius:18,
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
                  :'Restoring will REPLACE all current notes, folders and recently deleted items. The backup password is required.'}
              </Text>
              <TextInput
                secureTextEntry
                value={backupPassword}
                onChangeText={setBackupPassword}
                placeholder="Backup password (12+ characters)"
                style={styles.input}
                editable={!backupBusy}
              />
              <View style={styles.wrap}>
                <Button
                  label="Cancel"
                  onPress={()=>{
                    if(!backupBusy){
                      setBackupMode(null);
                      setBackupPassword('');
                    }
                  }}
                />
                <Button
                  label={backupBusy
                    ?'Working…'
                    :backupMode==='save'
                      ?'Choose folder & save'
                      :'Choose file & restore'}
                  primary
                  onPress={()=>{
                    if(backupMode==='restore'){
                      Alert.alert(
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
          onRequestClose={()=>setReader(null)}
        >
          <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
              <Text style={styles.logo}>
                {editing?'Edit note':'Read note'}
              </Text>
              <View style={styles.wrap}>
                {editing&&(
                  <Button
                    label="Save"
                    primary
                    onPress={saveEdit}
                  />
                )}
                {!editing&&<IconButton label="+" onPress={()=>reader&&addChild(reader)}/>}
                {!editing&&<IconButton label="✎" onPress={()=>reader&&beginEdit(reader)}/>}
                <IconButton label="×" onPress={cancelReader}/>
              </View>
            </View>

            {editing?(
              <View style={styles.editor}>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Heading"
                />
                <TextInput
                  style={[
                    styles.input,
                    {flex:1,textAlignVertical:'top'}
                  ]}
                  multiline
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write your note..."
                />
              </View>
            ):(
              <ScrollView contentContainerStyle={styles.editor}>
                <Pressable onPress={()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  <Text style={styles.readerTitle}>{activeReader?.title}</Text>
                </Pressable>
                <Pressable onPress={()=>{const now=Date.now();if(now-readerTapAt<360&&reader)beginEdit(reader);setReaderTapAt(now);}}>
                  <Text style={styles.readBody}>{activeReader?.body||'This note is empty.'}</Text>
                </Pressable>
                 <Text style={styles.muted}>Updated {activeReader?stamp(activeReader.updatedAt):''}</Text>

              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>

        <Modal
          visible={menu}
          animationType="slide"
          onRequestClose={()=>BackHandler.exitApp()}
        >
          <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
              <IconButton
                label="☰"
                onPress={()=>setSidebar(v=>!v)}
              />
              <TextInput accessibilityLabel="Search map titles" placeholder="Search maps" value={librarySearch} onChangeText={setLibrarySearch} style={{flex:1,marginHorizontal:8,paddingHorizontal:10,paddingVertical:7,backgroundColor:'#e2e8f0',borderRadius:9,fontSize:13}}/>
              <View style={{
                flexDirection:'row',
                alignItems:'center'
              }}>
                {selected.length>0?(
                  <>
                    <IconButton
                      label="☑"
                      onPress={()=>setSelected(
                        shown.map(n=>n.id)
                      )}
                    />
                    <IconButton
                      label="×"
                      onPress={()=>setSelected([])}
                    />
                    <IconButton
                      label="🗑"
                      danger
                      onPress={deleteSelected}
                    />
                    <IconButton
                      label="⋮"
                      onPress={()=>setSelectionMenu(v=>!v)}
                    />
                  </>
                ):(
                  <>
                    <IconButton
                      label="+"
                      onPress={newMap}
                    />
                    <IconButton
                      label="⋮"
                      onPress={()=>setLibraryMenu(v=>!v)}
                    />
                  </>
                )}
              </View>
            </View>

            {libraryMenu&&selected.length===0&&(
              <View style={styles.popup}>
                <Button
                  label="Export as PDF"
                  onPress={()=>exportOne('pdf','root')}
                />
              </View>
            )}

            {selectionMenu&&selected.length>0&&(
              <View style={styles.popup}>
                <Button
                  label="Move to existing folder"
                  onPress={()=>{
                    setMoveFolderMenu(true);
                    setSelectionMenu(false);
                  }}
                />
                <Button
                  label="Move to new folder"
                  onPress={()=>{
                    setCreatingFolder(true);
                    setMoveFolderMenu(true);
                    setSelectionMenu(false);
                  }}
                />
                <Button
                  label="Export selected as PDF"
                  onPress={exportSelected}
                />
              </View>
            )}

            {moveFolderMenu&&(
              <View style={styles.popup}>
                <Button
                  label="Unfiled"
                  onPress={()=>{
                    moveSelection(null);
                    setMoveFolderMenu(false);
                  }}
                />
                {folders.map(f=>(
                  <Button
                    key={f.id}
                    label={f.name}
                    onPress={()=>{
                      moveSelection(f.id);
                      setMoveFolderMenu(false);
                    }}
                  />
                ))}
                <Button
                  label="Cancel"
                  onPress={()=>setMoveFolderMenu(false)}
                />
              </View>
            )}

            {sidebar&&(
              <View style={styles.sidebar}>
                <View style={styles.header}>
                  <Text style={styles.section}>
                    Folders & tools
                  </Text>
                  <IconButton
                    label="×"
                    onPress={()=>setSidebar(false)}
                  />
                </View>
                <ScrollView contentContainerStyle={{
                  padding:12,
                  gap:10
                }}>
                  <Button
                    label="All maps"
                    onPress={()=>{
                      setFolderFilter(null);
                      setShowTrash(false);
                      setSidebar(false);setFoldersExpanded(false);
                    }}
                  />
                  <Button label={foldersExpanded?'Folders ▾':'Folders ▸'} onPress={()=>setFoldersExpanded(v=>!v)}/>
                  {foldersExpanded&&folders.map(f=>(
                    <Button
                      key={f.id}
                      label={f.name}
                      onPress={()=>{
                        setFolderFilter(f.id);
                        setShowTrash(false);
                        setSidebar(false);setFoldersExpanded(false);
                      }}
                    />
                  ))}
                  {foldersExpanded&&<Button
                    label="+ Create folder"
                    onPress={()=>setCreatingFolder(true)}
                  />}
                  <Button
                    label="Recently Deleted"
                    onPress={()=>{
                      setShowTrash(true);
                      setSidebar(false);setFoldersExpanded(false);
                      setSelected([]);
                    }}
                  />
                  <Button label="Settings & app lock" onPress={()=>{setSettings(true);setSidebar(false);setFoldersExpanded(false);}}/>
                </ScrollView>
              </View>
            )}

            {creatingFolder&&(
              <View style={[
                styles.wrap,
                {padding:12}
              ]}>
                <TextInput
                  style={[
                    styles.input,
                    {flex:1}
                  ]}
                  value={folderName}
                  onChangeText={setFolderName}
                  placeholder="Folder name"
                />
                <Button
                  label="Create"
                  primary
                  onPress={()=>{
                    if(folderName.trim()){
                      const newId=id();
                      setFolders(f=>[
                        ...f,
                        {
                          id:newId,
                          name:folderName.trim()
                        }
                      ]);
                      if(selected.length){
                        moveSelection(newId);
                      }
                      setFolderName('');
                      setCreatingFolder(false);
                      setMoveFolderMenu(false);
                    }
                  }}
                />
                <Button
                  label="Cancel"
                  onPress={()=>setCreatingFolder(false)}
                />
              </View>
            )}

            {!showTrash&&<View style={{paddingHorizontal:16,paddingVertical:6,gap:6}}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                <Text style={styles.muted}>{shown.length} {shown.length===1?'map':'maps'}{selected.length>0?` · ${selected.length} selected`:''}</Text>
                <Button label={librarySort==='modified'?'Sort: Modified ▾':librarySort==='title'?'Sort: Title ▾':'Sort: Created ▾'} onPress={()=>setSortMenu(v=>!v)}/>
              </View>
              {sortMenu&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
                {(['modified','title','created'] as const).map(option=>(
                  <Button key={option} label={`${librarySort===option?'✓ ':''}${option==='modified'?'Last modified':option==='title'?'Title A–Z':'Date created'}`} onPress={()=>{setLibrarySort(option);setSortMenu(false);}}/>
                ))}
              </View>}
            </View>}
            <ScrollView contentContainerStyle={{
              padding:16,
              gap:12
            }}>
              {showTrash?(
                <View style={{gap:12,backgroundColor:'#fff1f2',borderColor:'#fecdd3',borderWidth:1,borderRadius:16,padding:12}}>
                  <Text style={[styles.section,{color:'#9f1239'}]}>
                    Recently Deleted
                  </Text>

                  {trash.length===0&&(
                    <Text style={styles.muted}>
                      Nothing here.
                    </Text>
                  )}

                  {trash.map(b=>(
                    <View
                      key={b.id}
                      style={styles.listRow}
                    >
                      <View style={{flex:1}}>
                        <Text style={styles.listTitle}>
                          {b.notes[0]?.title||'Deleted notes'}
                        </Text>
                        <Text style={styles.muted}>
                          Deleted {stamp(b.deletedAt)}
                        </Text>
                      </View>
                      <Button
                        label="Restore"
                        primary
                        onPress={()=>restore(b)}
                      />
                      <Button
                        label="Delete forever"
                        danger
                        onPress={()=>Alert.alert(
                          'Delete permanently?',
                          'These notes cannot be recovered.',
                          [
                            {text:'Cancel'},
                            {
                              text:'Delete',
                              style:'destructive',
                              onPress:()=>setTrash(t=>
                                t.filter(x=>x.id!==b.id)
                              )
                            }
                          ]
                        )}
                      />
                    </View>
                  ))}
                </View>
              ):(
                <>
                  {shown.map(n=>(
                    <Pressable
                      key={n.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.title||'Untitled map'}${mapPrefs.pinned.includes(n.id)?', pinned':''}${selected.includes(n.id)?', selected':''}`}
                      accessibilityHint="Tap to open; long press to select"
                      style={styles.listRow}
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
                          scale.value=withTiming(1);
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
                      <View style={{flex:1}}>
                        <Text style={styles.listTitle}>
                          {n.title||'Untitled map'}
                        </Text>
                        <Text style={styles.muted}>
                          {new Date(n.updatedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'})} {new Date(n.updatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase()}
                        </Text>
                      </View>

                      {selected.length===0&&<IconButton label={mapPrefs.pinned.includes(n.id)?'★':'☆'} accessibilityLabel={mapPrefs.pinned.includes(n.id)?'Unpin map':'Pin map'} onPress={()=>setMapPrefs(p=>({...p,pinned:p.pinned.includes(n.id)?p.pinned.filter(x=>x!==n.id):[...p.pinned,n.id]}))}/>}
                      {selected.length>0&&(
                        <Text style={styles.checkbox}>
                          {selected.includes(n.id)?'☑':'☐'}
                        </Text>
                      )}
                    </Pressable>
                  ))}

                  {shown.length===0&&(
                    <View style={{alignItems:'center',paddingVertical:48,paddingHorizontal:20,gap:12}}>
                      <Text style={{fontSize:34,color:'#64748b'}}>◎</Text>
                      <Text style={[styles.listTitle,{textAlign:'center'}]}>{librarySearch.trim()?'No matching maps':folderFilter?'This folder is empty':'Your library is ready'}</Text>
                      <Text style={[styles.muted,{textAlign:'center'}]}>{librarySearch.trim()?'Try a different search term.':folderFilter?'Create a map or move an existing map into this folder.':'Create your first map to start building your notes.'}</Text>
                      {librarySearch.trim()?<Button label="Clear search" onPress={()=>setLibrarySearch('')}/>:<Button label="Create map" primary onPress={newMap}/>}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  </SafeAreaProvider>
);
}

const styles=StyleSheet.create({
  screen:{
    flex:1,
    backgroundColor:'#f8fafc'
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
    color:'#0f172a'
  },
  button:{
    borderRadius:12,
    backgroundColor:'#e2e8f0',
    paddingVertical:9,
    paddingHorizontal:12
  },
  primary:{
    backgroundColor:'#315fd6'
  },
  danger:{
    backgroundColor:'#dc2626'
  },
  buttonText:{
    fontSize:12,
    fontWeight:'700',
    color:'#334155'
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
    backgroundColor:'#f1f5f9'
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
    padding:10,
    borderRadius:12,
    gap:8,
    borderWidth:1,
    borderColor:'#cbd5e1'
  },
  sidebar:{
    position:'absolute',
    top:0,
    bottom:0,
    left:0,
    width:'47%',
    backgroundColor:'#f8fafc',
    zIndex:40,
    elevation:20,
    borderRightWidth:1,
    borderRightColor:'#cbd5e1'
  },
  muted:{
    fontSize:12,
    color:'#64748b'
  },
  editor:{
    padding:20,
    flex:1,
    gap:16
  },
  input:{
    borderWidth:1,
    borderColor:'#cbd5e1',
    borderRadius:12,
    backgroundColor:'white',
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
