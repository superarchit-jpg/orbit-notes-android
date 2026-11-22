/** Settings redesign: UI isolated from stored SQLite data and secure credential material. */
import React,{useState} from 'react';
import {Keyboard,Modal,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Path} from 'react-native-svg';
import type {CredentialKind} from './appLock';

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
 onBackup:(kind:'save'|'restore')=>void;
 onLockNow:()=>void;
 onClose:()=>void;
};
const glyph=(d:string,color:string)=><Svg width={23} height={23} viewBox="0 0 24 24"><Path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
export default function OrbitSettings({palette,themeMode,onTheme,lockEnabled,configured,selectedKind,biometric,onToggleLock,onToggleBiometric,onVerify,onSaveCredential,onBackup,onLockNow,onClose}:Props){
 const [page,setPage]=useState<Page>('home');
 const [credentialModal,setCredentialModal]=useState<CredentialKind|null>(null);
 const [stage,setStage]=useState<Stage>('new');
 const [oldValue,setOldValue]=useState('');
 const [newValue,setNewValue]=useState('');
 const [confirmValue,setConfirmValue]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [showSecret,setShowSecret]=useState(false);
 const goBack=()=>{if(credentialModal){setCredentialModal(null);setMessage('');Keyboard.dismiss();return;}if(page!=='home'){setPage('home');setMessage('');return;}onClose();};
 const openCredential=(kind:CredentialKind)=>{setCredentialModal(kind);setStage(configured?'verify':'new');setOldValue('');setNewValue('');setConfirmValue('');setShowSecret(false);setMessage('');};
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
   try{await onSaveCredential(newValue,kind);setCredentialModal(null);setOldValue('');setNewValue('');setConfirmValue('');setMessage('');Keyboard.dismiss();}
   catch(e){setMessage(String(e));}finally{setBusy(false);}
   return;
  }
  setBusy(true);
  try{if(await onVerify(oldValue)){setStage('new');setMessage('');setOldValue('');}else setMessage('Incorrect existing PIN or password.');}
  catch(e){setMessage(String(e));}finally{setBusy(false);}
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
   <Text style={{fontSize:14,fontWeight:'600',color:themeMode===mode?'#16233F':palette.text}}>{title}</Text>
 </Pressable>;
 return <SafeAreaView style={{flex:1,backgroundColor:palette.background}}>
  <View style={{minHeight:62,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:14}}>
   <Pressable accessibilityRole="button" accessibilityLabel={page==='home'?'Back to previous library screen':'Back to Settings'} onPress={goBack} style={{width:44,height:48,justifyContent:'center',alignItems:'center'}}>{glyph('M20 12H4m7-7-7 7 7 7',palette.text)}</Pressable>
   <Text style={{fontSize:22,fontWeight:'600',color:palette.text}}>{page==='home'?'Settings':page==='appLock'?'App Lock':page==='backup'?'Backup & Restore':'About Orbit Notes'}</Text>
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingTop:14,paddingBottom:48,gap:12}}>
   {page==='home'?<>
    {label('APPEARANCE')}
    <Text style={[text,{fontWeight:'600'}]}>Theme</Text>
    <View style={{flexDirection:'row',gap:9,marginBottom:10}}>{modeButton('light','Light')}{modeButton('dark','Dark')}{modeButton('system','System')}</View>
    {divider}
    {label('PRIVACY & SECURITY')}
    {row('App Lock','M5 10V7a7 7 0 0 1 14 0v3M4 10h16v12H4z',()=>{setPage('appLock');setMessage('');},lockEnabled?'On':'Off')}
    {row('Backup & Restore','M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',()=>setPage('backup'))}
    {divider}
    {label('ABOUT')}
    {row('About Orbit Notes','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 11v6m0-10h.01',()=>setPage('about'))}
   </>:page==='appLock'?<>
    <View style={{flexDirection:'row',alignItems:'center',minHeight:52,justifyContent:'space-between'}}>
     <Text style={[text,{fontWeight:'600'}]}>App Lock</Text>
     <Switch accessibilityLabel="Enable app lock" value={lockEnabled} trackColor={{false:palette.border,true:palette.accent}} thumbColor="#ffffff" onValueChange={async enabled=>{
       if(enabled&&!configured){openCredential(selectedKind);return;}
       try{await onToggleLock(enabled);setMessage('');}catch(e){setMessage(String(e));}
     }}/>
    </View>
    {lockEnabled&&<>
     {divider}
     {(['pin','password'] as const).map(kind=><View key={kind} style={{flexDirection:'row',alignItems:'center',minHeight:56,gap:16}}>
      <Text style={[text,{flex:1}]}>{kind==='pin'?'PIN':'Password'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={kind==='pin'?'Select PIN':'Select Password'} onPress={()=>openCredential(kind)} style={{padding:9}}>{glyph(kind===selectedKind?'M4 12l5 5L20 6':'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',kind===selectedKind?palette.accent:palette.muted)}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={kind==='pin'?'Configure PIN':'Configure Password'} onPress={()=>openCredential(kind)} style={{padding:9}}>{glyph('m9 18 6-6-6-6',palette.text)}</Pressable>
     </View>)}
     {divider}
     <View style={{flexDirection:'row',alignItems:'center',minHeight:58,justifyContent:'space-between'}}>
      <Text style={text}>Biometric Unlock</Text>
      <Switch accessibilityLabel="Biometric Unlock" value={biometric} trackColor={{false:palette.border,true:palette.accent}} thumbColor="#ffffff" onValueChange={async enabled=>{try{await onToggleBiometric(enabled);setMessage('');}catch(e){setMessage(String(e));}}}/>
     </View>
     {divider}
     <Pressable accessibilityRole="button" accessibilityLabel="Lock now" onPress={onLockNow} style={{minHeight:52,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:palette.control}}>
       <Text style={[text,{fontWeight:'600'}]}>Lock now</Text>
     </Pressable>
    </>}
    {!!message&&<Text style={{fontSize:13,color:palette.muted}}>{message}</Text>}
   </>:page==='backup'?<>
    {row('Create Backup','M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',()=>onBackup('save'))}
    {divider}
    {row('Restore Backup','M12 21V9m-5 5 5-5 5 5M5 7V3h14v4',()=>onBackup('restore'))}
   </>:<View style={{alignItems:'center',padding:20,gap:10}}>
     <Text style={{fontSize:23,fontWeight:'600',color:palette.text}}>Orbit Notes</Text>
     <Text style={{fontSize:14,color:palette.muted}}>Android · Offline</Text>
    </View>}
  </ScrollView>
  <Modal visible={credentialModal!==null} transparent animationType="fade" onRequestClose={()=>{if(!busy)setCredentialModal(null);}}>
   <View style={{flex:1,justifyContent:'center',paddingHorizontal:24,backgroundColor:'rgba(0,0,0,0.62)'}}>
    <Pressable style={{position:'absolute',top:0,bottom:0,left:0,right:0}} accessibilityLabel="Dismiss credential setup" onPress={()=>{if(!busy)setCredentialModal(null);}}/>
    <View style={{padding:22,gap:18,borderRadius:26,backgroundColor:palette.surface}}>
     <Text style={{fontSize:20,fontWeight:'600',color:palette.text}}>{credentialModal==='pin'?'PIN':'Password'}</Text>
     <Text style={{color:palette.muted,fontSize:14}}>{stage==='verify'?'Enter the existing PIN or password.':stage==='new'?'Enter a new '+(credentialModal==='pin'?'PIN.':'password.'):'Confirm the new '+(credentialModal==='pin'?'PIN.':'password.')}</Text>
     <View style={{flexDirection:'row',gap:6,alignItems:'center'}}>
      <TextInput accessibilityLabel={stage==='verify'?'Existing credential':stage==='new'?'New credential':'Confirm new credential'} value={stage==='verify'?oldValue:stage==='new'?newValue:confirmValue}
       onChangeText={stage==='verify'?setOldValue:stage==='new'?setNewValue:setConfirmValue}
       secureTextEntry={!showSecret} keyboardType={stage==='verify'?(selectedKind==='pin'?'number-pad':'default'):(credentialModal==='pin'?'number-pad':'default')}
       autoCapitalize="none" autoCorrect={false} placeholder={stage==='verify'?'Existing credential':stage==='new'?'New credential':'Confirm credential'}
       placeholderTextColor={palette.muted} style={{flex:1,minHeight:52,borderWidth:1,borderColor:palette.border,borderRadius:12,paddingHorizontal:12,color:palette.text,backgroundColor:palette.background,fontSize:16}}/>
      <Pressable accessibilityRole="button" accessibilityLabel={showSecret?'Hide credential':'Show credential'} onPress={()=>setShowSecret(v=>!v)} style={{padding:9}}>{glyph('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',palette.text)}</Pressable>
     </View>
     {!!message&&<Text style={{color:'#DC4444',fontSize:13}}>{message}</Text>}
     <View style={{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel credential change" onPress={()=>{if(!busy)setCredentialModal(null);}} style={{padding:12}}><Text style={{color:palette.text}}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={stage==='confirm'?'Save credential':'Continue credential setup'} onPress={submit} disabled={busy} style={{padding:12,borderRadius:14,backgroundColor:palette.accent,opacity:busy?0.5:1}}><Text style={{color:'#15233B',fontWeight:'600'}}>{stage==='confirm'?'Save':'Continue'}</Text></Pressable>
     </View>
    </View>
   </View>
  </Modal>
 </SafeAreaView>;
}
