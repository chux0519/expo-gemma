import type { ExpoLlmMediapipeModule as NativeModuleType, // General type for dispatcher
BaseLlmReturn, DownloadableLlmReturn, UseLLMAssetProps, UseLLMFileProps, UseLLMDownloadableProps } from "./ExpoLlmMediapipe.types";
declare const module: NativeModuleType;
export declare function useLLM(props: UseLLMDownloadableProps): DownloadableLlmReturn;
export declare function useLLM(props: UseLLMAssetProps): BaseLlmReturn;
export declare function useLLM(props: UseLLMFileProps): BaseLlmReturn;
/**
 * Generate a streaming text response from the LLM.
 * This is an independent utility function.
 */
export declare function generateStreamingText(modelHandle: number, prompt: string, onPartialResponse?: (text: string, requestId: number) => void, onError?: (error: string, requestId: number) => void, abortSignal?: AbortSignal): Promise<void>;
export default module;
//# sourceMappingURL=ExpoLlmMediapipeModule.d.ts.map