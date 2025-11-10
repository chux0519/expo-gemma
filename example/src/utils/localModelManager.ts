import { Directory, File, Paths, type FileInfo } from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'

const resolveBaseDirectory = (): Directory => {
  try {
    const docDirectory = Paths.document
    if (docDirectory?.uri) {
      return docDirectory
    }
  } catch {
    // Ignore and fallback to cache directory.
  }
  return Paths.cache
}

const getModelFile = () => new File(resolveBaseDirectory(), MODEL_FILENAME)

const downloadWithProgress = async (
  destination: File,
  options: { token?: string; onProgress?: (value: number) => void }
) => {
  const { token, onProgress } = options
  const headers =
    token && token.trim()
      ? {
          Authorization: `Bearer ${token.trim()}`,
        }
      : undefined

  const parentDirectory = destination.parentDirectory
  try {
    parentDirectory.create({ intermediates: true, idempotent: true })
  } catch {
    // Directory already exists; ignore.
  }

  const resumable = LegacyFileSystem.createDownloadResumable(
    MODEL_URL,
    destination.uri,
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
export const MODEL_PATH = getModelFile().uri

export type EnsureModelOptions = {
  token?: string
  onProgress?: (progress: number) => void
  forceRedownload?: boolean
}

const readModelFileInfo = (file: File = getModelFile()): FileInfo => {
  try {
    return file.info()
  } catch {
    return { exists: false as const, uri: file.uri }
  }
}

export const getModelFileInfo = async (): Promise<FileInfo> => readModelFileInfo()

export const removeModelFile = async () => {
  try {
    const file = getModelFile()
    const info = readModelFileInfo(file)
    if (info.exists) {
      file.delete()
    }
  } catch (error) {
    console.warn('Failed to delete model file', error)
  }
}

export const ensureModelFile = async (
  options: EnsureModelOptions = {}
): Promise<string> => {
  const { token, onProgress, forceRedownload } = options
  const file = getModelFile()
  const existing = readModelFileInfo(file)

  if (existing.exists && !forceRedownload) {
    onProgress?.(1)
    return file.uri
  }

  console.log('[localModelManager] Starting download to', file.uri)
  try {
    await downloadWithProgress(file, { token, onProgress })
    console.log('[localModelManager] Download completed at', file.uri)
    onProgress?.(1)
    return file.uri
  } catch (error) {
    console.error('[localModelManager] Download failed, cleaning up', error)
    await removeModelFile()
    throw error
  }
}
