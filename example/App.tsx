import React from 'react'
import { SafeAreaView, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { LocalModelProvider } from './src/context/LocalModelContext'
import ChatExampleScreen from './src/screens/ChatExampleScreen'

export default function App() {
  return (
    <LocalModelProvider>
      <SafeAreaView style={styles.safeArea}>
        <ChatExampleScreen />
        <StatusBar style="dark" />
      </SafeAreaView>
    </LocalModelProvider>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
})
