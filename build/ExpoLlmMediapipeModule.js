import { requireNativeModule } from "expo-modules-core";
import * as React from "react";
const module = requireNativeModule("ExpoLlmMediapipe");
const normalizeGenerationInput = (input) => {
    if (typeof input === "string") {
        return { prompt: input };
    }
    return {
        prompt: input.prompt,
        attachments: input.attachments?.filter((attachment) => Boolean(attachment &&
            typeof attachment.uri === "string" &&
            attachment.uri.length > 0)),
    };
};
const extractImageUris = (attachments) => {
    if (!attachments || attachments.length === 0) {
        return undefined;
    }
    const imageUris = attachments
        .filter((attachment) => attachment.type === "image" && attachment.uri.length > 0)
        .map((attachment) => attachment.uri);
    return imageUris.length ? imageUris : undefined;
};
const mapGenerationInput = (input) => {
    const normalized = normalizeGenerationInput(input);
    return {
        prompt: normalized.prompt,
        imageUris: extractImageUris(normalized.attachments),
    };
};
// Dispatcher Implementation
export function useLLM(props) {
    if ('modelUrl' in props && props.modelUrl !== undefined) {
        return _useLLMDownloadable(props);
    }
    else {
        return _useLLMBase(props);
    }
}
// Internal implementation for Downloadable models
function _useLLMDownloadable(props) {
    const [modelHandle, setModelHandle] = React.useState();
    const nextRequestIdRef = React.useRef(0);
    const [downloadStatus, setDownloadStatus] = React.useState("not_downloaded");
    const [downloadProgress, setDownloadProgress] = React.useState(0);
    const [downloadError, setDownloadError] = React.useState(null);
    const [isCheckingStatus, setIsCheckingStatus] = React.useState(true);
    const { modelUrl, modelName, maxTokens, topK, temperature, randomSeed } = props;
    React.useEffect(() => {
        const checkModelStatus = async () => {
            setIsCheckingStatus(true);
            try {
                const isDownloaded = await module.isModelDownloaded(modelName);
                setDownloadStatus(isDownloaded ? "downloaded" : "not_downloaded");
                if (isDownloaded)
                    setDownloadProgress(1);
                else
                    setDownloadProgress(0);
            }
            catch (error) {
                console.error(`Error checking model status for ${modelName}:`, error);
                setDownloadError(error instanceof Error ? error.message : String(error));
                setDownloadStatus("error");
            }
            finally {
                setIsCheckingStatus(false);
            }
        };
        checkModelStatus();
    }, [modelName]);
    React.useEffect(() => {
        const subscription = module.addListener("downloadProgress", (event) => {
            if (event.modelName !== modelName)
                return;
            if (event.status === "downloading" && event.progress !== undefined) {
                setDownloadProgress(event.progress);
                setDownloadStatus("downloading");
            }
            else if (event.status === "completed") {
                setDownloadProgress(1);
                setDownloadStatus("downloaded");
                setDownloadError(null);
            }
            else if (event.status === "error") {
                setDownloadStatus("error");
                setDownloadError(event.error || "Unknown error occurred");
            }
            else if (event.status === "cancelled") {
                setDownloadStatus("not_downloaded");
                setDownloadProgress(0);
            }
        });
        return () => subscription.remove();
    }, [modelName]);
    React.useEffect(() => {
        const currentModelHandle = modelHandle;
        return () => {
            if (currentModelHandle !== undefined) {
                console.log(`Releasing downloadable model with handle ${currentModelHandle}.`);
                module.releaseModel(currentModelHandle)
                    .then(() => console.log(`Successfully released model ${currentModelHandle}`))
                    .catch((error) => console.error(`Error releasing model ${currentModelHandle}:`, error));
            }
        };
    }, [modelHandle]);
    const downloadModelHandler = React.useCallback(async (options) => {
        try {
            setDownloadStatus("downloading");
            setDownloadProgress(0);
            setDownloadError(null);
            const result = await module.downloadModel(modelUrl, modelName, options);
            return result;
        }
        catch (error) {
            console.error(`Error initiating download for ${modelName}:`, error);
            setDownloadStatus("error");
            setDownloadError(error instanceof Error ? error.message : String(error));
            throw error;
        }
    }, [modelUrl, modelName]);
    const loadModelHandler = React.useCallback(async () => {
        if (modelHandle !== undefined) {
            console.log(`Model ${modelName} already loaded or load in progress.`);
            return;
        }
        if (downloadStatus !== "downloaded") {
            throw new Error(`Model ${modelName} is not downloaded. Call downloadModel() first.`);
        }
        try {
            console.log(`Attempting to load downloaded model: ${modelName}`);
            const handle = await module.createModelFromDownloaded(modelName, maxTokens ?? 512, topK ?? 40, temperature ?? 0.8, randomSeed ?? 0);
            console.log(`Loaded downloaded model '${modelName}' with handle ${handle}`);
            setModelHandle(handle);
        }
        catch (error) {
            console.error(`Error loading downloaded model '${modelName}':`, error);
            setModelHandle(undefined);
            throw error;
        }
    }, [modelHandle, downloadStatus, modelName, maxTokens, topK, temperature, randomSeed]);
    const generateResponse = React.useCallback(async (input, onPartial, onErrorCb, abortSignal) => {
        if (modelHandle === undefined) {
            throw new Error("Model is not loaded. Call loadModel() first.");
        }
        const { prompt, imageUris } = mapGenerationInput(input);
        const requestId = nextRequestIdRef.current++;
        const partialSub = module.addListener("onPartialResponse", (ev) => {
            if (onPartial && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
                onPartial(ev.response, ev.requestId);
            }
        });
        const errorSub = module.addListener("onErrorResponse", (ev) => {
            if (onErrorCb && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
                onErrorCb(ev.error, ev.requestId);
            }
        });
        try {
            return await module.generateResponse(modelHandle, requestId, prompt, imageUris);
        }
        catch (e) {
            console.error("Generate response error:", e);
            if (onErrorCb && !(abortSignal?.aborted ?? false)) {
                onErrorCb(e instanceof Error ? e.message : String(e), requestId);
            }
            throw e;
        }
        finally {
            partialSub.remove();
            errorSub.remove();
        }
    }, [modelHandle]);
    const generateStreamingResponse = React.useCallback(async (input, onPartial, onErrorCb, abortSignal) => {
        if (modelHandle === undefined) {
            throw new Error("Model is not loaded. Call loadModel() first.");
        }
        const { prompt, imageUris } = mapGenerationInput(input);
        const requestId = nextRequestIdRef.current++;
        return new Promise((resolve, reject) => {
            const partialSubscription = module.addListener("onPartialResponse", (ev) => {
                if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
                    if (onPartial)
                        onPartial(ev.response, ev.requestId);
                }
            });
            const errorSubscription = module.addListener("onErrorResponse", (ev) => {
                if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
                    if (onErrorCb)
                        onErrorCb(ev.error, ev.requestId);
                    errorSubscription.remove();
                    partialSubscription.remove();
                    reject(new Error(ev.error));
                }
            });
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    console.log(`Request ${requestId} aborted for downloadable model.`);
                    reject(new Error("Aborted"));
                });
            }
            module.generateResponseAsync(modelHandle, requestId, prompt, imageUris)
                .then(() => {
                if (!(abortSignal?.aborted ?? false)) {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    resolve();
                }
            })
                .catch((error) => {
                if (!(abortSignal?.aborted ?? false)) {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    if (onErrorCb) {
                        onErrorCb(error instanceof Error ? error.message : String(error), requestId);
                    }
                    reject(error);
                }
            });
        });
    }, [modelHandle]);
    return React.useMemo(() => ({
        generateResponse,
        generateStreamingResponse,
        isLoaded: modelHandle !== undefined,
        downloadModel: downloadModelHandler,
        loadModel: loadModelHandler,
        downloadStatus,
        downloadProgress,
        downloadError,
        isCheckingStatus,
    }), [
        generateResponse, generateStreamingResponse, modelHandle,
        downloadModelHandler, loadModelHandler, downloadStatus, downloadProgress, downloadError, isCheckingStatus,
    ]);
}
// Internal implementation for Asset/File models
function _useLLMBase(props) {
    const [modelHandle, setModelHandle] = React.useState();
    const nextRequestIdRef = React.useRef(0);
    const { maxTokens, topK, temperature, randomSeed } = props;
    let modelIdentifier;
    let storageType;
    if (props.storageType === 'asset') {
        modelIdentifier = props.modelName;
        storageType = props.storageType;
    }
    else if (props.storageType === 'file') {
        modelIdentifier = props.modelPath;
        storageType = props.storageType;
    }
    React.useEffect(() => {
        if (!storageType || !modelIdentifier) {
            if (modelHandle !== undefined)
                setModelHandle(undefined);
            return;
        }
        const currentConfigStorageKey = modelIdentifier;
        const currentStorageType = storageType;
        console.log(`Attempting to create non-downloadable model: ${currentConfigStorageKey}, type: ${currentStorageType}`);
        let active = true;
        const modelCreatePromise = currentStorageType === "asset"
            ? module.createModelFromAsset(currentConfigStorageKey, maxTokens ?? 512, topK ?? 40, temperature ?? 0.8, randomSeed ?? 0)
            : module.createModel(currentConfigStorageKey, maxTokens ?? 512, topK ?? 40, temperature ?? 0.8, randomSeed ?? 0);
        modelCreatePromise
            .then((handle) => {
            if (active) {
                console.log(`Created non-downloadable model with handle ${handle} for ${currentConfigStorageKey}`);
                setModelHandle(handle);
            }
            else {
                module.releaseModel(handle).catch(e => console.error("Error releasing model from stale promise (non-downloadable)", e));
            }
        })
            .catch((error) => {
            if (active) {
                console.error(`createModel error for ${currentConfigStorageKey} (non-downloadable):`, error);
                setModelHandle(undefined);
            }
        });
        return () => {
            active = false;
        };
    }, [modelIdentifier, storageType, maxTokens, topK, temperature, randomSeed]);
    React.useEffect(() => {
        const currentModelHandle = modelHandle;
        return () => {
            if (currentModelHandle !== undefined) {
                console.log(`Releasing base model with handle ${currentModelHandle}.`);
                module.releaseModel(currentModelHandle)
                    .then(() => console.log(`Successfully released model ${currentModelHandle}`))
                    .catch((error) => console.error(`Error releasing model ${currentModelHandle}:`, error));
            }
        };
    }, [modelHandle]);
    const generateResponse = React.useCallback(async (input, onPartial, onErrorCb, abortSignal) => {
        if (modelHandle === undefined) {
            throw new Error("Model handle is not defined. Ensure model is created/loaded.");
        }
        const { prompt, imageUris } = mapGenerationInput(input);
        const requestId = nextRequestIdRef.current++;
        const partialSub = module.addListener("onPartialResponse", (ev) => {
            if (onPartial && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
                onPartial(ev.response, ev.requestId);
            }
        });
        const errorSub = module.addListener("onErrorResponse", (ev) => {
            if (onErrorCb && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
                onErrorCb(ev.error, ev.requestId);
            }
        });
        try {
            return await module.generateResponse(modelHandle, requestId, prompt, imageUris);
        }
        catch (e) {
            console.error("Generate response error:", e);
            if (onErrorCb && !(abortSignal?.aborted ?? false)) {
                onErrorCb(e instanceof Error ? e.message : String(e), requestId);
            }
            throw e;
        }
        finally {
            partialSub.remove();
            errorSub.remove();
        }
    }, [modelHandle]);
    const generateStreamingResponse = React.useCallback(async (input, onPartial, onErrorCb, abortSignal) => {
        if (modelHandle === undefined) {
            throw new Error("Model handle is not defined. Ensure model is created/loaded.");
        }
        const { prompt, imageUris } = mapGenerationInput(input);
        const requestId = nextRequestIdRef.current++;
        return new Promise((resolve, reject) => {
            const partialSubscription = module.addListener("onPartialResponse", (ev) => {
                if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
                    if (onPartial)
                        onPartial(ev.response, ev.requestId);
                }
            });
            const errorSubscription = module.addListener("onErrorResponse", (ev) => {
                if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
                    if (onErrorCb)
                        onErrorCb(ev.error, ev.requestId);
                    errorSubscription.remove();
                    partialSubscription.remove();
                    reject(new Error(ev.error));
                }
            });
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    console.log(`Request ${requestId} aborted for base model.`);
                    reject(new Error("Aborted"));
                });
            }
            module.generateResponseAsync(modelHandle, requestId, prompt, imageUris)
                .then(() => {
                if (!(abortSignal?.aborted ?? false)) {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    resolve();
                }
            })
                .catch((error) => {
                if (!(abortSignal?.aborted ?? false)) {
                    errorSubscription.remove();
                    partialSubscription.remove();
                    if (onErrorCb) {
                        onErrorCb(error instanceof Error ? error.message : String(error), requestId);
                    }
                    reject(error);
                }
            });
        });
    }, [modelHandle]);
    return React.useMemo(() => ({
        generateResponse,
        generateStreamingResponse,
        isLoaded: modelHandle !== undefined,
    }), [generateResponse, generateStreamingResponse, modelHandle]);
}
/**
 * Generate a streaming text response from the LLM.
 * This is an independent utility function.
 */
