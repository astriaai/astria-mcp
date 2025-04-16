import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { handleMcpError } from '../errors/index.js';
import { TuneInfo } from '../api/types';

export const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0.")
};

export const ListTunesSchema = z.object(ListTunesRawSchema);

export type ListTunesInput = z.infer<typeof ListTunesSchema>;

export async function handleListTunes(params: any): Promise<any> {
    try {
        const parsedParams = ListTunesSchema.parse(params);
        const tunes = await astriaApi.listTunes(parsedParams.offset);

        // Format the tunes data to show only important information
        const formattedTunes = tunes.map((tune: TuneInfo) => ({
            id: tune.id,
            title: tune.title,
            name: tune.name,
            status: tune.trained_at ? 'Trained' : tune.started_training_at ? 'Training' : 'Queued',
            model_type: tune.model_type || 'N/A',
            branch: tune.branch || 'N/A',
            token: tune.token || 'None',
            created_at: new Date(tune.created_at).toLocaleDateString()
        }));

        return {
            content: [{
                type: "text",
                text: `Found ${formattedTunes.length} tunes:\n\n${JSON.stringify(formattedTunes, null, 2)}`,
            } as TextContent],
        };
    } catch (error: any) {
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message}\n\nThis is an authentication error. Please check that your Astria API key is valid and has the necessary permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message}\n\nThis is a network or timeout error. Please check your internet connection and try again. If the problem persists, the Astria API may be experiencing issues.`;
            } else if (error.message.includes('API error (429)')) {
                error.message = `${error.message}\n\nYou have exceeded the rate limit for the Astria API. Please wait a moment and try again.`;
            }
        }
        return handleMcpError(error, 'list_tunes');
    }
}
