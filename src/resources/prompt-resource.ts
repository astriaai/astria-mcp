import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { astriaApi } from '../api/client';
import { parseId, fetchImageAsBase64 } from '../utils/helpers';
import { handleMcpError } from '../errors/index.js';

export const PromptResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}/prompt/{prompt_id}", {
    list: undefined
});

export async function handlePromptResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {

    if (uri.href === "astria://prompt/info") {
        return {
            contents: [{
                uri: uri.href,
                mimeType: "text/plain",
                text: "Astria Prompts\n\nTo access prompts for a specific tune, use astria://tune/{tune_id}/prompt/{prompt_id}\n\nExample: astria://tune/2311125/prompt/24360209"
            }]
        };
    }

    let tuneId: number;
    let promptId: number;
    try {
        tuneId = parseId(params.tune_id, 'tune_id');
        promptId = parseId(params.prompt_id, 'prompt_id');

        const result = await astriaApi.retrievePrompt(tuneId, promptId);
        const contents = [];

        const summaryText = `Prompt ID: ${result.id}\n` +
            `Tune ID: ${tuneId}\n` +
            `Text: ${result.text || 'N/A'}\n` +
            `Created: ${new Date(result.created_at).toLocaleString()}\n` +
            `Status: ${result.error ? 'Error' : result.images?.length > 0 ? 'Completed' : 'Processing'}\n` +
            `Images: ${result.images?.length || 0}\n` +
            (result.error ? `Error: ${result.error}\n` : '');

        contents.push({
            uri: uri.href,
            mimeType: "text/plain",
            text: summaryText
        });

        if (result.images && result.images.length > 0) {
            contents.push({
                uri: `${uri.href}/images`,
                mimeType: "text/plain",
                text: "\n--- Images ---\n"
            });

            for (const [index, imageUrl] of result.images.entries()) {
                try {
                    const { data, mimeType } = await fetchImageAsBase64(imageUrl);

                    contents.push({
                        uri: `${uri.href}/image/${index}`,
                        mimeType,
                        text: data
                    });

                    contents.push({
                        uri: `${uri.href}/image/${index}/caption`,
                        mimeType: "text/plain",
                        text: `\nImage ${index + 1}: ${imageUrl}\n`
                    });
                } catch (imageError) {
                    console.error(`Failed to fetch image data for ${imageUrl}: ${imageError}`);
                    const encodedUrl = encodeURIComponent(imageUrl);
                    contents.push({
                        uri: `${uri.href}/image/${index}`,
                        mimeType: "text/uri-list",
                        text: `astria://image/${encodedUrl}`
                    });
                }
            }
        } else {
            contents.push({
                uri: `${uri.href}/no-images`,
                mimeType: "text/plain",
                text: "\nNo images available for this prompt.\n"
            });
        }

        return { contents };
    } catch (error: any) {
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('RESOURCE_NOT_FOUND') || error.message.includes('API error (404)')) {
                error.message = `${error.message} - The requested prompt (tune ID: ${params.tune_id}, prompt ID: ${params.prompt_id}) was not found. Please check that the IDs are correct.`;
            } else if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message} - This is an authentication error. Please check your API key and permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message} - This is a network or timeout error. Please check your connection.`;
            }
        }

        return handleMcpError(error, 'prompt_resource', true);
    }
}
