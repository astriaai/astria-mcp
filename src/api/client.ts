/**
 * Astria API client implementation
 */

import axios, { AxiosInstance } from 'axios';
import { API_CONFIG, MODEL_CONFIG, FEATURE_FLAGS } from '../config';
import { AstriaError, AstriaErrorCode, createErrorFromResponse } from '../errors/index';
import {
    CreateTuneParams,
    GenerateImageParams,
    GenerateImageResponse,
    ListTunesResponse,
    TuneInfo
} from './types';

// Astria API client class
export class AstriaApiClient {
    /** Default model ID for the Flux model */
    private DEFAULT_MODEL_ID = MODEL_CONFIG.FLUX_MODEL_ID;

    /** Mapping of model names to their corresponding IDs */
    private MODEL_IDS = MODEL_CONFIG.MODEL_IDS;
    /** Axios instance for making API requests */
    private axiosInstance: AxiosInstance;

    // Creates a new AstriaApiClient instance
    constructor(
        private apiKey: string = API_CONFIG.API_KEY,
        private baseUrl: string = API_CONFIG.BASE_URL
    ) {
        // Create and configure Axios instance
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: API_CONFIG.TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
    }

    // Creates a new tune
    async createTune(tuneData: CreateTuneParams): Promise<TuneInfo> {
        try {
            // Create FormData for the request
            const FormData = require('form-data');
            const formData = new FormData();

            // Add the tune parameters
            formData.append('tune[title]', tuneData.title);
            formData.append('tune[name]', tuneData.name);

            // Add optional preset if provided
            if (tuneData.preset) {
                formData.append('tune[preset]', tuneData.preset);
            }

            // Add optional characteristics if provided
            if (tuneData.characteristics) {
                for (const [key, value] of Object.entries(tuneData.characteristics)) {
                    formData.append(`tune[characteristics][${key}]`, value);
                }
            }

            // Add optional callback if provided
            if (tuneData.callback) {
                formData.append('tune[callback]', tuneData.callback);
            }

            // Add optional branch if provided (use 'fast' for mock testing)
            if (tuneData.branch) {
                formData.append('tune[branch]', tuneData.branch);
            }

            // Add the image URLs
            if (tuneData.image_urls && tuneData.image_urls.length > 0) {
                for (const url of tuneData.image_urls) {
                    formData.append('tune[image_urls][]', url);
                }
            }

            // Make the API request with FormData
            const response = await this.axiosInstance.post('/tunes', formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to create tune:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Lists all tunes
    async listTunes(offset?: number): Promise<ListTunesResponse> {
        try {
            const params = offset !== undefined ? { offset } : {};
            const response = await this.axiosInstance.get('/tunes', { params });
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to list tunes:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Retrieves a specific tune by ID
    async retrieveTune(tuneId: number): Promise<TuneInfo> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to retrieve tune:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Generates images using the specified model
    async generateImage(modelName: string, promptData: GenerateImageParams): Promise<GenerateImageResponse> {
        try {
            // Get the model ID based on the model name
            const modelId = MODEL_CONFIG.MODEL_IDS[modelName as keyof typeof MODEL_CONFIG.MODEL_IDS];
            if (!modelId) {
                throw new AstriaError(
                    `Invalid model name: ${modelName}`,
                    AstriaErrorCode.VALIDATION_ERROR,
                    { availableModels: Object.keys(MODEL_CONFIG.MODEL_IDS) }
                );
            }

            // Make the API request
            const response = await this.axiosInstance.post(`/tunes/${modelId}/prompts`, promptData);
            let result = response.data;

            // If images aren't available yet, poll for them
            if (result.id && (!result.images || result.images.length === 0)) {
                result = await this.pollForPromptCompletion(modelId, result.id);
            }

            return result;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to generate image:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Polls for prompt completion
    private async pollForPromptCompletion(
        tuneId: number,
        promptId: number,
        maxAttempts: number = API_CONFIG.MAX_POLLING_ATTEMPTS,
        delayMs: number = API_CONFIG.POLLING_DELAY_MS
    ): Promise<GenerateImageResponse> {
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                    console.log(`Polling for prompt completion: attempt ${attempts + 1}/${maxAttempts}`);
                }

                // Retrieve the current state of the prompt
                const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
                const result = response.data;

                // Check if images are available (processing is complete)
                if (result.images && result.images.length > 0) {
                    if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                        console.log(`Images are ready: ${result.images.length} images generated`);
                    }
                    return result;
                }

                // If polling for a while and still no images, check if there's an error
                if (attempts > 10 && result.error) {
                    if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                        console.log(`Error detected in prompt: ${result.error}`);
                    }
                    return result;
                }

                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, delayMs));
                attempts++;
            } catch (error) {
                const astriaError = createErrorFromResponse(error);
                if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                    console.error(`[${astriaError.code}] Failed to poll for prompt completion:`, astriaError);
                }
                throw astriaError;
            }
        }

        // After maximum number of attempts, throw a timeout error
        throw new AstriaError(
            `Prompt generation timed out after ${maxAttempts} attempts`,
            AstriaErrorCode.POLLING_TIMEOUT,
            { tuneId, promptId, maxAttempts }
        );
    }

    // Lists prompts for a specific tune
    async listPrompts(tuneId: number, offset?: number): Promise<any[]> {
        try {
            const params = offset !== undefined ? { offset } : {};
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts`, { params });
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to list prompts:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Retrieves a specific prompt by ID
    async retrievePrompt(tuneId: number, promptId: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`[${astriaError.code}] Failed to retrieve prompt:`, astriaError);
            }
            throw astriaError;
        }
    }
}

// Export a singleton instance of the API client
export const astriaApi = new AstriaApiClient();
