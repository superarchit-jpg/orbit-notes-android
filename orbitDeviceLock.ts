/** Android screen-off detection; returning from another app must not trigger App Lock. */
import {requireNativeModule} from 'expo';
const nativeLock = requireNativeModule('OrbitDeviceLock');
export function consumedDeviceScreenOff():boolean {
  return nativeLock.consumeScreenOff() === true;
}
