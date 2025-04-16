import axios, { AxiosInstance } from 'axios';
import { API, MODELS } from '../config';
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

            throw astriaError;
        }
    }


    async retrieveTune(tuneId: number): Promise<TuneInfo> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);

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
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
            const result = response.data;

            if (result.images && result.images.length > 0) {
                return result;
            }

            if (attempts > 10 && result.error) {
                return result;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
            attempts++;
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

            throw astriaError;
        }
    }


    async retrievePrompt(tuneId: number, promptId: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
            return response.data;
        } catch (error: any) {
            const astriaError = createErrorFromResponse(error);

            throw astriaError;
        }
    }


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


export const astriaApi = new AstriaApiClient();
