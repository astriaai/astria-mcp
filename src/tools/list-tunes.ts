import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { FEATURES } from '../config';

export const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0.")
};

export const ListTunesSchema = z.object(ListTunesRawSchema);

export type ListTunesInput = z.infer<typeof ListTunesSchema>;

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
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Error in list_tunes tool: ${error.message}`);
        }

        let errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('API error (401)') || errorMessage.includes('API error (403)')) {
            errorMessage = `${errorMessage}\n\nThis is an authentication error. Please check that your Astria API key is valid and has the necessary permissions.`;
        } else if (errorMessage.includes('NETWORK_ERROR') || errorMessage.includes('TIMEOUT_ERROR')) {
            errorMessage = `${errorMessage}\n\nThis is a network or timeout error. Please check your internet connection and try again. If the problem persists, the Astria API may be experiencing issues.`;
        } else if (errorMessage.includes('API error (429)')) {
            errorMessage = `${errorMessage}\n\nYou have exceeded the rate limit for the Astria API. Please wait a moment and try again.`;
        }

        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error listing tunes: ${errorMessage}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
