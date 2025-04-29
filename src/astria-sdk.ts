import axios, { AxiosInstance, AxiosError } from 'axios';
import * as AxiosLogger from 'axios-logger';
import dotenv from 'dotenv';
import { TuneResponse, PromptResponse, ImageGenerationParams, ImageGenerationResult, TuneSearchResult } from './types';

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
instance.interceptors.request.use(AxiosLogger.requestLogger);


// Request interceptor for logging API calls
axiosInstance.interceptors.request.use(request => {
    console.error(`-> SDK Request: ${request.method?.toUpperCase()} ${request.url}`);
    if (request.data) {
        console.error(`   Request Body Preview: ${JSON.stringify(request.data).substring(0, 200)}...`);
    }
    return request;
});

// Response interceptor - handles error parsing and transformation
axiosInstance.interceptors.response.use(
    // Success handler
    response => {
        console.error(`<- SDK Response: ${response.config.method?.toUpperCase()} ${response.config.url} Status: ${response.status}`);
        return response;
    },
    // Error handler
    (error: AxiosError) => {
        console.error(`<- SDK Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} Status: ${error.response?.status}`);

        // Extract and format error details for improved diagnostics
        let errorMessage = 'Unknown error occurred';

        if (error.response) {
            // Extract detailed error information from response payload
            if (error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (typeof error.response.data === 'object') {
                    const data = error.response.data as any;
                    errorMessage = Object.entries(data).map(
                        ([key, value]) => `${key}: ${typeof value === 'string' ? value : Array.isArray(value) ? value.join(' ') : 'unsupported format'}`
                    ).join(" ");
                }
            }
        } else if (error.request) {
            // Request was made but no response received
            errorMessage = 'No response received from server - check your network connection';
        } else {
            // Error in setting up the request
            errorMessage = error.message || 'Error setting up the request';
        }

        // Construct error with contextual information
        const enhancedError = new Error(`${errorMessage}`);
        return Promise.reject(enhancedError);
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
 * Finds a non-expired LoRA tune by title (partial match) and provides available tunes
 * @param searchTitle - The title to search for
 * @returns Object containing the matching tune (or null) and a list of available tunes
 */
export async function findTuneByTitle(searchTitle: string): Promise<TuneSearchResult> {
    // Helper function to check if a tune is not expired
    const isNotExpired = (tune: TuneResponse): boolean =>
        !tune.expires_at || new Date(tune.expires_at) > new Date();

    // Get all available non-expired tunes
    const allTunes = await listTunes(searchTitle);
    const validTunes = allTunes.filter(tune => tune.trained_at && isNotExpired(tune));
    const availableTuneNames = validTunes.map(tune => tune.title);

    // If no search title provided, just return available tunes with no match
    if (!searchTitle) {
        return { tune: null, availableTunes: availableTuneNames };
    }

    // Find trained and non-expired loras that include the search term
    const searchLower = searchTitle.toLowerCase();
    const matchingTunes = validTunes.filter(tune =>
        tune.title.toLowerCase().includes(searchLower)
    );

    if (matchingTunes.length > 1) {
        throw new Error(`Multiple LoRA tunes found with the title "${searchTitle}". Please specify the exact title of the LoRA tune you want from the following ${matchingTunes.map(tune => `"${tune.title}"`).join(', ')}`);
    } else if (matchingTunes.length === 1) {
        return { tune: matchingTunes[0], availableTunes: availableTuneNames };
    } else {
        return { tune: null, availableTunes: availableTuneNames };
    }
}

/**
 * Generates images using the Flux model with optional LoRA fine-tunes.
 * @param params - The image generation parameters.
 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    let promptText = params.prompt;
    if (params.tune_title) {
        const { tune, availableTunes } = await findTuneByTitle(params.tune_title);

        if (!tune) {
            throw new Error(`${params.tune_title} LoRA not found or expired. Available LoRA tunes: ${availableTunes.map(tune => `"${tune}"`).join(', ')}`);
        }

        // Apply LoRA settings to prompt
        if (tune.id || tune.token) {
            // Add LoRA ID tag if available
            const loraTag = tune.id ? `<lora:${tune.id}:1.0> ` : '';
            // Add token and name if available
            const tokenName = tune.token ? `${tune.token} ${tune.name} ` : '';
            // Combine everything
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
            num_images: params.num_images || 1,
            seed: -1
        }
    };

    const result = await createPrompt(requestData);

    return {
        id: result.id,
        prompt: result.text,
        images: result.images,
        error: result.error
    };
}
