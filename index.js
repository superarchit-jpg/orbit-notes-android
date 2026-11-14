import React from 'react';
import { View, Text } from 'react-native';
import { registerRootComponent } from 'expo';

function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#0f172a' }}>Orbit Notes Startup Test</Text>
      <Text style={{ fontSize: 16, marginTop: 16, textAlign: 'center' }}>React Native started successfully.</Text>
    </View>
  );
}

registerRootComponent(App);
