/**
 * Image resource implementation for Astria MCP
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

// Resource template for retrieving an image
// Format: astria://image/{image_url}?thumbnail=true
export const ImageResourceTemplate = new ResourceTemplate("astria://image/{image_url}{?thumbnail}", {
    list: async () => {
        console.error('MCP Resource List: astria_image (not applicable)');
        return { resources: [] };
    },
    complete: {
        image_url: async () => [],
        thumbnail: async () => ['true', 'false']
    }
});

// Handles the image resource request
export async function handleImageResource(uri: URL, params: Record<string, unknown>): Promise<ReadResourceResult> {
    try {
        const imageUrl = decodeURIComponent(params.image_url as string);
        console.error(`MCP Resource Read: astria_image with URL=${imageUrl}`);
        const requestThumbnail = params.thumbnail === 'true';

        if (requestThumbnail) {
            try {
                const axios = (await import('axios')).default;
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');
                const base64Data = buffer.toString('base64');

                let mimeType = 'image/jpeg';
                if (imageUrl.endsWith('.png')) mimeType = 'image/png';
                else if (imageUrl.endsWith('.gif')) mimeType = 'image/gif';
                else if (imageUrl.endsWith('.webp')) mimeType = 'image/webp';

                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: mimeType,
                        text: base64Data
                    }]
                };
            } catch (thumbnailError: any) {
                console.error(`Failed to generate thumbnail: ${thumbnailError.message || thumbnailError}`);
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
        console.error(`MCP Error reading image resource (${params.image_url}): ${error.message}`);
        throw new Error(`Failed to process image resource: ${error.message}`);
    }
}
