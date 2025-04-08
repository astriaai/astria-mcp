// List tunes tool implementation

import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { FEATURE_FLAGS } from '../config';

export const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0.")
};

export const ListTunesSchema = z.object(ListTunesRawSchema);

export type ListTunesInput = z.infer<typeof ListTunesSchema>;

export async function handleListTunes(params: any): Promise<any> {
    try {
        const parsedParams = ListTunesSchema.parse(params);
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Tool Call: list_tunes with offset=${parsedParams.offset}`);
        }

        // Call the API client
        const result = await astriaApi.listTunes(parsedParams.offset);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            } as TextContent],
        };
    } catch (error: any) {
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Error in list_tunes tool: ${error.message}`);
        }
        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error listing tunes: ${error.message}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
