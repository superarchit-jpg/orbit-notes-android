import React from 'react';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Modal, Platform } from 'react-native';
import type { ModalProps, ViewProps } from 'react-native';

const OrbitStatusBarView = Platform.OS === 'android' && requireOptionalNativeModule('OrbitStatusBar')
  ? requireNativeView<ViewProps & { darkIcons: boolean }>('OrbitStatusBar')
  : null;

export default function OrbitModal({
  children,
  darkIcons,
  ...props
}: ModalProps & { darkIcons: boolean }) {
  return (
    <Modal {...props}>
      {OrbitStatusBarView && (
        <OrbitStatusBarView
          darkIcons={darkIcons}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', width: 0, height: 0 }}
        />
      )}
      {children}
    </Modal>
  );
}
