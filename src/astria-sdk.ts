import axios, { AxiosInstance, AxiosError } from 'axios';
import * as AxiosLogger from 'axios-logger';
import dotenv from 'dotenv';
import { TuneResponse, PromptResponse, ImageGenerationParams, ImageGenerationResult } from './types';

dotenv.config();

// Configuration constants
export const CONFIG = {
    API: {
        KEY: process.env.ASTRIA_API_KEY,
        URL: "https://api.astria.ai",
        TIMEOUT_MS: 30000
    },
    MODELS: {
        FLUX: {
            ID: 1504944,
            NAME: 'flux'
        }
    }
};

if (!CONFIG.API.KEY) {
    console.error("CRITICAL: ASTRIA_API_KEY environment variable is not set. Exiting.");
    process.exit(1);
}

const axiosInstance: AxiosInstance = axios.create({
    baseURL: CONFIG.API.URL,
    headers: {
        'Authorization': `Bearer ${CONFIG.API.KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: CONFIG.API.TIMEOUT_MS,
});

axiosInstance.interceptors.request.use(AxiosLogger.requestLogger);

// Response interceptor - handles error parsing and transformation
axiosInstance.interceptors.response.use(
    AxiosLogger.responseLogger,
    (error: AxiosError) => {
        const errorMessage = error.response?.data
            ? (typeof error.response.data === 'string'
                ? error.response.data
                : Object.entries(error.response.data as Record<string, any>)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(' '))
            : error.message || 'Unknown error occurred';

        return Promise.reject(new Error(errorMessage));
    }
);

// --- SDK Functions ---

/**
 * Creates a new fine-tune in Astria
 * @param tuneData - The tune creation payload
 * @returns API response with tune details
 */
export async function createTune(tuneData: Record<string, any>): Promise<TuneResponse> {
    // Validate tune object existence
    if (!tuneData.tune) {
        throw new Error("Missing tune object in request data");
    }

    const response = await axiosInstance.post('/tunes', tuneData);
    return response.data;
}

/**
 * Retrieves a paginated list of user's fine-tunes
 * @param searchTitle - Optional title to search for
 * @param offset - Optional pagination offset
 * @returns API response with tunes list
 */
export async function listTunes(searchTitle?: string, offset?: number): Promise<TuneResponse[]> {
    const params: Record<string, any> = {};
    if (offset !== undefined) params.offset = offset;
    if (searchTitle) params.title = searchTitle;

    const response = await axiosInstance.get('/tunes?branch=flux1&model_type=lora', { params });
    return response.data;
}

/**
 * Retrieves a specific Astria fine-tune by its ID.
 * @param tuneId - The ID of the tune to retrieve.
 */
export async function retrieveTune(tuneId: number): Promise<TuneResponse> {
    const response = await axiosInstance.get(`/tunes/${tuneId}`);
    return response.data;
}

/**
 * Creates a new prompt for the Flux base tune ID.
 * @param promptData - The prompt creation payload.
 */
export async function createPrompt(promptData: Record<string, any>): Promise<PromptResponse> {
    const tuneId = CONFIG.MODELS.FLUX.ID;
    const response = await axiosInstance.post(`/tunes/${tuneId}/prompts`, promptData);
    let result: PromptResponse = response.data;

    // Poll if needed
    if (result.id && (!result.images || result.images.length === 0)) {
        // Poll up to 120 times with a 3-second delay (total 360 seconds)
        const maxPolls = 120;
        let pollCount = 0;

        while (pollCount < maxPolls) {
            if (result.images && result.images.length > 0) break;
            if (result.error) throw new Error(result.error);
            if (result.status === 'failed') throw new Error('Prompt processing failed');

            // Introduce delay between polling attempts
            await new Promise(resolve => setTimeout(resolve, 3000));
            pollCount++;

            const pollResponse = await axiosInstance.get(`/tunes/${tuneId}/prompts/${result.id}`);
            result = pollResponse.data;
        }

        if (!result.images || result.images.length === 0) {
            throw new Error(result.error || 'Prompt processing timed out');
        }
    }

    return result;
}

/**
 * Retrieves a specific prompt by its ID and its parent tune ID.
 * @param tuneId - The ID of the tune the prompt belongs to.
 * @param promptId - The ID of the prompt to retrieve.
 */
export async function retrievePrompt(tuneId: number, promptId: number): Promise<PromptResponse> {
    const response = await axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
    return response.data;
}

/**
 * Finds a LoRA tune by title (partial match)
 * @param searchTitle - The title to search for
 * @returns The tune info or null if not found
 */
export async function findTuneByTitle(searchTitle: string): Promise<TuneResponse | null> {
    if (!searchTitle) return null;

    const tunes = await listTunes(searchTitle);
    if (!tunes || !tunes.length) return null;

    // Find the first tune that is trained
    const matchingTune = tunes.find((tune: TuneResponse) =>
        tune.trained_at
    );

    return matchingTune || null;
}

/**
 * Generates images using the Flux model with optional LoRA fine-tunes.
 * @param params - The image generation parameters.
 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    let promptText = params.prompt;

    if (params.tune_title) {

        const tune = await findTuneByTitle(params.tune_title);

        if (!tune) {
            throw new Error(`${params.tune_title} LoRA not found.`);
        }

        // check if the tune is expired
        if (!tune.expires_at || new Date(tune.expires_at) > new Date()) {
            throw new Error(`${tune.title} LoRA is expired.`);
        }

        // Apply LoRA settings and token to prompt
        if (tune.id || tune.token) {
            const loraTag = tune.id ? `<lora:${tune.id}:1.0> ` : '';
            const tokenName = tune.token ? `${tune.token} ${tune.name} ` : '';
            promptText = `${loraTag}${tokenName}${promptText}`;
        }

    }

    // Construct width and height from aspect ratio param
    let width = null;
    let height = null;
    if (params.aspect_ratio) {
        if (params.aspect_ratio === 'square') {
            width = height = 1024;
        } else if (params.aspect_ratio === 'landscape') {
            width = 1280;
            height = 720;
        } else if (params.aspect_ratio === 'portrait') {
            width = 720;
            height = 1280;
        }
    }

    // Construct prompt request payload
    const requestData = {
        prompt: {
            text: promptText,
            super_resolution: true,
            inpaint_faces: !!params.tune_title,
            width,
            height,
            num_images: 1,
            seed: -1
        }
    };

    const result = await createPrompt(requestData);

    return {
        id: result.id,
        prompt: result.text,
        image: result.images[0],
        error: result.error
    };
}