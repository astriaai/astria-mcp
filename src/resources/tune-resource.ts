/**
 * Tune resource implementation
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { astriaApi } from '../api/client';
import { parseId } from '../utils/helpers';

// Resource template for retrieving a specific tune
export const TuneResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}", {
    // List callback to enumerate available tunes
    list: async (_extra) => {
        try {
            console.error('MCP Resource List: astria_tune');
            const tunes = await astriaApi.listTunes();
            return {
                resources: tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at)
                    .map(tune => ({
                        name: tune.title,
                        uri: `astria://tune/${tune.id}`,
                        title: tune.title || `Tune ${tune.id}`,
                        description: `${tune.name} fine-tune created on ${new Date(tune.created_at).toLocaleDateString()}`
                    }))
            };
        } catch (error: any) {
            console.error(`MCP Error listing astria_tune resources: ${error.message}`);
            throw new Error(`Failed to list Astria tunes: ${error.message}`);
        }
    },
    // Complete callback for the tune_id variable
    complete: {
        tune_id: async (value) => {
            try {
                const tunes = await astriaApi.listTunes();
                // Filter tunes by the partial ID if provided
                const filteredIds = tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at)
                    .map(tune => tune.id.toString())
                    .filter(id => id.startsWith(value));
                return filteredIds;
            } catch (error) {
                console.error(`Error completing tune_id: ${error}`);
                return [];
            }
        }
    }
});

// Handles the tune resource request
export async function handleTuneResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    let tuneId: number;
    try {
        // Parse and validate tune_id from the URI template parameters
        tuneId = parseId(params.tune_id, 'tune_id');
        console.error(`MCP Resource Read: astria_tune with tune_id=${tuneId}`);

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
            // Include the raw data for completeness
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
        console.error(`MCP Error reading astria_tune resource (${params.tune_id}): ${error.message}`);
        throw new Error(`Failed to read Astria tune resource: ${error.message}`);
    }
}


