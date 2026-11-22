package expo.modules.orbitdevicelock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The phone screen turning off is distinct from switching Android applications. */
class OrbitDeviceLockModule : Module() {
  @Volatile private var screenOffSinceLastCheck = false
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("OrbitDeviceLock")

    OnCreate {
      val context = appContext.reactContext
      if (context != null) {
        val r = object : BroadcastReceiver() {
          override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
              screenOffSinceLastCheck = true
            }
          }
        }
        context.registerReceiver(r, IntentFilter(Intent.ACTION_SCREEN_OFF))
        receiver = r
      }
    }

    Function("consumeScreenOff") {
      val previous = screenOffSinceLastCheck
      screenOffSinceLastCheck = false
      previous
    }

    OnDestroy {
      val context = appContext.reactContext
      receiver?.let { r ->
        try { context?.unregisterReceiver(r) } catch (_: IllegalArgumentException) {}
      }
      receiver = null
    }
  }
}
