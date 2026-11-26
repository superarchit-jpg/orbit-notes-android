import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';

const KEY='orbit.lock.pin.v1';
const ENABLED='orbit.lock.enabled.v1';
const BIO='orbit.lock.biometric.v1';
const LIMIT='orbit.lock.attempts.v1';
const PEPPER='orbit.lock.pepper.v1';
export async function lockStatus():Promise<{attempts:number;blockedUntil:number}>{const raw=await SecureStore.getItemAsync(LIMIT);if(!raw)return {attempts:0,blockedUntil:0};try{const x=JSON.parse(raw);return {attempts:Number(x.attempts)||0,blockedUntil:Number(x.blockedUntil)||0};}catch{return {attempts:0,blockedUntil:0};}}
export async function recordPinAttempt(success:boolean):Promise<{attempts:number;blockedUntil:number}>{const status=await lockStatus();if(success){await SecureStore.deleteItemAsync(LIMIT);return {attempts:0,blockedUntil:0};}const attempts=status.attempts+1;const blockedUntil=attempts>=5?Date.now()+60000:status.blockedUntil;const result={attempts:attempts>=5?0:attempts,blockedUntil};await SecureStore.setItemAsync(LIMIT,JSON.stringify(result));return result;}

const hash=async(pin:string,salt:string,pepper:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${salt}:${pin}:${pepper}`);
export async function hasPin(){return !!(await SecureStore.getItemAsync(KEY));}
/** Legacy installs with a stored PIN and no enabled flag remain locked. */
export async function isPinLockEnabled(){
  if(!await hasPin())return false;
  const enabled=await SecureStore.getItemAsync(ENABLED);
  return enabled===null||enabled==='yes';
}
export async function setPinLockEnabled(enabled:boolean){
  if(enabled&&!await hasPin())throw new Error('Configure a PIN before enabling app lock');
  await SecureStore.setItemAsync(ENABLED,enabled?'yes':'no');
}
export type CredentialKind='pin'|'password';
export async function credentialKind():Promise<CredentialKind>{
  const raw=await SecureStore.getItemAsync(KEY);
  if(!raw)return 'pin';
  try{return JSON.parse(raw).kind==='password'?'password':'pin';}catch{return 'pin';}
}
export function validateCredential(value:string,kind:CredentialKind):void{
  if(kind==='pin'&&!/^\d{4,}$/.test(value))throw new Error('PIN must contain at least four digits');
  if(kind==='password'&&Array.from(value).length<6)
    throw new Error('Password must contain at least six characters');
}
export async function setPin(pin:string,kind:CredentialKind='pin'){
  validateCredential(pin,kind);
  const salt=Crypto.randomUUID();
  const pepper=Crypto.randomUUID()+Crypto.randomUUID();
  // New credentials are saved in one SecureStore value. Legacy credentials retain their separate pepper.
  await SecureStore.setItemAsync(KEY,JSON.stringify({salt,digest:await hash(pin,salt,pepper),kind,pepper}));
  await SecureStore.setItemAsync(ENABLED,'yes');
}
export async function checkPin(pin:string){
  const raw=await SecureStore.getItemAsync(KEY);if(!raw)return false;
  const stored=JSON.parse(raw);
  const pepper=stored.pepper||(await SecureStore.getItemAsync(PEPPER));
  if(!pepper||typeof stored.salt!=='string'||typeof stored.digest!=='string')return false;
  return (await hash(pin,stored.salt,pepper))===stored.digest;
}
let verificationQueue:Promise<unknown>=Promise.resolve();
function enqueueVerification<T>(verify:()=>Promise<T>):Promise<T>{
  const attempt=verificationQueue.then(verify);
  verificationQueue=attempt.catch(()=>{});
  return attempt;
}

async function attemptsBlocked():Promise<boolean>{
  return Date.now()<(await lockStatus()).blockedUntil;
}

/** Read, verify and record one attempt at a time across all credential prompts. */
export function verifyCredential(value:string){
  return enqueueVerification(async()=>{
    const status=await lockStatus();
    if(Date.now()<status.blockedUntil)return {ok:false,alreadyBlocked:true,...status};
    const ok=await checkPin(value);
    return {ok,alreadyBlocked:false,...await recordPinAttempt(ok)};
  });
}
export async function removePin(){await SecureStore.deleteItemAsync(ENABLED);await SecureStore.deleteItemAsync(KEY);await SecureStore.deleteItemAsync(BIO);await SecureStore.deleteItemAsync(LIMIT);await SecureStore.deleteItemAsync(PEPPER);}
export async function biometricEnabled(){return (await SecureStore.getItemAsync(BIO))==='yes';}
export async function setBiometricEnabled(enabled:boolean){
  if(enabled && !(await biometricAvailable()))throw new Error('Biometrics not enrolled or unavailable');
  await SecureStore.setItemAsync(BIO,enabled?'yes':'no');
}
export async function biometricAvailable(){return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();}
export async function authenticateBiometric(){
  if(await enqueueVerification(attemptsBlocked))return false;
  const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock Orbit Notes',disableDeviceFallback:true});
  // A credential attempt may start the timeout while Android's prompt is open.
  return result.success&&!(await enqueueVerification(attemptsBlocked));
}
