import ExpoLlmMediapipe from "./ExpoLlmMediapipeModule";
/**
 * ModelManager is a singleton class that manages the lifecycle of models.
 * It handles downloading, deleting, and checking the status of models.
 * It also provides a way to listen for model status changes.
 */
export class ModelManager {
    models = new Map();
    listeners = [];
    downloadSubscription;
    constructor() {
        // Set up download progress listener
        this.downloadSubscription = ExpoLlmMediapipe.addListener("downloadProgress", this.handleDownloadProgress);
    }
    handleDownloadProgress = (event) => {
        const { modelName, progress, status, error } = event;
        // Update model info
        const model = this.models.get(modelName);
        if (model) {
            model.status =
                status === "completed"
                    ? "downloaded"
                    : status === "error"
                        ? "error"
                        : status === "downloading"
                            ? "downloading"
                            : "not_downloaded";
            if (progress !== undefined) {
                model.progress = progress;
            }
            if (error) {
                model.error = error;
            }
            // Save updated model info
            this.models.set(modelName, model);
            // Notify listeners
            this.notifyListeners();
        }
    };
    /**
     * Registers a model with the manager.
     * @param name - The name of the model.
     * @param url - The URL to download the model from.
     */
    registerModel(name, url) {
        if (!this.models.has(name)) {
            this.models.set(name, {
                name,
                url,
                status: "not_downloaded",
            });
            // Check if it's already downloaded
            this.checkModelStatus(name);
        }
    }
    async checkModelStatus(modelName) {
        try {
            const isDownloaded = await ExpoLlmMediapipe.isModelDownloaded(modelName);
            const model = this.models.get(modelName);
            if (model) {
                model.status = isDownloaded ? "downloaded" : "not_downloaded";
                this.models.set(modelName, model);
                this.notifyListeners();
            }
        }
        catch (error) {
            console.error(`Error checking model status: ${error}`);
        }
    }
    /**
     * Downloads a model.
     * @param modelName - The name of the model to download.
     * @param options - Optional download options.
     * @returns A promise that resolves to true if the download was successful.
     */
    async downloadModel(modelName, options) {
        const model = this.models.get(modelName);
        if (!model) {
            throw new Error(`Model ${modelName} is not registered`);
        }
        try {
            // Update status to downloading
            model.status = "downloading";
            model.progress = 0;
            this.models.set(modelName, model);
            this.notifyListeners();
            // Prepare download options with defaults
            const downloadOptions = {
                overwrite: false,
                ...options,
            };
            // Start download with options
            const result = await ExpoLlmMediapipe.downloadModel(model.url, modelName, downloadOptions);
            return result;
        }
        catch (error) {
            // Update status to error
            model.status = "error";
            // model.error = error.message;
            this.models.set(modelName, model);
            this.notifyListeners();
            throw error;
        }
    }
    /**
     * Cancels a download in progress.
     * @param modelName - The name of the model to cancel the download for.
     * @returns A promise that resolves to true if the cancellation was successful.
     */
    async cancelDownload(modelName) {
        return await ExpoLlmMediapipe.cancelDownload(modelName);
    }
    /**
     * Deletes a model from the manager.
     * @param modelName - The name of the model to delete.
     * @returns A promise that resolves to true if the deletion was successful.
     */
    async deleteModel(modelName) {
        const result = await ExpoLlmMediapipe.deleteDownloadedModel(modelName);
        if (result) {
            const model = this.models.get(modelName);
            if (model) {
                model.status = "not_downloaded";
                model.progress = undefined;
                this.models.set(modelName, model);
                this.notifyListeners();
            }
        }
        return result;
    }
    /**
     * Loads a downloaded model.
     * @param modelName - The name of the model to load.
     * @param maxTokens - Optional maximum number of tokens for the model.
     * @param topK - Optional top K value for the model.
     * @param temperature - Optional temperature value for the model.
     * @param randomSeed - Optional random seed for the model.
     * @returns A promise that resolves to the handle of the loaded model.
     */
    async getDownloadedModels() {
        return await ExpoLlmMediapipe.getDownloadedModels();
    }
    /**
     * Loads a downloaded model.
     * @param modelName - The name of the model to load.
     * @param maxTokens - Optional maximum number of tokens for the model.
     * @param topK - Optional top K value for the model.
     * @param temperature - Optional temperature value for the model.
     * @param randomSeed - Optional random seed for the model.
     * @returns A promise that resolves to the handle of the loaded model.
     */
    async loadDownloadedModel(modelName, maxTokens, topK, temperature, randomSeed) {
        return await ExpoLlmMediapipe.createModelFromDownloaded(modelName, maxTokens, topK, temperature, randomSeed);
    }
    /**
     * Gets the information of a specific model.
     * @param modelName - The name of the model to get information about.
     * @returns The model information or undefined if the model is not found.
     */
    getModelInfo(modelName) {
        return this.models.get(modelName);
    }
    /**
     * Gets all registered models.
     * @returns An array of all registered models.
     */
    getAllModels() {
        return Array.from(this.models.values());
    }
    /**
     * Adds a listener for model updates.
     * @param callback - The callback to invoke when models are updated.
     * @returns A function to unsubscribe the listener.
     */
    addListener(callback) {
        this.listeners.push(callback);
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter((listener) => listener !== callback);
        };
    }
    notifyListeners() {
        this.listeners.forEach((listener) => {
            listener(this.models);
        });
    }
    /**
     * Cleans up the ModelManager, removing all listeners and subscriptions.
     */
    cleanup() {
        if (this.downloadSubscription) {
            this.downloadSubscription.remove();
        }
        this.listeners = [];
    }
}
// Export a singleton instance
export const modelManager = new ModelManager();
// Also export the class for those who need multiple instances
export default ModelManager;
//# sourceMappingURL=ModelManager.js.map