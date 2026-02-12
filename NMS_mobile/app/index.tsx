import React from 'react';
import { Redirect } from 'expo-router';

export default function Index() {
  // Always redirect to login on app start
  return <Redirect href="/login" />;
}
