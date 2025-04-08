// Create tune tool implementation

import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { VALIDATION_CONFIG, FEATURE_FLAGS } from '../config';

export const CreateTuneRawSchema = {
    title: z.string().describe("Unique title for the tune (e.g., including a UUID)."),
    name: z.enum(VALIDATION_CONFIG.VALID_SUBJECT_TYPES as [string, ...string[]]).describe("Class name describing the subject."),
    image_urls: z.array(z.string().url()).min(VALIDATION_CONFIG.MIN_IMAGES_FOR_TUNE)
        .describe("Array of at least 4 image URLs for training."),
    callback: z.string().url().optional().describe("Optional webhook URL for when training finishes."),
    preset: z.enum(VALIDATION_CONFIG.VALID_PRESETS as [string, ...string[]]).optional()
        .default("flux-lora-portrait").describe("Optional Flux training preset."),
    characteristics: z.record(z.string()).optional()
        .describe("Optional key-value pairs for prompt templating (e.g., {\"eye_color\": \"blue eyes\"})."),
};

export const CreateTuneSchema = z.object(CreateTuneRawSchema);

export type CreateTuneInput = z.infer<typeof CreateTuneSchema>;

export async function handleCreateTune(params: any): Promise<any> {
    try {
        const parsedParams = CreateTuneSchema.parse(params);
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Tool Call: create_tune`);
        }

        // Prepare the tune data
        const tuneData = {
            title: parsedParams.title,
            name: parsedParams.name,
            image_urls: parsedParams.image_urls,
            callback: parsedParams.callback,
            preset: parsedParams.preset,
            characteristics: parsedParams.characteristics
        };

        // Create the tune
        const result = await astriaApi.createTune(tuneData);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            } as TextContent],
        };
    } catch (error: any) {
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Error in create_tune tool: ${error.message}`);
        }
        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error creating tune: ${error.message}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
