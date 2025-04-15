import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { astriaApi } from '../api/client';
import { parseId, fetchImageAsBase64 } from '../utils/helpers';
import { FEATURES } from '../config';

// Resource template for retrieving a specific prompt
export const PromptResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}/prompt/{prompt_id}", {
    list: undefined
});

// Handles the prompt resource request
export async function handlePromptResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    // Special case for the info URI
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
        // Parse and validate both IDs from the URI template parameters
        tuneId = parseId(params.tune_id, 'tune_id');
        promptId = parseId(params.prompt_id, 'prompt_id');
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Resource Read: astria_prompt with tune_id=${tuneId}, prompt_id=${promptId}`);
        }

        // Call the API client
        const result = await astriaApi.retrievePrompt(tuneId, promptId);

        // Create an array of contents to return
        const contents = [];

        // Add a human-readable summary of the prompt
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

        // Add image contents if available
        if (result.images && result.images.length > 0) {
            // First add a header for the images section
            contents.push({
                uri: `${uri.href}/images`,
                mimeType: "text/plain",
                text: "\n--- Images ---\n"
            });

            for (const [index, imageUrl] of result.images.entries()) {
                try {
                    // Fetch the image data using our utility function
                    const { data, mimeType } = await fetchImageAsBase64(imageUrl);

                    // Add the image directly to the response
                    contents.push({
                        uri: `${uri.href}/image/${index}`,
                        mimeType,
                        text: data
                    });

                    // Add a caption for the image
                    contents.push({
                        uri: `${uri.href}/image/${index}/caption`,
                        mimeType: "text/plain",
                        text: `\nImage ${index + 1}: ${imageUrl}\n`
                    });
                } catch (imageError) {
                    console.error(`Failed to fetch image data for ${imageUrl}: ${imageError}`);
                    // Fall back to providing just the resource URI
                    const encodedUrl = encodeURIComponent(imageUrl);
                    contents.push({
                        uri: `${uri.href}/image/${index}`,
                        mimeType: "text/uri-list",
                        text: `astria://image/${encodedUrl}`
                    });
                }
            }
        } else {
            // If no images, add a message
            contents.push({
                uri: `${uri.href}/no-images`,
                mimeType: "text/plain",
                text: "\nNo images available for this prompt.\n"
            });
        }

        return { contents };
    } catch (error: any) {
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Error reading astria_prompt resource (tune=${params.tune_id}, prompt=${params.prompt_id}): ${error.message}`);
        }

        // Return a user-friendly error message
        return {
            contents: [{
                uri: uri.href,
                mimeType: "text/plain",
                text: `Error: Failed to read Astria prompt resource: ${error.message}\n\nPlease check that the tune ID and prompt ID are correct and try again.`
            }]
        };
    }
}
