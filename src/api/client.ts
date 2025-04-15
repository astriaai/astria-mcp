import axios, { AxiosInstance } from 'axios';
import { API, MODELS, FEATURES } from '../config';
import { AstriaError, AstriaErrorCode, createErrorFromResponse } from '../errors/index';
import {
    CreateTuneParams,
    GenerateImageParams,
    GenerateImageResponse,
    ListTunesResponse,
    TuneInfo
} from './types';

export class AstriaApiClient {
    private axiosInstance: AxiosInstance;

    constructor(
        private apiKey: string = API.KEY,
        private baseUrl: string = API.BASE_URL
    ) {
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: API.TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
    }

    // Creates a new fine-tune with the provided parameters
    // Handles both image URLs and direct image uploads
    async createTune(tuneData: CreateTuneParams): Promise<TuneInfo> {
        try {
            const FormData = require('form-data');
            const formData = new FormData();

            formData.append('tune[title]', tuneData.title);
            formData.append('tune[name]', tuneData.name);

            if (tuneData.preset) {
                formData.append('tune[preset]', tuneData.preset);
            }

            if (tuneData.characteristics) {
                for (const [key, value] of Object.entries(tuneData.characteristics)) {
                    formData.append(`tune[characteristics][${key}]`, value);
                }
            }

            if (tuneData.callback) {
                formData.append('tune[callback]', tuneData.callback);
            }

            if (tuneData.branch) {
                formData.append('tune[branch]', tuneData.branch);
            }

            // Handle image URLs if provided
            if (tuneData.image_urls && tuneData.image_urls.length > 0) {
                for (const url of tuneData.image_urls) {
                    formData.append('tune[image_urls][]', url);
                }
            }

            // Handle image data if provided
            if (tuneData.image_data && tuneData.image_data.length > 0) {
                for (const imageData of tuneData.image_data) {
                    const buffer = Buffer.from(imageData.data, 'base64');
                    formData.append('tune[images][]', buffer, {
                        filename: imageData.name,
                        contentType: this.getMimeTypeFromFilename(imageData.name)
                    });
                }
            }

            const response = await this.axiosInstance.post('/tunes', formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to create tune:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Lists all tunes available to the user
    // Supports pagination with the offset parameter
    async listTunes(offset?: number): Promise<ListTunesResponse> {
        try {
            const params = offset !== undefined ? { offset } : {};
            const response = await this.axiosInstance.get('/tunes', { params });
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to list tunes:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Retrieves detailed information about a specific tune
    async retrieveTune(tuneId: number): Promise<TuneInfo> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to retrieve tune:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Generates images using the specified model and prompt parameters
    // Automatically polls for completion if the images aren't immediately available
    async generateImage(modelName: string, promptData: GenerateImageParams): Promise<GenerateImageResponse> {
        try {
            let modelId: number;

            if (modelName === MODELS.DEFAULT) {
                modelId = MODELS.FLUX.ID;
            } else if (modelName === MODELS.FLUX.NAME) {
                modelId = MODELS.FLUX.ID;
            } else {
                throw new AstriaError(
                    `Invalid model name: ${modelName}`,
                    AstriaErrorCode.VALIDATION_ERROR,
                    { availableModels: [MODELS.FLUX.NAME] }
                );
            }

            const response = await this.axiosInstance.post(`/tunes/${modelId}/prompts`, promptData);
            let result = response.data;

            if (result.id && (!result.images || result.images.length === 0)) {
                result = await this.pollForPromptCompletion(modelId, result.id);
            }

            return result;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to generate image:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Polls the API until the prompt generation is complete or times out
    // Used internally by generateImage when images aren't immediately available
    private async pollForPromptCompletion(
        tuneId: number,
        promptId: number,
        maxAttempts: number = API.POLLING.MAX_ATTEMPTS,
        delayMs: number = API.POLLING.DELAY_MS
    ): Promise<GenerateImageResponse> {
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                if (FEATURES.LOG_ERRORS) {
                    console.log(`Polling for prompt completion: attempt ${attempts + 1}/${maxAttempts}`);
                }

                const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
                const result = response.data;

                if (result.images && result.images.length > 0) {
                    if (FEATURES.LOG_ERRORS) {
                        console.log(`Images are ready: ${result.images.length} images generated`);
                    }
                    return result;
                }

                if (attempts > 10 && result.error) {
                    if (FEATURES.LOG_ERRORS) {
                        console.log(`Error detected in prompt: ${result.error}`);
                    }
                    return result;
                }

                await new Promise(resolve => setTimeout(resolve, delayMs));
                attempts++;
            } catch (error) {
                const astriaError = createErrorFromResponse(error);
                if (FEATURES.LOG_ERRORS) {
                    console.error(`[${astriaError.code}] Failed to poll for prompt completion:`, astriaError);
                }
                throw astriaError;
            }
        }

        throw new AstriaError(
            `Prompt generation timed out after ${maxAttempts} attempts`,
            AstriaErrorCode.POLLING_TIMEOUT,
            { tuneId, promptId, maxAttempts }
        );
    }

    // Lists all prompts for a specific tune
    // Supports pagination with the offset parameter
    async listPrompts(tuneId: number, offset?: number): Promise<any[]> {
        try {
            const params = offset !== undefined ? { offset } : {};
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts`, { params });
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to list prompts:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Retrieves detailed information about a specific prompt
    // Includes the prompt text, status, and generated images
    async retrievePrompt(tuneId: number, promptId: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);
            if (FEATURES.LOG_ERRORS) {
                console.error(`[${astriaError.code}] Failed to retrieve prompt:`, astriaError);
            }
            throw astriaError;
        }
    }

    // Determines the MIME type based on a file extension
    // Used when uploading images for fine-tuning
    private getMimeTypeFromFilename(filename: string): string {
        const ext = filename.toLowerCase().split('.').pop();
        switch (ext) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'webp':
                return 'image/webp';
            default:
                return 'application/octet-stream';
        }
    }
}

// Export a singleton instance of the API client
export const astriaApi = new AstriaApiClient();
