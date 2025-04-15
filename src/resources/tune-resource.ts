import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { astriaApi } from '../api/client';
import { parseId } from '../utils/helpers';
import { FEATURES } from '../config';
import { handleMcpError } from '../errors/index.js';

// Resource template for retrieving a specific tune
// Uses the format astria://tune/{tune_id} to access tune information
export const TuneResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}", {
    // List callback to enumerate available tunes
    list: async (_extra) => {
        try {
            if (FEATURES.LOG_ERRORS) {
                console.error('MCP Resource List: astria_tune');
            }
            const tunes = await astriaApi.listTunes();
            return {
                resources: tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at && tune.base_tune_id === 1504944 && !tune.expires_at)
                    .map(tune => ({
                        name: `Flux-Lora: ${tune.title.length > 20 ? tune.title.slice(0, 20) + '...' : tune.title}`,
                        uri: `astria://tune/${tune.id}`,
                        title: tune.title || `Tune ${tune.id}`,
                        description: `${tune.name} fine-tune created on ${new Date(tune.created_at).toLocaleDateString()}`
                    }))
            };
        } catch (error: any) {
            if (FEATURES.LOG_ERRORS) {
                console.error(`MCP Error listing astria_tune resources: ${error.message}`);
            }

            let errorMessage = error.message || 'Unknown error';

            // Add context for common Astria API errors
            if (errorMessage.includes('API error (401)') || errorMessage.includes('API error (403)')) {
                errorMessage = `${errorMessage} - This is an authentication error. Please check your API key.`;
            } else if (errorMessage.includes('NETWORK_ERROR') || errorMessage.includes('TIMEOUT_ERROR')) {
                errorMessage = `${errorMessage} - This is a network or timeout error. Please check your connection.`;
            }

            throw new Error(`Failed to list Astria tunes: ${errorMessage}`);
        }
    },
    // Complete callback for the tune_id variable
    complete: {
        tune_id: async (value) => {
            try {
                const tunes = await astriaApi.listTunes();
                // Filter tunes by the partial ID if provided
                const filteredIds = tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at && tune.base_tune_id === 1504944)
                    .map(tune => tune.id.toString())
                    .filter(id => id.startsWith(value));
                return filteredIds;
            } catch (error) {
                if (FEATURES.LOG_ERRORS) {
                    console.error(`Error completing tune_id: ${error}`);
                }
                return [];
            }
        }
    }
});

// Handles the tune resource request
// Retrieves tune details from the Astria API and formats them for display
export async function handleTuneResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    let tuneId: number;
    try {
        // Parse and validate tune_id from the URI template parameters
        tuneId = parseId(params.tune_id, 'tune_id');
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Resource Read: astria_tune with tune_id=${tuneId}`);
        }

        // Call the API client
        const result = await astriaApi.retrieveTune(tuneId);

        // Format the result in a user-friendly way
        const formattedResult = {
            id: result.id,
            title: result.title,
            name: result.name,
            status: result.trained_at ? 'Trained' : result.started_training_at ? 'Training' : 'Queued',
            created_at: result.created_at,
            trained_at: result.trained_at,
            expires_at: result.expires_at,
            model_type: result.model_type || 'N/A',
            branch: result.branch || 'N/A',
            image_count: result.orig_images?.length || 0,
            raw_data: result
        };

        return {
            contents: [{
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(formattedResult, null, 2),
            }]
        };
    } catch (error: any) {
        // Special handling for specific error types before using the standard handler
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('RESOURCE_NOT_FOUND') || error.message.includes('API error (404)')) {
                error.message = `${error.message} - The requested LoRA tune ID ${params.tune_id} was not found. Please check that the ID is correct and that you have access to it.`;
            } else if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message} - This is an authentication error. Please check your API key and permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message} - This is a network or timeout error. Please check your connection.`;
            }
        }

        // Use the standardized error handler
        return handleMcpError(error, 'tune_resource', true);
    }
}


