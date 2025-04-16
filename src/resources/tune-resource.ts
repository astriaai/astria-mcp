import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { astriaApi } from '../api/client';
import { parseId } from '../utils/helpers';
import { MODELS } from '../config';
import { handleMcpError } from '../errors/index.js';
import { TuneInfo } from '../api/types';

function getBaseTuneName(tune: TuneInfo): string {
    if (tune.base_tune_id === MODELS.FLUX.ID) {
        return 'Flux';
    }

    if (tune.branch === 'sd15') {
        return 'SD 1.5';
    } else if (tune.branch === 'sdxl1') {
        return 'SDXL';
    } else if (tune.branch === 'flux1') {
        return 'Flux';
    } else if (tune.branch === 'fast') {
        return 'Test (Fast)';
    }

    return 'SD 1.5';
}

export const TuneResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}", {
    list: async (_extra) => {
        try {
            const tunes = await astriaApi.listTunes();
            return {
                resources: tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at)
                    .map(tune => {
                        const baseTuneName = getBaseTuneName(tune);
                        let description = `${tune.name || 'Custom'} fine-tune created on ${new Date(tune.created_at).toLocaleDateString()}`;

                        if (tune.token) {
                            description += ` | Required token: "${tune.token}"`;
                        }

                        return {
                            name: `${baseTuneName} LoRA: ${tune.title.length > 20 ? tune.title.slice(0, 20) + '...' : tune.title}`,
                            uri: `astria://tune/${tune.id}`,
                            title: tune.title || `Tune ${tune.id}`,
                            description: description
                        };
                    })
            };
        } catch (error: any) {
            let errorMessage = error.message || 'Unknown error';

            if (errorMessage.includes('API error (401)') || errorMessage.includes('API error (403)')) {
                errorMessage = `${errorMessage} - This is an authentication error. Please check your API key.`;
            } else if (errorMessage.includes('NETWORK_ERROR') || errorMessage.includes('TIMEOUT_ERROR')) {
                errorMessage = `${errorMessage} - This is a network or timeout error. Please check your connection.`;
            }

            throw new Error(`Failed to list Astria tunes: ${errorMessage}`);
        }
    },

    complete: {
        tune_id: async (value) => {
            try {
                const tunes = await astriaApi.listTunes();

                const filteredIds = tunes
                    .filter(tune => tune.model_type === 'lora' && tune.trained_at)
                    .map(tune => tune.id.toString())
                    .filter(id => id.startsWith(value));
                return filteredIds;
            } catch (error) {
                return [];
            }
        }
    }
});


export async function handleTuneResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    let tuneId: number;
    try {
        tuneId = parseId(params.tune_id, 'tune_id');
        const result = await astriaApi.retrieveTune(tuneId);
        const baseTuneName = getBaseTuneName(result);

        const formattedResult = {
            id: result.id,
            title: result.title,
            name: result.name,
            base_model: baseTuneName,
            status: result.trained_at ? 'Trained' : result.started_training_at ? 'Training' : 'Queued',
            created_at: result.created_at,
            trained_at: result.trained_at,
            expires_at: result.expires_at,
            model_type: result.model_type || 'N/A',
            branch: result.branch || 'N/A',
            image_count: result.orig_images?.length || 0,
            token: result.token || null,
            token_required: result.token ? true : false,
            usage_instructions: result.token ?
                `This LoRA requires the token "${result.token} ${result.name}" in your prompt. Add this token at the beginning of your prompt when using this LoRA.` :
                'No special token required for this LoRA.',
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
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('RESOURCE_NOT_FOUND') || error.message.includes('API error (404)')) {
                error.message = `${error.message} - The requested LoRA tune ID ${params.tune_id} was not found. Please check that the ID is correct and that you have access to it.`;
            } else if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message} - This is an authentication error. Please check your API key and permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message} - This is a network or timeout error. Please check your connection.`;
            }
        }

        return handleMcpError(error, 'tune_resource', true);
    }
}


