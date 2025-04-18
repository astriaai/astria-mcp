import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';

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

// Error handling is implemented in the axios response interceptor

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
        let context = error.config?.url ? `API call to ${error.config.url}` : 'API call';

        if (error.response) {
            // Map HTTP status codes to appropriate error messages
            if (error.response.status === 404) {
                errorMessage = 'Resource not found';
            } else if (error.response.status === 401 || error.response.status === 403) {
                errorMessage = 'Authentication error - check your API key';
            } else if (error.response.status === 422) {
                errorMessage = 'Validation error - check your request parameters';
            } else if (error.response.status === 429) {
                errorMessage = 'Rate limit exceeded - try again later';
            }

            // Extract detailed error information from response payload
            if (error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (typeof error.response.data === 'object') {
                    const data = error.response.data as any;
                    if (data.message) {
                        errorMessage = data.message;
                    } else if (data.error) {
                        errorMessage = data.error;
                    }
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
        const enhancedError = new Error(`${context}: ${errorMessage}`);
        return Promise.reject(enhancedError);
    }
);

// --- SDK Functions ---

/**
 * Creates a new fine-tune in Astria
 * @param tuneData - The tune creation payload
 * @returns API response with tune details
 */
export async function createTune(tuneData: Record<string, any>): Promise<any> {
    // Validate tune object existence
    if (!tuneData.tune) {
        throw new Error("Missing tune object in request data");
    }

    const response = await axiosInstance.post('/tunes', tuneData);
    return response.data;
}

/**
 * Retrieves a paginated list of user's fine-tunes
 * @param offset - Optional pagination offset
 * @returns API response with tunes list
 */
export async function listTunes(offset?: number): Promise<any> {
    const params = offset !== undefined ? { offset } : {};
    const response = await axiosInstance.get('/tunes', { params });
    return response.data;
}

/**
 * Retrieves a specific Astria fine-tune by its ID.
 * @param tuneId - The ID of the tune to retrieve.
 */
export async function retrieveTune(tuneId: number): Promise<any> {
    const response = await axiosInstance.get(`/tunes/${tuneId}`);
    return response.data;
}


/**
 * Creates a new prompt for the Flux base tune ID.
 * @param promptData - The prompt creation payload.
 */
export async function createPrompt(promptData: Record<string, any>): Promise<any> {
    const path = `/tunes/${CONFIG.MODELS.FLUX.ID}/prompts`;
    const response = await axiosInstance.post(path, promptData);
    return response.data;
}

/**
 * Retrieves a specific prompt by its ID and its parent tune ID.
 * @param tuneId - The ID of the tune the prompt belongs to.
 * @param promptId - The ID of the prompt to retrieve.
 */
export async function retrievePrompt(tuneId: number, promptId: number): Promise<any> {
    const response = await axiosInstance.get(`/tunes/${tuneId}/prompts/${promptId}`);
    return response.data;
}

/**
 * Validates a LoRA tune to ensure it exists, is trained, and is a LoRA type.
 * @param tuneId - The ID of the LoRA tune to validate.
 */
export async function validateLoraTune(tuneId: number): Promise<any> {
    const tuneInfo = await retrieveTune(tuneId);

    // Quick validation of essential requirements
    if (!tuneInfo.trained_at) {
        throw new Error(`LoRA tune with ID ${tuneId} is not trained yet`);
    }
    if (tuneInfo.model_type !== 'lora') {
        throw new Error(`Tune with ID ${tuneId} is not a LoRA type`);
    }

    return tuneInfo;
}

/**
 * Generates images using the Flux model with optional LoRA fine-tunes.
 * @param params - The image generation parameters.
 */
export async function generateImage(params: Record<string, any>): Promise<any> {
    // Apply LoRA fine-tuning to prompt if specified
    let promptText = params.prompt;
    if (params.lora_tunes?.length > 0) {
        for (const lora of params.lora_tunes) {
            // Validate the LoRA
            const tuneInfo = await validateLoraTune(lora.tune_id);

            // Add token if needed
            if (tuneInfo.token) {
                promptText = `${tuneInfo.token} ${tuneInfo.name} ${promptText}`;
            }
        }
    }

    // Construct prompt request payload
    const requestData = {
        prompt: {
            text: promptText,
            super_resolution: params.super_resolution !== false,
            inpaint_faces: params.inpaint_faces !== false,
            width: params.width,
            height: params.height,
            num_images: params.num_images,
            guidance_scale: params.guidance_scale,
            seed: params.seed
        }
    };

    // Make API request
    const response = await axiosInstance.post(`/tunes/${CONFIG.MODELS.FLUX.ID}/prompts`, requestData);
    let result = response.data;

    // Implement polling mechanism for asynchronous image generation
    if (result.id && (!result.images || result.images.length === 0)) {
        // Poll up to 60 times with a 2-second delay (total 2 minutes)
        const maxPolls = 60;
        let pollCount = 0;

        while (pollCount < maxPolls && (!result.images || result.images.length === 0)) {
            // Introduce delay between polling attempts
            await new Promise(resolve => setTimeout(resolve, 2000));
            pollCount++;
            const pollResponse = await axiosInstance.get(`/tunes/${CONFIG.MODELS.FLUX.ID}/prompts/${result.id}`);
            result = pollResponse.data;
        }

        if (!result.images || result.images.length === 0) {
            throw new Error(result.error || 'Image generation timed out');
        }
    }

    // Format response for client consumption
    return {
        id: result.id,
        prompt: result.text,
        images: result.images || [],
    };
}
