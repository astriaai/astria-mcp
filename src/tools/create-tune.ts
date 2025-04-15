import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { VALIDATION, FEATURES } from '../config';

export const CreateTuneRawSchema = {
    title: z.string().describe("Unique title for the tune (e.g., including a UUID)."),
    name: z.enum(VALIDATION.TUNE.SUBJECT_TYPES as [string, ...string[]]).describe("Class name describing the subject."),
    image_urls: z.array(z.string().url()).min(VALIDATION.TUNE.MIN_IMAGES)
        .describe("Array of at least 4 image URLs for training."),
    callback: z.string().url().optional().describe("Optional webhook URL for when training finishes."),
    preset: z.enum(VALIDATION.TUNE.PRESETS as [string, ...string[]]).optional()
        .default("flux-lora-portrait").describe("Optional Flux training preset."),
    characteristics: z.record(z.string()).optional()
        .describe("Optional key-value pairs for prompt templating (e.g., {\"eye_color\": \"blue eyes\"})."),
    branch: z.enum(['sd15', 'sdxl1', 'fast']).optional()
        .describe("Optional branch parameter. Use 'fast' for mock testing without incurring charges."),
};

export const CreateTuneSchema = z.object(CreateTuneRawSchema);

export type CreateTuneInput = z.infer<typeof CreateTuneSchema>;

export async function handleCreateTune(params: any): Promise<any> {
    try {
        const parsedParams = CreateTuneSchema.parse(params);
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Tool Call: create_tune`);
        }

        const tuneData = {
            title: parsedParams.title,
            name: parsedParams.name,
            image_urls: parsedParams.image_urls,
            callback: parsedParams.callback,
            preset: parsedParams.preset,
            characteristics: parsedParams.characteristics,
            branch: parsedParams.branch
        };

        if (parsedParams.branch === 'fast' && FEATURES.LOG_ERRORS) {
            console.error(`Using 'fast' branch for mock testing without incurring charges`);
        }

        const result = await astriaApi.createTune(tuneData);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            } as TextContent],
        };
    } catch (error: any) {
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Error in create_tune tool: ${error.message}`);
        }

        let errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('API error (422)')) {
            errorMessage = `${errorMessage}\n\nThis may be due to:\n` +
                `- Invalid image URLs (must be publicly accessible)\n` +
                `- Not enough valid images (need at least ${VALIDATION.TUNE.MIN_IMAGES})\n` +
                `- Images not suitable for training (e.g., too small, low quality)\n` +
                `- Invalid subject type or preset\n` +
                `- Rate limiting or account restrictions`;
        } else if (errorMessage.includes('API error (401)') || errorMessage.includes('API error (403)')) {
            errorMessage = `${errorMessage}\n\nThis is an authentication error. Please check that your Astria API key is valid and has the necessary permissions.`;
        } else if (errorMessage.includes('NETWORK_ERROR') || errorMessage.includes('TIMEOUT_ERROR')) {
            errorMessage = `${errorMessage}\n\nThis is a network or timeout error. Please check your internet connection and try again. If the problem persists, the Astria API may be experiencing issues.`;
        }

        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error creating tune: ${errorMessage}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
