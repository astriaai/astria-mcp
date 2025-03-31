import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ASTRIA_API_KEY = process.env.ASTRIA_API_KEY;
const ASTRIA_API_URL = "https://api.astria.ai";
const FLUX_BASE_TUNE_ID = 1504944;

if (!ASTRIA_API_KEY) {
    console.error("CRITICAL: ASTRIA_API_KEY environment variable is not set. Exiting.");
    process.exit(1);
}

const axiosInstance: AxiosInstance = axios.create({
    baseURL: ASTRIA_API_URL,
    headers: {
        'Authorization': `Bearer ${ASTRIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 30000,
});

// Interceptors (keep as before)
axiosInstance.interceptors.request.use(request => {
    console.error(`-> SDK Request: ${request.method?.toUpperCase()} ${request.url}`);
    if (request.data) {
        console.error(`   Request Body Preview: ${JSON.stringify(request.data).substring(0, 200)}...`);
    }
    return request;
});
axiosInstance.interceptors.response.use(response => {
    console.error(`<- SDK Response: ${response.config.method?.toUpperCase()} ${response.config.url} Status: ${response.status}`);
    return response;
}, (error: AxiosError) => {
    console.error(`<- SDK Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} Status: ${error.response?.status}`);
    if (error.response?.data) {
        console.error(`   Error Data: ${JSON.stringify(error.response.data)}`);
    } else {
        console.error(`   Error Message: ${error.message}`);
    }
    return Promise.reject(error);
});

// --- SDK Functions ---

export async function createTune(tuneData: Record<string, any>): Promise<any> {
    try {
        const response = await axiosInstance.post('/tunes', tuneData);
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        throw new Error(`Astria SDK: Failed to create tune - ${errorMessage}`);
    }
}

export async function listTunes(offset?: number): Promise<any> {
    try {
        const params = offset !== undefined ? { offset } : {};
        const response = await axiosInstance.get('/tunes', { params });
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        throw new Error(`Astria SDK: Failed to list tunes - ${errorMessage}`);
    }
}

/**
 * Retrieves a specific Astria fine-tune by its ID.
 * @param tuneId - The ID of the tune to retrieve.
 */
export async function retrieveTune(tuneId: number): Promise<any> {
    if (isNaN(tuneId) || tuneId <= 0) {
        throw new Error("Astria SDK: Invalid tuneId provided for retrieveTune.");
    }
    try {
        const path = `/tunes/${tuneId}`;
        const response = await axiosInstance.get(path);
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        // Check for 404 specifically
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new Error(`Astria SDK: Tune with ID ${tuneId} not found.`);
        }
        throw new Error(`Astria SDK: Failed to retrieve tune ${tuneId} - ${errorMessage}`);
    }
}


/**
 * Creates a new prompt for the Flux base tune ID.
 * @param promptData - The prompt creation payload.
 */
export async function createPrompt(promptData: Record<string, any>): Promise<any> {
    try {
        const path = `/tunes/${FLUX_BASE_TUNE_ID}/prompts`;
        const response = await axiosInstance.post(path, promptData);
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        throw new Error(`Astria SDK: Failed to create prompt - ${errorMessage}`);
    }
}

/**
 * Retrieves a specific prompt by its ID and its parent tune ID.
 * @param tuneId - The ID of the tune the prompt belongs to.
 * @param promptId - The ID of the prompt to retrieve.
 */
export async function retrievePrompt(tuneId: number, promptId: number): Promise<any> {
    if (isNaN(tuneId) || tuneId <= 0) {
        throw new Error("Astria SDK: Invalid tuneId provided for retrievePrompt.");
    }
    if (isNaN(promptId) || promptId <= 0) {
        throw new Error("Astria SDK: Invalid promptId provided for retrievePrompt.");
    }
    try {
        // Uses the nested path as per Astria docs
        const path = `/tunes/${tuneId}/prompts/${promptId}`;
        const response = await axiosInstance.get(path);
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new Error(`Astria SDK: Prompt with ID ${promptId} (for Tune ${tuneId}) not found.`);
        }
        throw new Error(`Astria SDK: Failed to retrieve prompt ${promptId} (for Tune ${tuneId}) - ${errorMessage}`);
    }
}
