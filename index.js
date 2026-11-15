import 'react-native-gesture-handler';

import React from 'react';
import {
  ScrollView,
  Text,
  StyleSheet,
} from 'react-native';
import { registerRootComponent } from 'expo';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
        >
          <Text style={styles.heading}>
            Orbit Notes Render Error
          </Text>
          <Text selectable style={styles.error}>
            {String(
              this.state.error?.stack ||
              this.state.error?.message ||
              this.state.error
            )}
          </Text>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

import App from './App';

function DiagnosticApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  error: {
    marginTop: 20,
    fontSize: 13,
    color: '#b91c1c',
  },
});

registerRootComponent(DiagnosticApp);
