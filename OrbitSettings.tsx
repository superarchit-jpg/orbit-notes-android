/** Settings redesign: UI isolated from stored SQLite data and secure credential material. */
import React,{useEffect,useRef,useState} from 'react';
import {Image,Keyboard,Modal,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Path,Circle,Rect,G} from 'react-native-svg';
import type {CredentialKind} from './appLock';
import {DARK,LEGACY_LIGHT,LEGACY_DARK} from './orbitThemeTokens';

type Palette={background:string;surface:string;control:string;text:string;muted:string;border:string;accent:string};
type Page='home'|'appLock'|'backup'|'about';
type Stage='verify'|'new'|'confirm';
type Props={
 palette:Palette;
 themeMode:'light'|'dark'|'system';
 onTheme:(v:'light'|'dark'|'system')=>void;
 lockEnabled:boolean; configured:boolean; selectedKind:CredentialKind;
 biometric:boolean;
 onToggleLock:(on:boolean)=>Promise<void>;
 onToggleBiometric:(on:boolean)=>Promise<void>;
 onVerify:(oldValue:string)=>Promise<boolean>;
 onSaveCredential:(value:string,kind:CredentialKind)=>Promise<void>;
 onResetCredential:()=>Promise<void>;
 onVerifyBiometric:()=>Promise<boolean>;
 registerBack:(handler:()=>void)=>void;
 appVersion:string; buildNumber:string;
 onBackup:(kind:'save'|'restore')=>void;
 onLockNow:()=>void;
 onClose:()=>void;
};
const glyph=(d:string,color:string)=><Svg width={23} height={23} viewBox="0 0 24 24"><Path d={d} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
/**
 * Approved Orbit Notes App Info wallpaper, redrawn as native vectors.
 * The paired theme palettes keep the central copy unobstructed without
 * shipping a large bitmap or introducing any online dependency.
 */
