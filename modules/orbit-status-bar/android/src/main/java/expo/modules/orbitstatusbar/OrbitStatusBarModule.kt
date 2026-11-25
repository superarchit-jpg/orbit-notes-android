package expo.modules.orbitstatusbar

import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class OrbitStatusBarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OrbitStatusBar")

    View(OrbitStatusBarView::class) {
      Prop("darkIcons") { view: OrbitStatusBarView, darkIcons: Boolean ->
        view.darkIcons = darkIcons
      }
    }
  }
}

class OrbitStatusBarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var darkIcons: Boolean = true
    set(value) {
      field = value
      updateStatusBar()
    }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // React Native copies the activity's appearance when the dialog opens.
    post { updateStatusBar() }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) updateStatusBar()
  }

  @Suppress("DEPRECATION")
  private fun updateStatusBar() {
    if (!isAttachedToWindow) return

    // This view is attached to the dialog's window, including for nested modals.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val flag = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
      windowInsetsController?.setSystemBarsAppearance(if (darkIcons) flag else 0, flag)
    } else {
      val decor = rootView
      val flag = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
      val flags = decor.systemUiVisibility
      decor.systemUiVisibility = if (darkIcons) flags or flag else flags and flag.inv()
    }
  }
}
