import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { FEATURES } from '../config';
import { handleMcpError } from '../errors/index.js';

export const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0.")
};

export const ListTunesSchema = z.object(ListTunesRawSchema);

export type ListTunesInput = z.infer<typeof ListTunesSchema>;

// Handles the list tunes request
// Retrieves a list of the user's tunes from the Astria API
export async function handleListTunes(params: any): Promise<any> {
    try {
        const parsedParams = ListTunesSchema.parse(params);
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Tool Call: list_tunes with offset=${parsedParams.offset}`);
        }

        const result = await astriaApi.listTunes(parsedParams.offset);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            } as TextContent],
        };
    } catch (error: any) {
        // Special handling for specific error types before using the standard handler
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message}\n\nThis is an authentication error. Please check that your Astria API key is valid and has the necessary permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message}\n\nThis is a network or timeout error. Please check your internet connection and try again. If the problem persists, the Astria API may be experiencing issues.`;
            } else if (error.message.includes('API error (429)')) {
                error.message = `${error.message}\n\nYou have exceeded the rate limit for the Astria API. Please wait a moment and try again.`;
            }
        }

        // Use the standardized error handler
        return handleMcpError(error, 'list_tunes');
    }
}
