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

            if (tuneData.image_urls && tuneData.image_urls.length > 0) {
                for (const url of tuneData.image_urls) {
                    formData.append('tune[image_urls][]', url);
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
}

// Export a singleton instance of the API client
export const astriaApi = new AstriaApiClient();
