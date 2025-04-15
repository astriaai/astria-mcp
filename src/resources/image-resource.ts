import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { FEATURES } from '../config';
import { fetchImageAsBase64 } from '../utils/helpers';
import { handleMcpError } from '../errors/index.js';

// Resource template for retrieving an image
// Format: astria://image/{image_url}?thumbnail=true
// Allows accessing images by URL with optional thumbnail generation
export const ImageResourceTemplate = new ResourceTemplate("astria://image/{image_url}{?thumbnail}", {
    list: async () => {
        if (FEATURES.LOG_ERRORS) {
            console.error('MCP Resource List: astria_image (not applicable)');
        }
        return { resources: [] };
    },
    complete: {
        image_url: async () => [],
        thumbnail: async () => ['true', 'false']
    }
});

// Handles the image resource request
// Either returns the image as base64 data (when thumbnail=true) or as a URL
export async function handleImageResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    try {
        const imageUrl = decodeURIComponent(params.image_url as string);
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Resource Read: astria_image with URL=${imageUrl}`);
        }
        const requestThumbnail = params.thumbnail === 'true';

        if (requestThumbnail) {
            try {
                const { data, mimeType } = await fetchImageAsBase64(imageUrl);

                return {
                    contents: [{
                        uri: uri.href,
                        mimeType,
                        text: data
                    }]
                };
            } catch (thumbnailError: any) {
                if (FEATURES.LOG_ERRORS) {
                    console.error(`Failed to generate thumbnail: ${thumbnailError.message || thumbnailError}`);
                }
            }
        }

        return {
            contents: [{
                uri: uri.href,
                mimeType: "text/uri-list",
                text: imageUrl,
                metadata: {
                    title: "Image URL",
                    description: "Click to view the full image in your browser"
                }
            }]
        };
    } catch (error: any) {
        // Special handling for specific error types before using the standard handler
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message} - Failed to fetch the image. Please check that the URL is accessible.`;
            }
        }

        // Use the standardized error handler
        return handleMcpError(error, 'image_resource', true);
    }
}
