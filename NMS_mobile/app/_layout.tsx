import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { AuthProvider } from '../context/AuthContext';
import { WebSocketProvider } from '../context/WebSocketContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WebSocketProvider>
          <StatusBar style="light" backgroundColor={COLORS.background} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.background },
              animation: 'slide_from_right',
            }}
          />
        </WebSocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
