/** Password-encrypted, user-controlled Android backup. No network or sharing APIs. */
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import {gcm} from '@noble/ciphers/aes';
import {pbkdf2} from '@noble/hashes/pbkdf2';
import {sha256} from '@noble/hashes/sha256';
import {utf8ToBytes,bytesToUtf8} from '@noble/hashes/utils';
import {fromByteArray,toByteArray} from 'base64-js';
import type {LocalSnapshot} from './storage';
import {assertSnapshot} from './storage';

const ITERATIONS=210_000;
const MIME='application/octet-stream';
const MAX_BYTES=30*1024*1024;
type Envelope={format:'orbit-notes-encrypted-backup';version:1;kdf:'pbkdf2-sha256';iterations:number;salt:string;nonce:string;ciphertext:string};
function derive(password:string,salt:Uint8Array,iterations:number){return pbkdf2(sha256,utf8ToBytes(password),salt,{c:iterations,dkLen:32});}
export function encryptSnapshot(snapshot:LocalSnapshot,password:string):string{
  assertSnapshot(snapshot);
  if(password.length<12)throw new Error('Backup password must contain at least 12 characters');
  const salt=Crypto.getRandomBytes(16),nonce=Crypto.getRandomBytes(12);
  const plaintext=utf8ToBytes(JSON.stringify(snapshot));
  if(plaintext.length+16>MAX_BYTES)throw new Error('Backup is too large');
  const ciphertext=gcm(derive(password,salt,ITERATIONS),nonce).encrypt(plaintext);
  const envelope:Envelope={format:'orbit-notes-encrypted-backup',version:1,kdf:'pbkdf2-sha256',iterations:ITERATIONS,salt:fromByteArray(salt),nonce:fromByteArray(nonce),ciphertext:fromByteArray(ciphertext)};
  return JSON.stringify(envelope);
}
export function decryptSnapshot(content:string,password:string):LocalSnapshot{
  if(content.length>MAX_BYTES*2)throw new Error('Backup is too large');
  let e:Envelope;
  try{e=JSON.parse(content);}catch{throw new Error('Invalid backup file');}
  if(e?.format!=='orbit-notes-encrypted-backup'||e.version!==1||e.kdf!=='pbkdf2-sha256'||e.iterations!==ITERATIONS||typeof e.salt!=='string'||typeof e.nonce!=='string'||typeof e.ciphertext!=='string')throw new Error('Unsupported or invalid backup');
  const salt=toByteArray(e.salt),nonce=toByteArray(e.nonce),ciphertext=toByteArray(e.ciphertext);
  if(salt.length!==16||nonce.length!==12||ciphertext.length>MAX_BYTES)throw new Error('Invalid backup size or parameters');
  let raw:Uint8Array;
  try{raw=gcm(derive(password,salt,e.iterations),nonce).decrypt(ciphertext);}catch{throw new Error('Incorrect password or damaged backup');}
  const snapshot=JSON.parse(bytesToUtf8(raw)) as LocalSnapshot;
  assertSnapshot(snapshot);
  return snapshot;
}
export async function saveEncryptedBackup(snapshot:LocalSnapshot,password:string):Promise<boolean>{
  const content=encryptSnapshot(snapshot,password);
  const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if(!permission.granted)return false;
  const filename=`Orbit-Notes-${new Date().toISOString().slice(0,10)}.orbitbackup`;
  const uri=await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri,filename,MIME);
  await FileSystem.writeAsStringAsync(uri,fromByteArray(utf8ToBytes(content)),{encoding:FileSystem.EncodingType.Base64});
  return true;
}
export async function selectBackupFile():Promise<{uri:string;name:string}|null>{
  const result=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true,multiple:false});
  if(result.canceled)return null;
  const asset=result.assets[0];
  if(!asset?.uri)throw new Error('No backup selected');
  try{
    await validateBackupFile(asset.uri);
    return {uri:asset.uri,name:asset.name||'Selected backup'};
  }catch(error){
    await discardBackupFile(asset.uri);
    throw error;
  }
}
async function validateBackupFile(uri:string){
  const info=await FileSystem.getInfoAsync(uri);
  if(!info.exists)throw new Error('Backup file unavailable');
  if(typeof info.size==='number'&&info.size>MAX_BYTES*2)throw new Error('Backup file too large');
}

export async function discardBackupFile(uri:string){
  // The picker normally returns a cache copy. Never delete an original document.
  if(FileSystem.cacheDirectory&&uri.startsWith(FileSystem.cacheDirectory)){
    await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});
  }
}

export async function decryptSelectedBackup(uri:string,password:string):Promise<LocalSnapshot>{
  await validateBackupFile(uri);
  const content=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.UTF8});
  return decryptSnapshot(content,password);
}
