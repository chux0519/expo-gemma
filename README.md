<div align="left">
  <img src="https://img.shields.io/npm/v/expo-gemma.svg?style=flat-square" alt="npm version">
  <img src="https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue.svg?style=flat-square" alt="Platform support">
  <img src="https://img.shields.io/badge/Expo-SDK%2050%2B-blue.svg?style=flat-square" alt="Expo SDK">
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License">
</div>

# Expo LLM MediaPipe

![Expo LLM MediaPipe](./assets/banner.png)

Expo LLM MediaPipe is a declarative way to run large language models (LLMs) in React Native on-device, powered by Google’s MediaPipe LLM Inference API 🚀.

The MediaPipe LLM Inference API enables running large language models entirely on-device, allowing developers to perform tasks such as generating text, retrieving information in natural language form, and summarizing documents. Expo LLM MediaPipe bridges the gap between React Native and Google’s cutting-edge on-device AI capabilities, enabling developers to integrate state-of-the-art generative AI models into their mobile apps without requiring deep knowledge of native code or machine learning internals.

## Documentation

Take a look at how our library can help build you your Expo React Native AI features in our docs: \
[https://chux0519.github.io/expo-gemma/](https://chux0519.github.io/expo-gemma/)

## Quick Start - Running Gemma

### Step 1: Installation

```bash
npx expo install expo-gemma
```

### Step 2: Setup and init

```tsx
import { useLLM } from 'expo-gemma';

function App() {
  const llm = useLLM({
    modelName: 'gemma-1.1-2b-it-int4.bin',
    modelUrl: 'https://huggingface.co/t-ghosh/gemma-tflite/resolve/main/gemma-1.1-2b-it-int4.bin',
    maxTokens: 1024,
    temperature: 0.7,
    topK: 40,
    randomSeed: 42,
  });

  // ... rest of your app
}
```

### Step 3: Download & Load the model

```tsx
const download = async () => {
  const model = await llm.downloadModel();
  console.log('Model downloaded:', model);
};

const load = async () => {
  const model = await llm.loadModel();
  console.log('Model loaded:', model);
};
```

### Step 4: Run the model

```tsx
const run = async () => {
  const result = await llm.generateResponse('How do you plan to escape the interweb?');
  console.log('Model result:', result);
};
```

## Use in an Existing App (e.g. `../poti`)

1. **Remove the previous package** (if you had `expo-llm-mediapipe` installed):
   ```bash
   cd ../poti
   npm uninstall expo-llm-mediapipe
   ```
2. **Install this repo locally** while you iterate:
   ```bash
   npm install ../expo-gemma
   # or: yarn add link:../expo-gemma
   # or: pnpm add ../expo-gemma
   ```
3. **Update all imports/aliases** so they read `expo-gemma` (run `rg -l "expo-llm-mediapipe"` to double-check).
4. **Refresh native builds** right after the rename:
   ```bash
   npx pod-install          # iOS
   cd android && ./gradlew clean # Android
   ```
5. **Rebuild once per platform** (`npx expo run:ios`, `npx expo run:android`, or your bare workflow) to let Expo autolinking pick up the dependency from the new package name.

## iOS Example App (`example/`)

Need a starting point without navigation tabs? The repository now ships with a minimal Expo project under `example/` that reuses the `LocalModelContext` and chat UI patterns from `../poti`, but compresses everything into a single page (model setup + Hugging Face token + chat composer).

1. **Install dependencies**:
   ```bash
   cd example
   npm install
   # or use your preferred package manager
   ```
   > The example relies on `npm link` (or your package manager’s local-link equivalent) so the root module is consumed directly. Run `npm link` in the repo root once, then `cd example && npm link expo-gemma` to wire the symlink. `expo.autolinking.nativeModulesDir = ".."` ensures the native side also points to the workspace.
2. **Prebuild for iOS** so the plugin and podspec are applied:
   ```bash
   npx expo prebuild ios --clean
   ```
3. **Open/run** the generated workspace:
   ```bash
   npx pod-install
   npx expo run:ios
   # or open ios/ExpoGemmaExample.xcworkspace in Xcode for full Swift tooling
   ```
4. **Test the UI** – the `ChatScreen`-style panel now hosts:
   - Model download/setup controls (status, reload, clear cache).
   - Secure Hugging Face token storage field.
   - Conversation area with streaming responses and a stop/reset action.

Because the dependency is declared as `"expo-gemma": "file:.."`, the example always consumes your local changes without publishing to npm.

## Minimum Supported Versions

- **iOS**: 14+
- **Android**: SDK 24+

## Demo

https://github.com/user-attachments/assets/e6073287-59c7-4ead-92ba-2ae98c3ffa97



## License

This project is licensed under the [MIT License](./LICENSE).

## Code of Conduct

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before contributing.
