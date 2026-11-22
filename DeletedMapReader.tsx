/** Read-only recovery viewer. It never receives setNotes or writes to persistent storage. */
import React,{useMemo,useState} from 'react';
import {Pressable,Text,View,ScrollView} from 'react-native';
import Svg,{Circle,Line} from 'react-native-svg';
import Animated,{runOnJS,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {radialTree,fitMap} from './mapGeometry';
import type {TrashBatch} from './trash';
import type {Note} from './export';
import {parseRichLine} from './noteFormatting';
import {displayKeepColor,keepForeground} from './keepTheme';

type Colors={background:string;surface:string;text:string;muted:string;accent:string;border:string;connector:string;node:string;subnode:string};
type Props={batch:TrashBatch;palette:Colors;theme:'light'|'dark';colors:Record<string,string>;onClose:()=>void};
export default function DeletedMapReader({batch,palette,theme,colors,onClose}:Props){
 const [focus,setFocus]=useState(batch.notes[0]?.id||'');
 const [reading,setReading]=useState<string|null>(null);
 const [collapsed,setCollapsed]=useState<string[]>([]);
 const [canvas,setCanvas]=useState({width:360,height:460});
 const [mini,setMini]=useState(false);
 const root=useMemo(()=>batch.notes.find(n=>!batch.notes.some(x=>x.id===n.parentId))||batch.notes[0],[batch]);
 const points=useMemo(()=>root?radialTree(root,batch.notes):[],[root,batch.notes]);
 const byId=useMemo(()=>new Map(batch.notes.map(n=>[n.id,n])),[batch.notes]);
 const hidden=useMemo(()=>{const ids=new Set<string>();collapsed.forEach(id=>{const visit=(parent:string)=>batch.notes.filter(n=>n.parentId===parent).forEach(n=>{ids.add(n.id);visit(n.id);});visit(id);});return ids;},[collapsed,batch.notes]);
 const visible=points.filter(p=>!hidden.has(p.note.id));
 const active=byId.get(focus)||root;
 const read=byId.get(reading||'');
 const ancestors:Note[]=[];if(active){let n:Note|undefined=active;const seen=new Set<string>();while(n&&!seen.has(n.id)){ancestors.unshift(n);seen.add(n.id);n=n.parentId?byId.get(n.parentId):undefined;}}
 const panX=useSharedValue(0),panY=useSharedValue(0),zoom=useSharedValue(1),angle=useSharedValue(0),xStart=useSharedValue(0),yStart=useSharedValue(0),zStart=useSharedValue(1),rStart=useSharedValue(0);
 const layout=useMemo(()=>fitMap(visible.length?visible:points,Math.max(100,canvas.width),Math.max(100,canvas.height)),[points,hidden,canvas.width,canvas.height]);
 const base=Math.max(0.12,Math.min(1.5,layout.scale||0.5));
 const fit=()=>{panX.value=withTiming(0);panY.value=withTiming(0);zoom.value=withTiming(1);angle.value=withTiming(0);};
 const pan=Gesture.Pan().onStart(()=>{xStart.value=panX.value;yStart.value=panY.value;}).onUpdate(e=>{panX.value=xStart.value+e.translationX;panY.value=yStart.value+e.translationY;});
 const pinch=Gesture.Pinch().onStart(()=>{zStart.value=zoom.value;}).onUpdate(e=>{zoom.value=Math.max(0.2,Math.min(4,zStart.value*e.scale));});
 const rotate=Gesture.Rotation().onStart(()=>{rStart.value=angle.value;}).onUpdate(e=>{angle.value=rStart.value+e.rotation;});
 const transform=useAnimatedStyle(()=>({transform:[{translateX:panX.value},{translateY:panY.value},{scale:zoom.value},{rotateZ:`${angle.value}rad`}]}));
 const miniRotation=useAnimatedStyle(()=>({transform:[{rotateZ:`${angle.value}rad`}]}));
 const renderBody=(body:string)=>body.split('\n').map((line,i)=><Text key={i} style={{fontSize:16,lineHeight:26,color:palette.text,minHeight:24}}>{parseRichLine(line).map((run,j)=><Text key={j} style={{fontWeight:run.bold?'700':'400',fontStyle:run.italic?'italic':'normal',textDecorationLine:run.underline?'underline':'none'}}>{run.text}</Text>)}</Text>);
 const focusedPoint=points.find(p=>p.note.id===focus);
 const miniScale=Math.max(0.1,Math.min(1,150/(points.reduce((v,p)=>Math.max(v,Math.abs(p.x)),1)*2+120),100/(points.reduce((v,p)=>Math.max(v,Math.abs(p.y)),1)*2+120)));
 return <GestureHandlerRootView style={{flex:1,backgroundColor:palette.background}}>
  <View style={{height:62,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,borderBottomWidth:1,borderColor:palette.border}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Back to Deleted" onPress={reading?()=>setReading(null):onClose} style={{padding:8}}><Text style={{color:palette.text,fontSize:24}}>‹</Text></Pressable>
   <Text style={{flex:1,fontSize:18,fontWeight:'600',color:palette.text}} numberOfLines={1}>{reading?(read?.title||'Untitled note'):(root?.title||'Untitled map')}</Text>
   {!reading&&<Pressable accessibilityRole="button" accessibilityLabel="Fit deleted map" onPress={fit} style={{padding:8}}><Text style={{color:palette.accent,fontWeight:'600'}}>Fit</Text></Pressable>}
  </View>
  {reading?(
   <ScrollView contentContainerStyle={{padding:24,gap:18}}><Text style={{fontSize:25,fontWeight:'600',color:palette.text}}>{read?.title||'Untitled note'}</Text>{renderBody(read?.body||'')}</ScrollView>
  ):(
   <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,maxHeight:49}} contentContainerStyle={{paddingHorizontal:12,alignItems:'center'}}>
      {ancestors.map((n,i)=><Pressable key={n.id} onPress={()=>setFocus(n.id)} style={{padding:9}} accessibilityLabel={`Focus ${n.title||'note'}`}><Text style={{color:n.id===focus?palette.accent:palette.muted,fontWeight:n.id===focus?'700':'400'}}>{i?'› ':''}{n.title||'Untitled'}</Text></Pressable>)}
    </ScrollView>
    <GestureDetector gesture={Gesture.Simultaneous(pan,pinch,rotate)}>
     <View style={{flex:1,overflow:'hidden',backgroundColor:palette.background}} onLayout={e=>setCanvas({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})}>
      <Animated.View style={[{position:'absolute',left:canvas.width/2,top:canvas.height/2,width:0,height:0},transform]}>
       <View style={{position:'absolute',left:0,top:0,transform:[{scale:base}]}}>
        {visible.filter(v=>v.note.parentId).map(v=>{const p=visible.find(x=>x.note.id===v.note.parentId);return p?<View key={'edge-'+v.note.id} pointerEvents="none" style={{position:'absolute',left:Math.min(p.x,v.x),top:Math.min(p.y,v.y),width:Math.abs(v.x-p.x)+1,height:Math.abs(v.y-p.y)+1}}><Svg width="100%" height="100%"><Line x1={p.x<=v.x?0:Math.abs(v.x-p.x)} y1={p.y<=v.y?0:Math.abs(v.y-p.y)} x2={p.x<=v.x?Math.abs(v.x-p.x):0} y2={p.y<=v.y?Math.abs(v.y-p.y):0} stroke={palette.connector} strokeWidth={2.5}/></Svg></View>:null;})}
        {visible.map(p=>{
          const size=[120,110,90,80,75,70][Math.min(p.level,5)];
          const bg=displayKeepColor(colors[p.note.id],theme,p.note.id===focus?palette.accent:palette.node);
          const double=Gesture.Tap().numberOfTaps(2).maxDelay(270).onEnd((_e,ok)=>{if(ok)runOnJS(setReading)(p.note.id);});
          const single=Gesture.Tap().numberOfTaps(1).onEnd((_e,ok)=>{if(ok)runOnJS(setFocus)(p.note.id);});
          return <GestureDetector key={p.note.id} gesture={Gesture.Exclusive(double,single)}>
           <View accessibilityLabel={p.note.title||'Untitled note'} style={{position:'absolute',left:p.x-size/2,top:p.y-size/2,width:size,height:size,borderRadius:size/2,borderWidth:p.note.id===focus?3:1.5,borderColor:p.note.id===focus?palette.accent:palette.border,backgroundColor:bg,justifyContent:'center',alignItems:'center',padding:8}}>
            <Text numberOfLines={2} style={{textAlign:'center',fontWeight:'600',fontSize:p.level>2?13:16,color:keepForeground(bg)}}>{p.note.title||'Untitled'}</Text>
           </View>
          </GestureDetector>;
        })}
       </View>
      </Animated.View>
     </View>
    </GestureDetector>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-around',padding:8,borderTopWidth:1,borderColor:palette.border}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Read focused note" onPress={()=>setReading(focus)} style={{padding:11}}><Text style={{color:palette.accent}}>Read</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Expand or collapse focused branch" onPress={()=>setCollapsed(v=>v.includes(focus)?v.filter(x=>x!==focus):[...v,focus])} style={{padding:11}}><Text style={{color:palette.text}}>{collapsed.includes(focus)?'Expand':'Collapse'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle deleted map mini-map" onPress={()=>setMini(v=>!v)} style={{padding:11}}><Text style={{color:palette.accent}}>Mini-map</Text></Pressable>
    </View>
    {mini&&<View style={{height:100,alignItems:'center',justifyContent:'center',borderTopWidth:1,borderColor:palette.border}}><Animated.View style={miniRotation}><Svg width={220} height={96} viewBox="0 0 220 96">{points.map(p=><Circle key={p.note.id} cx={110+p.x*miniScale} cy={48+p.y*miniScale} r={p.note.id===focus?4:2.5} fill={p.note.id===focus?palette.accent:palette.muted}/>)}</Svg></Animated.View></View>}
    <Text style={{color:palette.muted,fontSize:11,textAlign:'center',paddingVertical:5}}>Read only · Tap to focus · Double-tap to read · Pinch, drag or rotate</Text>
   </>
  )}
 </GestureHandlerRootView>;
}
