import * as FileSystem from 'expo-file-system'

const resolveBaseDirectory = () => FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? FileSystem.cacheDirectory

const getModelPath = () => {
  const basePath = resolveBaseDirectory()
  if (!basePath) {
    throw new Error('Unable to resolve model storage directory')
  }
  return `${basePath}${MODEL_FILENAME}`
}

const ensureParentDirectory = async (path: string) => {
  const directory = path.replace(/[^/]+$/, '')
  if (!directory) {
    return
  }
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  } catch {
    // Directory already exists.
  }
}

const downloadWithProgress = async (
  destinationUri: string,
  options: { token?: string; onProgress?: (value: number) => void }
) => {
  const { token, onProgress } = options
  const headers =
    token && token.trim()
      ? {
          Authorization: `Bearer ${token.trim()}`,
        }
      : undefined

  await ensureParentDirectory(destinationUri)

  const resumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    destinationUri,
    headers ? { headers, md5: false } : undefined,
    (progressEvent) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = progressEvent
      if (
        typeof totalBytesWritten === 'number' &&
        typeof totalBytesExpectedToWrite === 'number' &&
        totalBytesExpectedToWrite > 0
      ) {
        const progress = totalBytesWritten / totalBytesExpectedToWrite
        onProgress?.(Math.min(1, Math.max(0, progress)))
      }
    }
  )

  await resumable.downloadAsync()
  onProgress?.(1)
}

export const MODEL_LABEL = 'Gemma 3n E2B (MediaPipe)'
export const MODEL_FILENAME = 'gemma-3n-E2B-it-int4.task'
export const MODEL_URL =
  'https://huggingface.co/google/gemma-3n-E2B-it-litert-preview/resolve/main/gemma-3n-E2B-it-int4.task'
export const MODEL_PATH = getModelPath()

export type EnsureModelOptions = {
  token?: string
  onProgress?: (progress: number) => void
  forceRedownload?: boolean
}

export const getModelFileInfo = async () => {
  try {
    return await FileSystem.getInfoAsync(getModelPath())
  } catch {
    return { exists: false }
  }
}

export const removeModelFile = async () => {
  try {
    const path = getModelPath()
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true })
    }
  } catch (error) {
    console.warn('Failed to delete model file', error)
  }
}

export const ensureModelFile = async (
  options: EnsureModelOptions = {}
): Promise<string> => {
  const { token, onProgress, forceRedownload } = options
  const path = getModelPath()

  if (!forceRedownload) {
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists) {
      onProgress?.(1)
      return path
    }
  }

  console.log('[localModelManager] Starting download to', path)
  try {
    await downloadWithProgress(path, { token, onProgress })
    console.log('[localModelManager] Download completed at', path)
    onProgress?.(1)
    return path
  } catch (error) {
    console.error('[localModelManager] Download failed, cleaning up', error)
    await removeModelFile()
    throw error
  }
}
