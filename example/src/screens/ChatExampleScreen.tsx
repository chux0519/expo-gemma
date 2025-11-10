import { generateStreamingText } from 'expo-gemma'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native'

import { useLocalModel } from '../context/LocalModelContext'

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  images?: string[]
}

type ImageAttachment = {
  id: string
  uri: string
}

const SYSTEM_PROMPT =
  'You are Gemma, a friendly on-device assistant. Keep replies helpful and concise.'

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hello! Configure the model below, then ask me something to try the on-device inference.',
}

const buildPromptFromMessages = (messages: ChatMessage[]) => {
  const body = messages
    .map((entry) => {
      const speaker =
        entry.role === 'assistant'
          ? 'Assistant'
          : entry.role === 'user'
            ? 'User'
            : 'System'
      const attachmentNote =
        entry.images && entry.images.length > 0
          ? ` [${entry.images.length} image${entry.images.length > 1 ? 's' : ''} attached]`
          : ''
      return `${speaker}: ${entry.content}${attachmentNote}`
    })
    .join('\n')

  return `${SYSTEM_PROMPT}\n${body}\nAssistant:`
}

const createMessage = (role: ChatRole, content: string, options?: { images?: string[] }): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  role,
  content,
  images: options?.images?.length ? options.images : undefined,
})

