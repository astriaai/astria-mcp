import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { fetchImageAsBase64 } from '../utils/helpers';
import { handleMcpError } from '../errors/index.js';

export const ImageResourceTemplate = new ResourceTemplate("astria://image/{image_url}{?thumbnail}", {
    list: async () => {
        return { resources: [] };
    },
    complete: {
        image_url: async () => [],
        thumbnail: async () => ['true', 'false']
    }
});

export async function handleImageResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    try {
        const imageUrl = decodeURIComponent(params.image_url as string);

        const requestThumbnail = params.thumbnail === 'true';

        // Try to return image data if thumbnail is requested, otherwise fall back to URL
        if (requestThumbnail) {
            const thumbnailResult = await fetchImageAsBase64(imageUrl, {
                width: 400,
                thumbnail: true,
                fit: 'inside'
            }).catch(() => null);

            if (thumbnailResult) {
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: thumbnailResult.mimeType,
                        text: thumbnailResult.data
                    }]
                };
            }
            // If thumbnailResult is null, we'll fall through to the URL fallback below
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

        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message} - Failed to fetch the image. Please check that the URL is accessible.`;
            }
        }

        return handleMcpError(error, 'image_resource', true);
    }
}
