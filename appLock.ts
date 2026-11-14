import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';

const KEY='orbit.lock.pin.v1';
const BIO='orbit.lock.biometric.v1';
const LIMIT='orbit.lock.attempts.v1';
const PEPPER='orbit.lock.pepper.v1';
export async function lockStatus():Promise<{attempts:number;blockedUntil:number}>{const raw=await SecureStore.getItemAsync(LIMIT);if(!raw)return {attempts:0,blockedUntil:0};try{const x=JSON.parse(raw);return {attempts:Number(x.attempts)||0,blockedUntil:Number(x.blockedUntil)||0};}catch{return {attempts:0,blockedUntil:0};}}
export async function recordPinAttempt(success:boolean):Promise<{attempts:number;blockedUntil:number}>{const status=await lockStatus();if(success){await SecureStore.deleteItemAsync(LIMIT);return {attempts:0,blockedUntil:0};}const attempts=status.attempts+1;const blockedUntil=attempts>=5?Date.now()+60000:status.blockedUntil;const result={attempts:attempts>=5?0:attempts,blockedUntil};await SecureStore.setItemAsync(LIMIT,JSON.stringify(result));return result;}

const hash=async(pin:string,salt:string,pepper:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${salt}:${pin}:${pepper}`);
export async function hasPin(){return !!(await SecureStore.getItemAsync(KEY));}
export async function setPin(pin:string){
  if(!/^\d{6,12}$/.test(pin))throw new Error('PIN must be 6–12 digits');
  const salt=Crypto.randomUUID();
  const pepper=Crypto.randomUUID()+Crypto.randomUUID();
  await SecureStore.setItemAsync(PEPPER,pepper);
  await SecureStore.setItemAsync(KEY,JSON.stringify({salt,digest:await hash(pin,salt,pepper)}));
}
export async function checkPin(pin:string){
  const raw=await SecureStore.getItemAsync(KEY);if(!raw)return false;
  const {salt,digest}=JSON.parse(raw);const pepper=await SecureStore.getItemAsync(PEPPER);if(!pepper)return false;return (await hash(pin,salt,pepper))===digest;
}
export async function removePin(){await SecureStore.deleteItemAsync(KEY);await SecureStore.deleteItemAsync(BIO);await SecureStore.deleteItemAsync(LIMIT);await SecureStore.deleteItemAsync(PEPPER);}
export async function biometricEnabled(){return (await SecureStore.getItemAsync(BIO))==='yes';}
export async function setBiometricEnabled(enabled:boolean){
  if(enabled && !(await biometricAvailable()))throw new Error('Biometrics not enrolled or unavailable');
  await SecureStore.setItemAsync(BIO,enabled?'yes':'no');
}
export async function biometricAvailable(){return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();}
export async function authenticateBiometric(){
  const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock Orbit Notes',disableDeviceFallback:true});
  return result.success;
}
