import ExpoLlmMediapipe from 'expo-gemma'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  ensureModelFile,
  getModelFileInfo,
  removeModelFile,
  MODEL_FILENAME,
  MODEL_LABEL,
} from '../utils/localModelManager'
import { loadStoredHfToken, persistHfToken } from '../utils/tokenStorage'

type DownloadStatus = 'idle' | 'downloading' | 'ready' | 'error'

type LocalModelContextValue = {
  modelHandle: number | null
  modelReady: boolean
  modelPath: string | null
  isSettingUp: boolean
  statusText: string | null
  downloadProgress: number
  downloadStatus: DownloadStatus
  downloadError: string | null
  hasLocalModel: boolean
  hfToken: string
  setHfToken: (token: string) => void
  ensureTokenLoaded: () => Promise<void>
  setupModel: () => Promise<void>
  clearModelCache: () => Promise<void>
  forgetToken: () => Promise<void>
  modelLabel: string
  modelFilename: string
}

const LocalModelContext = createContext<LocalModelContextValue | undefined>(undefined)

export const LocalModelProvider = ({ children }: { children: React.ReactNode }) => {
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle')
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState<string | null>(null)
  const [modelHandle, setModelHandle] = useState<number | null>(null)
  const [hasLocalModel, setHasLocalModel] = useState(false)

  const [hfToken, setHfTokenState] = useState('')
  const hfTokenRef = useRef('')
  const [isTokenLoaded, setIsTokenLoaded] = useState(false)
  const tokenLoadedRef = useRef(false)

  const modelHandleRef = useRef<number | null>(null)

  useEffect(() => {
    tokenLoadedRef.current = isTokenLoaded
  }, [isTokenLoaded])

  useEffect(() => {
    hfTokenRef.current = hfToken
  }, [hfToken])

  const updateModelHandle = useCallback((handle: number | null) => {
    modelHandleRef.current = handle
    setModelHandle(handle)
  }, [])

  const releaseModelHandle = useCallback(async () => {
    if (modelHandleRef.current != null) {
      const handle = modelHandleRef.current
      modelHandleRef.current = null
      setModelHandle(null)
      try {
        await ExpoLlmMediapipe.releaseModel(handle)
      } catch (error) {
        console.warn('[LocalModel] Failed to release model', error)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      releaseModelHandle()
    }
  }, [releaseModelHandle])

  useEffect(() => {
    let isActive = true
    const inspectModelFile = async () => {
      try {
        const info = await getModelFileInfo()
        if (!isActive) {
          return
        }
        if (info.exists) {
          setHasLocalModel(true)
          setModelPath(info.uri ?? null)
          setDownloadStatus('ready')
        }
      } catch (error) {
        console.warn('[LocalModel] Unable to inspect model file', error)
      }
    }
    inspectModelFile()

    return () => {
      isActive = false
    }
  }, [])

  const hydrateToken = useCallback(async () => {
    if (tokenLoadedRef.current) {
      return
    }
    const stored = await loadStoredHfToken()
    if (stored) {
      setHfTokenState(stored)
      hfTokenRef.current = stored
    }
    setIsTokenLoaded(true)
  }, [])

  useEffect(() => {
    if (!isTokenLoaded) {
      return
    }
    const persist = async () => {
      const trimmed = hfTokenRef.current.trim()
      await persistHfToken(trimmed.length ? trimmed : null)
    }
    persist()
  }, [hfToken, isTokenLoaded])

  const ensureTokenLoaded = useCallback(async () => {
    await hydrateToken()
  }, [hydrateToken])

  const setupModel = useCallback(async () => {
    if (isSettingUp) {
      return
    }
    setIsSettingUp(true)
    setDownloadStatus('downloading')
    setDownloadProgress(0)
    setDownloadError(null)
    setStatusText('Checking local model file...')

    try {
      const fileInfo = await getModelFileInfo()
      const needsDownload = !fileInfo.exists

      let effectiveToken = hfTokenRef.current.trim()
      if (needsDownload && !tokenLoadedRef.current) {
        await hydrateToken()
        effectiveToken = hfTokenRef.current.trim()
      }

      const path = await ensureModelFile({
        token: needsDownload ? (effectiveToken || undefined) : undefined,
        onProgress: (progress) => {
          setDownloadProgress(progress)
          const percent = Math.round(progress * 100)
          setStatusText(`Downloading model... ${percent}%`)
        },
      })

      setModelPath(path)
      setDownloadStatus('ready')
      setHasLocalModel(true)
      setStatusText('Loading model into memory...')

      await releaseModelHandle()
      const nativePath = path.startsWith('file://')
        ? decodeURIComponent(path.replace('file://', ''))
        : path

      const handle = await ExpoLlmMediapipe.createModel(
        nativePath,
        32768,
        40,
        0.7,
        42
      )

      updateModelHandle(handle)
      setStatusText('Model ready for chat')
    } catch (error) {
      console.error('[LocalModel] Failed to setup model', error)
      const message =
        error instanceof Error ? error.message : 'Unable to prepare model'
      setDownloadStatus('error')
      setDownloadError(message)
      setStatusText(`Setup failed: ${message}`)
    } finally {
      setIsSettingUp(false)
    }
  }, [hydrateToken, isSettingUp, releaseModelHandle, updateModelHandle])

  const clearModelCache = useCallback(async () => {
    if (isSettingUp) {
      return
    }
    setStatusText('Clearing local model file...')
    setDownloadError(null)
    setDownloadProgress(0)
    setDownloadStatus('idle')
    try {
      await releaseModelHandle()
      await removeModelFile()
      setModelPath(null)
      setHasLocalModel(false)
      setStatusText('Model file removed')
    } catch (error) {
      console.error('[LocalModel] Failed to clear model cache', error)
      const message =
        error instanceof Error ? error.message : 'Unable to delete model file'
      setStatusText(`Clear failed: ${message}`)
    }
  }, [isSettingUp, releaseModelHandle])

  const forgetToken = useCallback(async () => {
    setHfTokenState('')
    hfTokenRef.current = ''
    setIsTokenLoaded(true)
    await persistHfToken(null)
  }, [])

  const value = useMemo<LocalModelContextValue>(
    () => ({
      modelHandle,
      modelReady: Boolean(modelHandle),
      modelPath,
      isSettingUp,
      statusText,
      downloadProgress,
      downloadStatus,
      downloadError,
      hasLocalModel,
      hfToken,
      setHfToken: setHfTokenState,
      ensureTokenLoaded,
      setupModel,
      clearModelCache,
      forgetToken,
      modelLabel: MODEL_LABEL,
      modelFilename: MODEL_FILENAME,
    }),
    [
      modelHandle,
      modelPath,
      isSettingUp,
      statusText,
      downloadProgress,
      downloadStatus,
      downloadError,
      hasLocalModel,
      hfToken,
      ensureTokenLoaded,
      setupModel,
      clearModelCache,
      forgetToken,
    ]
  )

  return (
    <LocalModelContext.Provider value={value}>{children}</LocalModelContext.Provider>
  )
}

export const useLocalModel = () => {
  const context = useContext(LocalModelContext)
  if (!context) {
    throw new Error('useLocalModel must be used within a LocalModelProvider')
  }
  return context
}