export function generateStreamingText(modelHandle, input, onPartialResponse, onError, abortSignal) {
    return new Promise((resolve, reject) => {
        if (!modelHandle && modelHandle !== 0) { // modelHandle can be 0
            reject(new Error("Invalid model handle provided to generateStreamingText."));
            return;
        }
        const requestId = Math.floor(Math.random() * 1000000); // Increased range for uniqueness
        const partialSubscription = module.addListener("onPartialResponse", (ev) => {
            if (ev.handle === modelHandle &&
                ev.requestId === requestId &&
                !(abortSignal?.aborted ?? false)) {
                if (onPartialResponse) {
                    onPartialResponse(ev.response, ev.requestId);
                }
            }
        });
        const errorSubscription = module.addListener("onErrorResponse", (ev) => {
            if (ev.handle === modelHandle &&
                ev.requestId === requestId &&
                !(abortSignal?.aborted ?? false)) {
                if (onError) {
                    onError(ev.error, ev.requestId);
                }
                errorSubscription.remove();
                partialSubscription.remove();
                reject(new Error(ev.error));
            }
        });
        if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
                // Check if subscriptions still exist before removing
                // This is a defensive check, as they might have been removed by completion/error
                try {
                    partialSubscription.remove();
                }
                catch (subError) {
                    // console.warn("generateStreamingText: Error removing partialSubscription on abort:", subError);
                }
                try {
                    errorSubscription.remove();
                }
                catch (subError) {
                    // console.warn("generateStreamingText: Error removing errorSubscription on abort:", subError);
                }
                console.log(`generateStreamingText Request ${requestId} aborted.`);
                reject(new Error("Aborted"));
            });
        }
        const { prompt, imageUris } = mapGenerationInput(input);
        module
            .generateResponseAsync(modelHandle, requestId, prompt, imageUris)
            .then(() => {
            if (!(abortSignal?.aborted ?? false)) {
                partialSubscription.remove();
                errorSubscription.remove();
                resolve();
            }
            // If aborted, the abort listener should have handled rejection and cleanup.
        })
            .catch((error) => {
            if (!(abortSignal?.aborted ?? false)) {
                partialSubscription.remove();
                errorSubscription.remove();
                if (onError) {
                    onError(error instanceof Error ? error.message : String(error), requestId);
                }
                reject(error);
            }
            // If aborted, the abort listener should have handled rejection and cleanup.
        });
    });
}
export default module;
//# sourceMappingURL=ExpoLlmMediapipeModule.js.map