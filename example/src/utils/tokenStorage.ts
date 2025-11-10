import * as SecureStore from 'expo-secure-store'

const HF_TOKEN_KEY = 'expo_gemma_example_hf_token'

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

export const loadStoredHfToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(HF_TOKEN_KEY)
  } catch (error) {
    console.warn('[tokenStorage] Failed to load token', error)
    return null
  }
}

export const persistHfToken = async (token: string | null) => {
  try {
    if (!token) {
      await SecureStore.deleteItemAsync(HF_TOKEN_KEY)
      return
    }
    await SecureStore.setItemAsync(HF_TOKEN_KEY, token, SECURE_OPTIONS)
  } catch (error) {
    console.warn('[tokenStorage] Failed to save token', error)
  }
}