export default function ChatExampleScreen() {
  const {
    modelHandle,
    modelReady,
    isSettingUp,
    statusText,
    downloadStatus,
    downloadProgress,
    downloadError,
    hfToken,
    setHfToken,
    ensureTokenLoaded,
    setupModel,
    clearModelCache,
    forgetToken,
    modelLabel,
    modelFilename,
  } = useLocalModel()

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([])

  const scrollViewRef = useRef<ScrollView>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    ensureTokenLoaded().catch(() => {
      // token load best-effort
    })
  }, [ensureTokenLoaded])

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true })
  }, [messages])

  const updateAssistantMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, content } : message
      )
    )
  }, [])

  const appendImages = useCallback((uris: string[]) => {
    setPendingImages((prev) => [
      ...prev,
      ...uris.map((uri) => ({
        id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        uri,
      })),
    ])
  }, [])

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handlePickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setUiError('Media library permission is required to attach images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled && result.assets) {
      appendImages(result.assets.map((asset) => asset.uri).filter(Boolean) as string[])
    }
  }, [appendImages])

  const handleCaptureImage = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      setUiError('Camera permission is required to capture images.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled && result.assets?.[0]?.uri) {
      appendImages([result.assets[0].uri])
    }
  }, [appendImages])

  const sendMessage = useCallback(async () => {
    const trimmed = inputText.trim()
    const currentImages = pendingImages.map((image) => image.uri)
    if ((trimmed.length === 0 && currentImages.length === 0) || modelHandle == null || isGenerating || isSettingUp) {
      return
    }

    setUiError(null)
    setInputText('')

    const displayText = trimmed.length > 0 ? trimmed : currentImages.length > 0 ? '(Image attachment)' : ''
    const userMessage = createMessage('user', displayText, { images: currentImages })
    const assistantMessage = createMessage('assistant', '...')
    const nextMessages = [...messages, userMessage, assistantMessage]
    setMessages(nextMessages)

    const prompt = buildPromptFromMessages(nextMessages)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsGenerating(true)

    let accumulated = ''

    try {
      await generateStreamingText(
        modelHandle,
        {
          prompt,
          attachments: currentImages.map((uri) => ({ type: 'image' as const, uri })),
        },
        (chunk) => {
          accumulated += chunk
          updateAssistantMessage(assistantMessage.id, accumulated || '...')
        },
        (message) => {
          setUiError(message)
          updateAssistantMessage(assistantMessage.id, `Error: ${message}`)
        },
        controller.signal
      )

      if (!accumulated.trim()) {
        const fallback = 'No response generated.'
        accumulated = fallback
        updateAssistantMessage(assistantMessage.id, fallback)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        updateAssistantMessage(assistantMessage.id, 'Generation cancelled')
      } else {
        const message = error instanceof Error ? error.message : 'Failed to generate response'
        setUiError(message)
        updateAssistantMessage(assistantMessage.id, `Error: ${message}`)
      }
    } finally {
      abortControllerRef.current = null
      setIsGenerating(false)
    }
    setPendingImages([])
  }, [
    inputText,
    modelHandle,
    isGenerating,
    isSettingUp,
    messages,
    updateAssistantMessage,
    pendingImages,
  ])

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsGenerating(false)
    }
  }, [])

  const handleResetConversation = useCallback(() => {
    if (isGenerating) {
      handleStop()
    }
    setMessages([INITIAL_MESSAGE])
    setUiError(null)
  }, [handleStop, isGenerating])

  const hasPendingImages = pendingImages.length > 0
  const disableSend =
    !modelReady || isGenerating || isSettingUp || (!inputText.trim() && !hasPendingImages)

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Gemma iOS Example</Text>
        <Text style={styles.subheading}>
          A compact sample that configures the Gemma model and runs chat on a single page.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Model setup</Text>
          <Text style={styles.cardBody}>{modelLabel}</Text>
          <Text style={styles.cardMeta}>File: {modelFilename}</Text>
          <Text style={styles.cardMeta}>
            Status:
            {downloadStatus === 'downloading'
              ? `Downloading ${Math.round(downloadProgress * 100)}%`
              : downloadStatus === 'ready'
                ? modelReady
                  ? 'Model loaded'
                  : 'Model cached'
                : downloadStatus === 'error'
                  ? 'Download failed'
                  : 'Not started'}
          </Text>
          {downloadError && <Text style={styles.errorText}>{downloadError}</Text>}
          {statusText && <Text style={styles.statusText}>{statusText}</Text>}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.buttonSpacing,
                (isSettingUp || isGenerating) && styles.disabledButton,
              ]}
              onPress={setupModel}
              disabled={isSettingUp || isGenerating}
            >
              <Text style={styles.primaryButtonText}>
                {isSettingUp ? 'Setting up...' : modelReady ? 'Reload model' : 'Setup model'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, isSettingUp && styles.disabledSecondary]}
              onPress={clearModelCache}
              disabled={isSettingUp}
            >
              <Text style={styles.secondaryButtonText}>Clear cache</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hugging Face Token</Text>
          <Text style={styles.cardBody}>The token is only used for gated downloads and is stored with SecureStore.</Text>
          <TextInput
            style={styles.tokenInput}
            placeholder="hf_..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            value={hfToken}
            onChangeText={setHfToken}
          />
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.smallButton} onPress={forgetToken}>
              <Text style={styles.smallButtonText}>Forget token</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.chatHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Conversation</Text>
              <Text style={styles.cardBody}>
                {modelReady ? 'Model ready — start chatting.' : 'Please finish setting up the model.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetConversation}
            >
              <Text style={styles.resetButtonText}>Reset chat</Text>
            </TouchableOpacity>
          </View>
          {uiError && <Text style={styles.errorText}>{uiError}</Text>}
          <View>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  message.role === 'user' ? styles.userRow : styles.assistantRow,
                ]}
              >
                <View style={styles.messageContentWrapper}>
                  <View
                    style={[
                      styles.messageBubble,
                      message.role === 'user'
                        ? styles.userBubble
                        : styles.assistantBubble,
                    ]}
                  >
                    <Text
                      style={
                        message.role === 'user'
                          ? styles.userText
                          : styles.assistantText
                      }
                    >
                      {message.content}
                    </Text>
                  </View>
                  {message.images && message.images.length > 0 && (
                    <View style={styles.messageImageGrid}>
                      {message.images.map((uri, index) => (
                        <Image
                          key={`${message.id}-img-${index}`}
                          source={{ uri }}
                          style={styles.messageImage}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {pendingImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentPreviewRow}
        >
          {pendingImages.map((image) => (
            <View key={image.id} style={styles.attachmentThumb}>
              <Image source={{ uri: image.uri }} style={styles.attachmentThumbImage} />
              <TouchableOpacity
                style={styles.attachmentRemoveButton}
                onPress={() => removePendingImage(image.id)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.attachmentToolbar}>
        <TouchableOpacity
          style={styles.attachmentButton}
          onPress={handlePickFromLibrary}
          activeOpacity={0.8}
        >
          <Text style={styles.attachmentButtonText}>Photo Library</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.attachmentButton}
          onPress={handleCaptureImage}
          activeOpacity={0.8}
        >
          <Text style={styles.attachmentButtonText}>Camera</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={modelReady ? 'Ask Gemma something…' : 'Download and load the model first'}
          placeholderTextColor="#9CA3AF"
          multiline
          editable={!isGenerating && !isSettingUp}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (disableSend || !modelReady) && styles.disabledSend,
            isGenerating && styles.stopButton,
          ]}
          onPress={isGenerating ? handleStop : sendMessage}
          disabled={(disableSend || !modelReady) && !isGenerating}
        >
          <Text style={styles.sendButtonLabel}>
            {isGenerating ? 'Stop' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 160,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subheading: {
    marginTop: 8,
    fontSize: 14,
    color: '#4B5563',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#1118270D',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardBody: {
    marginTop: 6,
    fontSize: 14,
    color: '#374151',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  statusText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#DC2626',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSpacing: {
    marginRight: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#93C5FD',
  },
  secondaryButton: {
    flexBasis: 120,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledSecondary: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  tokenInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  smallButtonText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  resetButtonText: {
    fontSize: 12,
    color: '#4338CA',
    fontWeight: '600',
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  messageContentWrapper: {
    maxWidth: '85%',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#2563EB',
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F3F4F6',
    borderTopLeftRadius: 4,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#111827',
  },
  messageImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  messageImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  attachmentPreviewRow: {
    maxHeight: 110,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  attachmentThumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  attachmentThumbImage: {
    width: '100%',
    height: '100%',
  },
  attachmentRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
  },
  attachmentToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  attachmentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  attachmentButtonText: {
    color: '#1F2937',
    fontWeight: '500',
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginRight: 12,
  },
  sendButton: {
    width: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  stopButton: {
    backgroundColor: '#DC2626',
  },
  disabledSend: {
    backgroundColor: '#CBD5F5',
  },
  sendButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
})
