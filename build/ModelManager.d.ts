export interface ModelInfo {
    name: string;
    url: string;
    size?: number;
    status: "not_downloaded" | "downloading" | "downloaded" | "error";
    progress?: number;
    error?: string;
}
export interface DownloadOptions {
    overwrite?: boolean;
    headers?: Record<string, string>;
    timeout?: number;
}
/**
 * ModelManager is a singleton class that manages the lifecycle of models.
 * It handles downloading, deleting, and checking the status of models.
 * It also provides a way to listen for model status changes.
 */
export declare class ModelManager {
    private models;
    private listeners;
    private downloadSubscription?;
    constructor();
    private handleDownloadProgress;
    /**
     * Registers a model with the manager.
     * @param name - The name of the model.
     * @param url - The URL to download the model from.
     */
    registerModel(name: string, url: string): void;
    private checkModelStatus;
    /**
     * Downloads a model.
     * @param modelName - The name of the model to download.
     * @param options - Optional download options.
     * @returns A promise that resolves to true if the download was successful.
     */
    downloadModel(modelName: string, options?: DownloadOptions): Promise<boolean>;
    /**
     * Cancels a download in progress.
     * @param modelName - The name of the model to cancel the download for.
     * @returns A promise that resolves to true if the cancellation was successful.
     */
    cancelDownload(modelName: string): Promise<boolean>;
    /**
     * Deletes a model from the manager.
     * @param modelName - The name of the model to delete.
     * @returns A promise that resolves to true if the deletion was successful.
     */
    deleteModel(modelName: string): Promise<boolean>;
    /**
     * Loads a downloaded model.
     * @param modelName - The name of the model to load.
     * @param maxTokens - Optional maximum number of tokens for the model.
     * @param topK - Optional top K value for the model.
     * @param temperature - Optional temperature value for the model.
     * @param randomSeed - Optional random seed for the model.
     * @returns A promise that resolves to the handle of the loaded model.
     */
    getDownloadedModels(): Promise<string[]>;
    /**
     * Loads a downloaded model.
     * @param modelName - The name of the model to load.
     * @param maxTokens - Optional maximum number of tokens for the model.
     * @param topK - Optional top K value for the model.
     * @param temperature - Optional temperature value for the model.
     * @param randomSeed - Optional random seed for the model.
     * @returns A promise that resolves to the handle of the loaded model.
     */
    loadDownloadedModel(modelName: string, maxTokens?: number, topK?: number, temperature?: number, randomSeed?: number): Promise<number>;
    /**
     * Gets the information of a specific model.
     * @param modelName - The name of the model to get information about.
     * @returns The model information or undefined if the model is not found.
     */
    getModelInfo(modelName: string): ModelInfo | undefined;
    /**
     * Gets all registered models.
     * @returns An array of all registered models.
     */
    getAllModels(): ModelInfo[];
    /**
     * Adds a listener for model updates.
     * @param callback - The callback to invoke when models are updated.
     * @returns A function to unsubscribe the listener.
     */
    addListener(callback: (models: Map<string, ModelInfo>) => void): () => void;
    private notifyListeners;
    /**
     * Cleans up the ModelManager, removing all listeners and subscriptions.
     */
    cleanup(): void;
}
export declare const modelManager: ModelManager;
export default ModelManager;
//# sourceMappingURL=ModelManager.d.ts.map