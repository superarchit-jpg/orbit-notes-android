
import 'react-native-gesture-handler';

import React from 'react';
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { registerRootComponent } from 'expo';

function DiagnosticScreen({ error }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.heading}>
        Orbit Notes Diagnostic
      </Text>
      <Text style={styles.subtitle}>
        A JavaScript startup error was detected.
      </Text>
      <Text selectable style={styles.error}>
        {String(error?.stack || error?.message || error)}
      </Text>
      <Text style={styles.footer}>
        Take screenshots of this screen and send them
        to ChatGPT. No diagnostic data is uploaded.
      </Text>
    </ScrollView>
  );
}

class DiagnosticBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(
      'ORBIT_DIAGNOSTIC_RENDER_ERROR',
      error,
      info?.componentStack
    );
  }

  render() {
    if (this.state.error) {
      return <DiagnosticScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

let MainApp;

try {
  const imported = require('./App');
  MainApp = imported.default || imported;
} catch (error) {
  console.error('ORBIT_DIAGNOSTIC_IMPORT_ERROR', error);
  MainApp = function ImportFailure() {
    return <DiagnosticScreen error={error} />;
  };
}

function DiagnosticApp() {
  return (
    <DiagnosticBoundary>
      <MainApp />
    </DiagnosticBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 24,
    paddingTop: 64,
  },
  heading: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 18,
    color: '#475569',
  },
  error: {
    fontSize: 13,
    marginTop: 24,
    color: '#b91c1c',
    fontFamily: 'monospace',
  },
  footer: {
    marginTop: 32,
    color: '#64748b',
  },
});

registerRootComponent(DiagnosticApp);
