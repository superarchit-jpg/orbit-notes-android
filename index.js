
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { registerRootComponent } from 'expo';

function StartupTest() {
  const [result, setResult] = useState(
    'Testing Orbit Notes module imports...'
  );

  useEffect(() => {
    try {
      const appModule = require('./App');

      if (appModule.default || appModule) {
        setResult(
          'SUCCESS: App.tsx imported successfully.\n\n' +
          'The application has NOT been rendered yet.'
        );
      } else {
        setResult('ERROR: App.tsx has no export.');
      }
    } catch (error) {
      setResult(
        'IMPORT ERROR:\n\n' +
        String(error?.stack || error?.message || error)
      );
    }
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{
        padding: 24,
        paddingTop: 70
      }}
    >
      <Text style={{
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0f172a'
      }}>
        Orbit Notes Import Test
      </Text>

      <Text
        selectable
        style={{
          fontSize: 16,
          marginTop: 24,
          color: '#334155',
          lineHeight: 25
        }}
      >
        {result}
      </Text>
    </ScrollView>
  );
}

registerRootComponent(StartupTest);
