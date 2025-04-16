import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client.js';
import { VALIDATION, STORAGE } from '../config.js';
import { readTuneImageAsBase64 } from '../utils/file-system.js';
import { handleMcpError } from '../errors/index.js';

export const CreateTuneRawSchema = {
    title: z.string().describe("Unique title for the tune (e.g., including a UUID)."),
    name: z.enum(VALIDATION.TUNE.SUBJECT_TYPES as [string, ...string[]]).describe("Class name describing the subject."),
    image_urls: z.array(z.string().url()).min(VALIDATION.TUNE.MIN_IMAGES).optional()
        .describe("Array of at least 4 image URLs for training. Either image_urls or image_files must be provided."),
    image_files: z.array(z.string()).min(VALIDATION.TUNE.MIN_IMAGES).optional()
        .describe(`Array of at least 4 image filenames from the ${STORAGE.TUNE_IMAGES_SUBDIRECTORY} directory. Either image_urls or image_files must be provided.`),
    callback: z.string().url().optional().describe("Optional webhook URL for when training finishes."),
    preset: z.enum(VALIDATION.TUNE.PRESETS as [string, ...string[]]).optional()
        .default("flux-lora-portrait").describe("Optional Flux training preset."),
    characteristics: z.record(z.string()).optional()
        .describe("Optional key-value pairs for prompt templating (e.g., {\"eye_color\": \"blue eyes\"})."),
    branch: z.enum(['sd15', 'sdxl1', 'fast']).optional()
        .describe("Optional branch parameter. Use 'fast' for mock testing without incurring charges."),
};

const CreateTuneSchemaRaw = z.object(CreateTuneRawSchema)
    .refine(data => {
        return (data.image_urls && data.image_urls.length >= VALIDATION.TUNE.MIN_IMAGES) ||
               (data.image_files && data.image_files.length >= VALIDATION.TUNE.MIN_IMAGES);
    }, {
        message: `At least ${VALIDATION.TUNE.MIN_IMAGES} images must be provided via image_urls or image_files`,
        path: ['images']
    });

export const CreateTuneSchema = CreateTuneSchemaRaw;

export type CreateTuneInput = z.infer<typeof CreateTuneSchema>;

export const createTuneToolDefinition = {
    name: "create_tune",
    description: "Creates a new Astria fine-tune using Flux defaults. Accepts either publicly accessible image URLs or local image files from the tune_images directory."
};

export async function handleCreateTune(params: any): Promise<any> {
    try {
        const parsedParams = CreateTuneSchema.parse(params);

        // Prepare the tune data
        const tuneData: any = {
            title: parsedParams.title,
            name: parsedParams.name,
            callback: parsedParams.callback,
            preset: parsedParams.preset,
            characteristics: parsedParams.characteristics,
            branch: parsedParams.branch
        };

        // Process images based on what was provided
        if (parsedParams.image_urls && parsedParams.image_urls.length >= VALIDATION.TUNE.MIN_IMAGES) {
            // Use the provided image URLs
            tuneData.image_urls = parsedParams.image_urls;
        } else if (parsedParams.image_files && parsedParams.image_files.length >= VALIDATION.TUNE.MIN_IMAGES) {
            // Process local files from the tune_images directory
            // Prepare image data array
            const imageData: { name: string, data: string }[] = [];

            // Process each file
            for (const filename of parsedParams.image_files) {
                try {
                    const { data } = readTuneImageAsBase64(filename);
                    imageData.push({ name: filename, data });
                } catch (fileError: any) {
                    throw new Error(`Failed to process image file '${filename}': ${fileError.message}. ` +
                        `Make sure the file exists in the ${STORAGE.TUNE_IMAGES_SUBDIRECTORY} directory.`);
                }
            }

            tuneData.image_data = imageData;
        } else {
            throw new Error(`At least ${VALIDATION.TUNE.MIN_IMAGES} images must be provided via image_urls or image_files`);
        }


        const result = await astriaApi.createTune(tuneData);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            } as TextContent],
        };
    } catch (error: any) {
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('API error (422)')) {
                error.message = `${error.message}\n\nThis may be due to:\n` +
                    `- Invalid images (URLs must be publicly accessible, files must exist and be valid)\n` +
                    `- Not enough valid images (need at least ${VALIDATION.TUNE.MIN_IMAGES})\n` +
                    `- Images not suitable for training (e.g., too small, low quality)\n` +
                    `- Invalid subject type or preset\n` +
                    `- Rate limiting or account restrictions`;
            } else if (error.message.includes('API error (401)') || error.message.includes('API error (403)')) {
                error.message = `${error.message}\n\nThis is an authentication error. Please check that your Astria API key is valid and has the necessary permissions.`;
            } else if (error.message.includes('NETWORK_ERROR') || error.message.includes('TIMEOUT_ERROR')) {
                error.message = `${error.message}\n\nThis is a network or timeout error. Please check your internet connection and try again. If the problem persists, the Astria API may be experiencing issues.`;
            }
        }
        return handleMcpError(error, 'create_tune');
    }
}