const AppInfoBackdrop=({dark}:{dark:boolean})=>{
 const ink=dark?'#8D9EAB':'#BDB6AA';
 const paper=dark?'#191F29':'#F8F6F0';
 const networks=[
  {x:40,y:72,s:0.9},{x:313,y:102,s:0.83},{x:29,y:515,s:0.8},
  {x:325,y:585,s:0.85},{x:48,y:699,s:0.95},{x:292,y:710,s:0.8}
 ];
 const papers=[{x:89,y:28,r:-6},{x:275,y:183,r:9},{x:28,y:348,r:-12},{x:297,y:461,r:12},{x:89,y:645,r:6},{x:231,y:729,r:-9}];
 const sparks=[[19,23],[166,50],[337,33],[65,255],[307,324],[37,446],[335,544],[18,623],[241,606],[343,747]];
 return <Svg pointerEvents="none" accessible={false} style={{position:'absolute',top:0,right:0,bottom:0,left:0}} width="100%" height="100%" viewBox="0 0 360 760" preserveAspectRatio="xMidYMid slice">
   <Rect x={0} y={0} width={360} height={760} fill={paper}/>
   <G stroke={ink} strokeWidth={1.1} fill="none" opacity={dark?0.57:0.29} strokeLinecap="round" strokeLinejoin="round">
     {networks.map(({x,y,s},i)=><G key={'network'+i} transform={`translate(${x} ${y}) scale(${s})`}>
       <Path d="M0 0L-23-20M0 0L29-27M0 0L37 19M0 0L-13 39"/>
       <Circle cx={0} cy={0} r={13}/><Circle cx={-23} cy={-20} r={8}/><Circle cx={29} cy={-27} r={8}/><Circle cx={37} cy={19} r={8}/><Circle cx={-13} cy={39} r={8}/>
     </G>)}
     {papers.map(({x,y,r},i)=><G key={'paper'+i} transform={`translate(${x} ${y}) rotate(${r})`}>
       <Path d="M-12-19H7L14-12V20H-12zM7-19v7h7M-6-6H8M-6 1H9M-6 8H3"/>
     </G>)}
     <Path d="M-37 239C-12 193 26 196 39 201M41 201A36 36 0 1 1 2 253M353 311A65 65 0 0 0 312 362M-33 576A60 60 0 0 0 37 514M285 674C315 631 346 638 384 647M170-18A83 83 0 0 1 115 63"/>
     <Circle cx={52} cy={205} r={3}/><Circle cx={312} cy={362} r={3}/><Circle cx={37} cy={514} r={3}/>
     <Path d="M301 248l13-17 8 5-14 17-9 3zM314 231l4-5 8 5-4 5M299 256l6-3"/>
     <Path d="M146 673l13-16 8 6-14 15-9 3zM159 657l3-4 9 6-4 4"/>
     {sparks.map(([x,y],i)=><Path key={'spark'+i} d={`M${x} ${y-7}Q${x+1} ${y-1} ${x+7} ${y}Q${x+1} ${y+1} ${x} ${y+7}Q${x-1} ${y+1} ${x-7} ${y}Q${x-1} ${y-1} ${x} ${y-7}Z`}/>)}
     {[[175,112],[41,291],[332,396],[145,405],[226,555],[58,606],[295,75],[9,722],[194,735]].map(([x,y],i)=><Circle key={'dot'+i} cx={x} cy={y} r={i%3===0?2:1.2} fill={ink} stroke="none"/>)}
   </G>
   {/* Continue the approved pattern through the central content zone; the
       original app icon and opaque text remain over this subdued layer. */}
   <G stroke={ink} strokeWidth={1} fill="none" opacity={dark?0.30:0.19} strokeLinecap="round" strokeLinejoin="round">
     <G transform="translate(117 307) scale(0.72)">
       <Path d="M0 0L-23-20M0 0L29-27M0 0L37 19M0 0L-13 39"/>
       <Circle cx={0} cy={0} r={13}/><Circle cx={-23} cy={-20} r={8}/><Circle cx={29} cy={-27} r={8}/><Circle cx={37} cy={19} r={8}/><Circle cx={-13} cy={39} r={8}/>
     </G>
     <G transform="translate(256 427) scale(0.7)">
       <Path d="M0 0L-23-20M0 0L29-27M0 0L37 19M0 0L-13 39"/>
       <Circle cx={0} cy={0} r={13}/><Circle cx={-23} cy={-20} r={8}/><Circle cx={29} cy={-27} r={8}/><Circle cx={37} cy={19} r={8}/><Circle cx={-13} cy={39} r={8}/>
     </G>
     <G transform="translate(178 235) rotate(-11)">
       <Path d="M-12-19H7L14-12V20H-12zM7-19v7h7M-6-6H8M-6 1H9M-6 8H3"/>
     </G>
     <G transform="translate(98 476) rotate(9)">
       <Path d="M-12-19H7L14-12V20H-12zM7-19v7h7M-6-6H8M-6 1H9M-6 8H3"/>
     </G>
     <Path d="M224 272A36 36 0 0 0 260 307M73 375A38 38 0 0 1 108 350"/>
     {[[205,339],[155,455],[278,356],[82,291],[216,492]].map(([x,y],i)=><Path key={'centerSpark'+i} d={`M${x} ${y-6}Q${x+1} ${y-1} ${x+6} ${y}Q${x+1} ${y+1} ${x} ${y+6}Q${x-1} ${y+1} ${x-6} ${y}Q${x-1} ${y-1} ${x} ${y-6}Z`}/>)}
     {[[152,348],[211,391],[266,473],[124,401],[205,283]].map(([x,y],i)=><Circle key={'centerDot'+i} cx={x} cy={y} r={1.5} fill={ink} stroke="none"/>)}
   </G>
 </Svg>;
};
export default function OrbitSettings({palette:optionAPalette,themeMode,onTheme,lockEnabled,configured,selectedKind,biometric,onToggleLock,onToggleBiometric,onVerify,onSaveCredential,onResetCredential,onVerifyBiometric,registerBack,appVersion,buildNumber,onBackup,onLockNow,onClose}:Props){
 const [page,setPage]=useState<Page>('home');
 // All Settings pages use the original palette; App Info alone retains
 // the approved warm background motif and its matching Option A colors.
 const palette=page==='about'?optionAPalette:
   (optionAPalette.background===DARK.background?LEGACY_DARK:LEGACY_LIGHT);
 const [credentialModal,setCredentialModal]=useState<CredentialKind|null>(null);
 const [stage,setStage]=useState<Stage>('new');
 const [oldValue,setOldValue]=useState('');
 const [newValue,setNewValue]=useState('');
 const [confirmValue,setConfirmValue]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [showSecret,setShowSecret]=useState(false);
 const [pendingFirstSetup,setPendingFirstSetup]=useState(false);
 const [securityAction,setSecurityAction]=useState<'change'|'toggle'|'reset'>('change');
 const [requestedLockState,setRequestedLockState]=useState<boolean|null>(null);
 const biometricInFlight=useRef(false);
 const verificationSession=useRef(0);
 const autoPromptedSession=useRef(-1);
 const newSession=()=>{verificationSession.current+=1;autoPromptedSession.current=-1;};
 const dismissCredential=()=>{if(busy||biometricInFlight.current)return;newSession();setCredentialModal(null);setMessage('');Keyboard.dismiss();};
 const goBack=()=>{if(credentialModal){dismissCredential();return;}if(page!=='home'){setPage('home');setMessage('');return;}onClose();};
 useEffect(()=>{registerBack(goBack);},[page,credentialModal]);
 const openCredential=(kind:CredentialKind)=>{newSession();setSecurityAction('change');setCredentialModal(kind);setStage(configured?'verify':'new');setOldValue('');setNewValue('');setConfirmValue('');setShowSecret(false);setMessage('');};
 const submit=async()=>{
  if(!credentialModal||busy)return;
  const kind=credentialModal;
  if(stage==='new'){
   if(kind==='pin'?!/^\d{4,}$/.test(newValue):Array.from(newValue).length<6){setMessage(kind==='pin'?'PIN must have at least 4 digits.':'Password must have at least 6 characters.');return;}
   setStage('confirm');setMessage('');return;
  }
  if(stage==='confirm'){
   if(confirmValue!==newValue){setMessage('Credentials do not match.');return;}
   setBusy(true);
   try{await onSaveCredential(newValue,kind);setPendingFirstSetup(false);setCredentialModal(null);setOldValue('');setNewValue('');setConfirmValue('');setMessage('');Keyboard.dismiss();}
   catch(e){setMessage(String(e));}finally{setBusy(false);}
   return;
  }
  setBusy(true);
  try{if(await onVerify(oldValue)){
    if(securityAction==='reset'){await onResetCredential();setPendingFirstSetup(false);setCredentialModal(null);}
    else if(securityAction==='toggle'&&requestedLockState!==null){await onToggleLock(requestedLockState);setCredentialModal(null);}
    else setStage('new');
    setMessage('');setOldValue('');
   }else setMessage('Incorrect existing PIN or password.');}
  catch(e){setMessage(String(e));}finally{setBusy(false);}
 };
 const requestLockChange=(enabled:boolean)=>{
  if(!configured){setPendingFirstSetup(enabled);return;}
  newSession();setSecurityAction('toggle');setRequestedLockState(enabled);setCredentialModal(selectedKind);setStage('verify');setOldValue('');setMessage('');
 };
 const requestReset=()=>{newSession();setSecurityAction('reset');setCredentialModal(selectedKind);setStage('verify');setOldValue('');setMessage('');};
 const verifyWithBiometrics=async()=>{
  if(busy||biometricInFlight.current||stage!=='verify'||!biometric||!credentialModal)return;
  const session=verificationSession.current;
  biometricInFlight.current=true;
  setBusy(true);
  try{
   const verified=await onVerifyBiometric();
   if(session!==verificationSession.current)return;
   if(!verified){setMessage('Biometric verification was not successful. Use your PIN or password.');return;}
   if(securityAction==='reset'){
    await onResetCredential();setPendingFirstSetup(false);
   }else if(securityAction==='toggle'&&requestedLockState!==null){
    await onToggleLock(requestedLockState);
   }else{
    setStage('new');setOldValue('');setMessage('');return;
   }
   newSession();setCredentialModal(null);setMessage('');Keyboard.dismiss();
  }catch(e){if(session===verificationSession.current)setMessage(String(e));}
  finally{biometricInFlight.current=false;setBusy(false);}
 };
 const showBiometricPrompt=()=>{
  if(stage!=='verify'||!biometric||autoPromptedSession.current===verificationSession.current)return;
  autoPromptedSession.current=verificationSession.current;
  void verifyWithBiometrics();
 };
 const text={color:palette.text,fontSize:16};
 const detail={color:palette.muted,fontSize:12};
 const label=(value:string)=><Text style={{color:palette.muted,fontWeight:'600',fontSize:12,letterSpacing:0.4}}>{value}</Text>;
 const divider=<View style={{height:1,backgroundColor:palette.border,opacity:0.6,marginVertical:8}}/>;
 const row=(name:string,icon:string,action:()=>void,sub?:string)=><Pressable accessibilityRole="button" accessibilityLabel={name} onPress={action} style={{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:12,minHeight:57}}>
   {glyph(icon,palette.muted)}
   <View style={{flex:1,gap:3}}><Text style={text}>{name}</Text>{sub!==undefined&&<Text style={detail}>{sub}</Text>}</View>
   {glyph('m9 18 6-6-6-6',palette.muted)}
 </Pressable>;
 const modeButton=(mode:'light'|'dark'|'system',title:string)=><Pressable key={mode} accessibilityRole="button" accessibilityLabel={title+' theme'} accessibilityState={{selected:themeMode===mode}} onPress={()=>onTheme(mode)} style={{flex:1,borderRadius:22,minHeight:43,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:themeMode===mode?palette.accent:palette.border,backgroundColor:themeMode===mode?palette.accent:palette.control}}>
   <Text style={{fontSize:14,fontWeight:'600',color:themeMode===mode?(palette.background==='#F8F6F0'?'#2E3036':'#F1ECE5'):palette.text}}>{title}</Text>
 </Pressable>;
 return <SafeAreaView style={{flex:1,backgroundColor:page==='about'?(palette.background==='#F8F6F0'?'#F8F6F0':'#191F29'):palette.background}}>
   {page==='about'&&<AppInfoBackdrop dark={palette.background!=='#F8F6F0'}/>} 
  <View style={{minHeight:62,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:14}}>
   <Pressable accessibilityRole="button" accessibilityLabel={page==='home'?'Back to previous library screen':'Back to Settings'} onPress={goBack} style={{width:44,height:48,justifyContent:'center',alignItems:'center'}}>{glyph('M20 12H4m7-7-7 7 7 7',palette.text)}</Pressable>
   <Text style={{fontSize:22,fontWeight:'600',color:palette.text}}>{page==='home'?'Settings':page==='appLock'?'App Lock':page==='backup'?'Backup & Restore':'App Info'}</Text>
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={page==='about'?{flexGrow:1,paddingHorizontal:20,paddingVertical:24}:{paddingHorizontal:20,paddingTop:14,paddingBottom:48,gap:12}}>
   {page==='home'?<>
    {label('APPEARANCE')}
    <Text style={[text,{fontWeight:'600'}]}>Theme</Text>
    <View style={{flexDirection:'row',gap:9,marginBottom:10}}>{modeButton('light','Light')}{modeButton('dark','Dark')}{modeButton('system','System')}</View>
    {divider}
    {label('PRIVACY & SECURITY')}
    {row('App Lock','M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5z',()=>{setPage('appLock');setMessage('');},lockEnabled?'On':'Off')}
    {row('Backup & Restore','M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',()=>setPage('backup'))}
    {divider}
    {label('ABOUT')}
    {row('App Info','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 11v6m0-10h.01',()=>setPage('about'))}
   </>:page==='appLock'?<>
    <View style={{flexDirection:'row',alignItems:'center',minHeight:52,justifyContent:'space-between'}}>
     <Text style={[text,{fontWeight:'600'}]}>App Lock</Text>
     <Switch accessibilityLabel="Enable app lock" value={lockEnabled} trackColor={{false:palette.border,true:palette.accent}} thumbColor="#ffffff" onValueChange={async enabled=>{
       requestLockChange(enabled);
     }}/>
    </View>
    {(lockEnabled||pendingFirstSetup)&&<>
     {divider}
     {(['pin','password'] as const).map(kind=><View key={kind} style={{flexDirection:'row',alignItems:'center',minHeight:56,gap:16}}>
      <Text style={[text,{flex:1}]}>{kind==='pin'?'PIN':'Password'}</Text>
      <Pressable accessibilityRole="radio" accessibilityState={{selected:configured&&kind===selectedKind}} accessibilityLabel={kind==='pin'?'Select PIN':'Select Password'} onPress={()=>openCredential(kind)} style={{padding:9}}><Svg width={23} height={23} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} stroke={configured&&kind===selectedKind?palette.accent:palette.muted} fill="none" strokeWidth={2}/>{configured&&kind===selectedKind&&<Circle cx={12} cy={12} r={5} fill={palette.accent}/>}</Svg></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={kind==='pin'?'Configure PIN':'Configure Password'} onPress={()=>openCredential(kind)} style={{padding:9}}>{glyph('m9 18 6-6-6-6',palette.text)}</Pressable>
     </View>)}
     {divider}
     {lockEnabled&&<View style={{flexDirection:'row',alignItems:'center',minHeight:58,justifyContent:'space-between'}}>
      <Text style={text}>Biometric Unlock</Text>
      <Switch accessibilityLabel="Biometric Unlock" value={biometric} trackColor={{false:palette.border,true:palette.accent}} thumbColor="#ffffff" onValueChange={async enabled=>{try{await onToggleBiometric(enabled);setMessage('');}catch(e){setMessage(String(e));}}}/>
     </View>}
     {configured&&<Pressable accessibilityRole="button" accessibilityLabel="Reset security credentials" onPress={requestReset} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:palette.text,fontWeight:'600'}}>Reset</Text></Pressable>}
     {divider}
     {lockEnabled&&<Pressable accessibilityRole="button" accessibilityLabel="Lock now" onPress={onLockNow} style={{minHeight:52,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:palette.control}}>
       <Text style={[text,{fontWeight:'600'}]}>Lock now</Text>
     </Pressable>}
    </>}
    {!!message&&<Text style={{fontSize:13,color:palette.muted}}>{message}</Text>}
   </>:page==='backup'?<>
    {row('Create Backup','M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',()=>onBackup('save'))}
    {divider}
    {row('Restore Backup','M12 21V9m-5 5 5-5 5 5M5 7V3h14v4',()=>onBackup('restore'))}
   </>:<View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:20,gap:12}}>
     <Text accessibilityRole="header" style={{fontSize:27,fontWeight:'600',color:palette.text}}>Orbit Notes</Text>
     <Text style={{fontSize:16,color:palette.muted}}>Version {appVersion}</Text>
     <Image source={require('./assets/icon.png')} accessibilityLabel="Orbit Notes app icon" resizeMode="contain" style={{width:128,height:128,borderRadius:28,marginVertical:38}}/>
     <Text style={{fontSize:15,color:palette.muted}}>Developed by Archit Gupta</Text>
     <Text style={{fontSize:15,color:palette.muted}}>Powered by AI</Text>
    </View>}
  </ScrollView>
  <Modal visible={credentialModal!==null} transparent animationType="fade" onShow={showBiometricPrompt} onRequestClose={dismissCredential}>
   <View style={{flex:1,justifyContent:'center',paddingHorizontal:24,backgroundColor:'rgba(0,0,0,0.62)'}}>
    <Pressable style={{position:'absolute',top:0,bottom:0,left:0,right:0}} accessibilityLabel="Dismiss credential setup" onPress={dismissCredential}/>
    <View style={{padding:22,gap:18,borderRadius:26,backgroundColor:palette.surface}}>
     <Text style={{fontSize:20,fontWeight:'600',color:palette.text}}>{credentialModal==='pin'?'PIN':'Password'}</Text>
     <Text style={{color:palette.muted,fontSize:14}}>{stage==='verify'?'Enter the existing '+(selectedKind==='pin'?'PIN.':'password.'):stage==='new'?'Enter a new '+(credentialModal==='pin'?'PIN.':'password.'):'Confirm the new '+(credentialModal==='pin'?'PIN.':'password.')}</Text>
     <View style={{flexDirection:'row',gap:6,alignItems:'center'}}>
      <TextInput accessibilityLabel={stage==='verify'?(selectedKind==='pin'?'Existing PIN':'Existing Password'):stage==='new'?(credentialModal==='pin'?'New PIN':'New Password'):(credentialModal==='pin'?'Confirm new PIN':'Confirm new Password')} value={stage==='verify'?oldValue:stage==='new'?newValue:confirmValue}
       onChangeText={stage==='verify'?setOldValue:stage==='new'?setNewValue:setConfirmValue}
       secureTextEntry={!showSecret} keyboardType={stage==='verify'?(selectedKind==='pin'?'number-pad':'default'):(credentialModal==='pin'?'number-pad':'default')}
       autoCapitalize="none" autoCorrect={false} placeholder={stage==='verify'?(selectedKind==='pin'?'Existing PIN':'Existing Password'):stage==='new'?(credentialModal==='pin'?'New PIN':'New Password'):(credentialModal==='pin'?'Confirm PIN':'Confirm Password')}
       placeholderTextColor={palette.muted} style={{flex:1,minHeight:52,borderWidth:1,borderColor:palette.border,borderRadius:12,paddingHorizontal:12,color:palette.text,backgroundColor:palette.background,fontSize:16}}/>
      <Pressable accessibilityRole="button" accessibilityLabel={showSecret?'Hide credential':'Show credential'} onPress={()=>setShowSecret(v=>!v)} style={{padding:9}}>{glyph(showSecret?'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6':'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM3 3l18 18',palette.text)}</Pressable>
     </View>
     {!!message&&<Text style={{color:'#DC4444',fontSize:13}}>{message}</Text>}
     <View style={{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8}}>
      {stage==='verify'&&biometric&&<Pressable accessibilityRole="button" accessibilityLabel="Verify with biometrics" onPress={verifyWithBiometrics} disabled={busy} style={{padding:12}}><Text style={{color:palette.text}}>Biometrics</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel credential change" onPress={dismissCredential} style={{padding:12}}><Text style={{color:palette.text}}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={stage==='confirm'?'Save credential':'Continue credential setup'} onPress={submit} disabled={busy} style={{padding:12,borderRadius:14,backgroundColor:palette.accent,opacity:busy?0.5:1}}><Text style={{color:palette.background==='#F8F6F0'?'#FFFFFF':'#1B2630',fontWeight:'600'}}>{stage==='confirm'?'Save':'Continue'}</Text></Pressable>
     </View>
    </View>
   </View>
  </Modal>
 </SafeAreaView>;
}
