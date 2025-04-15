import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { FEATURES, MODELS } from '../config';
import { AstriaError, AstriaErrorCode } from '../errors/index';
import { TuneInfo } from '../api/types';
import { fetchImageAsBase64 } from '../utils/helpers';

const AVAILABLE_MODELS = [MODELS.FLUX.NAME] as [string, ...string[]];

// Schema for the generate-image tool
//
// Notes on LoRA usage with Astria:
// 1. LoRAs can only be used with their compatible base models (e.g., Flux LoRAs with Flux model)
// 2. LoRAs may require specific tokens in the prompt text
// 3. LoRAs from different branches cannot be combined (e.g., flux1 and sd15)
// 4. The system will validate LoRAs before using them and add required tokens automatically
export const GenerateImageRawSchema = {
    prompt: z.string().describe("Text description of the desired image"),
    model: z.enum(AVAILABLE_MODELS).default('flux').describe("Model to use: 'flux' (standard quality)"),
    lora_tunes: z.array(z.object({
        tune_id: z.number().int().positive().describe("ID of the LoRA tune to apply"),
        weight: z.number().min(0.1).max(1.0).default(1.0).describe("Weight/strength of the LoRA effect (0.1-1.0)")
    })).optional().describe("Optional array of LoRA tunes to apply. The system will validate each LoRA and add required tokens for style LoRAs automatically. Multiple LoRAs can be combined if they're from the same branch."),
    negative_prompt: z.string().optional().describe("Text description of what to avoid in the image (Note: Not supported by the Flux model)"),
    width: z.number().int().min(512).max(2048).default(1024).describe("Image width in pixels (512-2048)"),
    height: z.number().int().min(512).max(2048).default(1024).describe("Image height in pixels (512-2048)"),
    num_images: z.number().int().min(1).max(4).default(1).describe("Number of images to generate (1-4)"),
    super_resolution: z.boolean().default(true).describe("Apply super-resolution enhancement"),
    inpaint_faces: z.boolean().default(true).describe("Apply face inpainting/enhancement"),
    guidance_scale: z.number().min(1).max(20).optional().describe("How closely to follow the prompt (1-20)"),
    seed: z.number().int().optional().describe("Random seed for reproducible results")
};

export const GenerateImageSchema = z.object(GenerateImageRawSchema);

export type GenerateImageInput = z.infer<typeof GenerateImageSchema>;

// Validates a LoRA tune and returns its details
export async function validateLoraTune(tuneId: number): Promise<TuneInfo> {
    try {
        // Retrieve the tune details
        const tuneInfo = await astriaApi.retrieveTune(tuneId);

        // Check if the tune exists and is trained
        if (!tuneInfo) {
            throw new AstriaError(
                `LoRA tune with ID ${tuneId} not found. Please check that the LoRA ID is correct and that you have access to it.`,
                AstriaErrorCode.RESOURCE_NOT_FOUND
            );
        }

        if (!tuneInfo.trained_at) {
            throw new AstriaError(
                `LoRA tune with ID ${tuneId} exists but is not trained yet. Please wait for training to complete before using this LoRA.`,
                AstriaErrorCode.VALIDATION_ERROR
            );
        }

        // Check if it's a LoRA type
        if (tuneInfo.model_type !== 'lora') {
            throw new AstriaError(
                `Tune with ID ${tuneId} is not a LoRA (type: ${tuneInfo.model_type || 'unknown'}). Only LoRA type tunes can be used with this feature.`,
                AstriaErrorCode.VALIDATION_ERROR
            );
        }

        return tuneInfo;
    } catch (error) {
        if (error instanceof AstriaError) {
            throw error;
        }
        throw new AstriaError(
            `Failed to validate LoRA tune with ID ${tuneId}: ${(error as Error).message}. This may be due to API access issues or network problems.`,
            AstriaErrorCode.API_ERROR
        );
    }
}

export async function handleGenerateImage(params: any): Promise<any> {
    try {
        const parsedParams = GenerateImageSchema.parse(params);
        if (FEATURES.LOG_ERRORS) {
            const loraInfo = parsedParams.lora_tunes && parsedParams.lora_tunes.length > 0
                ? `, loras=${parsedParams.lora_tunes.map(l => l.tune_id).join(',')}`
                : '';
            console.error(`MCP Tool Call: generate_image with model=${parsedParams.model}${loraInfo}`);
        }

        if (parsedParams.model === 'flux' && parsedParams.negative_prompt) {
            if (FEATURES.LOG_ERRORS) {
                console.error(`Warning: Negative prompt provided but not supported by Flux model. It will be ignored.`);
            }
        }

        // Check if user is trying to use a LoRA with a non-Flux model
        const hasLoraTunes = parsedParams.lora_tunes && parsedParams.lora_tunes.length > 0;

        if (hasLoraTunes && parsedParams.model !== 'flux') {
            throw new Error(
                `LoRA fine-tunes can only be used with their compatible base models. ` +
                `The selected LoRA(s) are Flux LoRAs and can only be used with the Flux model. ` +
                `Please change the model to 'flux' or remove the LoRA tunes.`
            );
        }

        let promptText = parsedParams.prompt;
        let loraPrefix = '';

        if (hasLoraTunes) {
            // Validate each LoRA and build the prefix
            for (const lora of parsedParams.lora_tunes!) {
                try {
                    // Validate the LoRA tune
                    const tuneInfo = await validateLoraTune(lora.tune_id);

                    // Add the LoRA syntax to the prefix
                    loraPrefix += `<lora:${lora.tune_id}:${lora.weight || 1.0}>`;

                    // If the LoRA has a token, make sure it's in the prompt
                    if (tuneInfo.token && !promptText.includes(tuneInfo.token)) {
                        // Add the token to the prompt if it's not already there
                        promptText = `${tuneInfo.token} ${promptText}`;
                        if (FEATURES.LOG_ERRORS) {
                            console.error(`Added required token '${tuneInfo.token}' for LoRA ${lora.tune_id}`);
                        }
                    }
                } catch (error) {
                    // If validation fails, throw a user-friendly error with detailed information
                    const errorMessage = (error as Error).message;
                    throw new Error(
                        `Invalid LoRA tune ID ${lora.tune_id}: ${errorMessage}\n\n` +
                        `Common LoRA issues:\n` +
                        `- The LoRA ID may not exist or you don't have access to it\n` +
                        `- The LoRA may still be training and not ready for use\n` +
                        `- The tune might not be a LoRA type (only LoRAs can be used here)\n` +
                        `- Some LoRAs require specific tokens in your prompt`
                    );
                }
            }

            if (FEATURES.LOG_ERRORS) {
                console.error(`Using LoRAs in prompt: ${loraPrefix}`);
            }
        }

        // Add the LoRA prefix to the prompt if any LoRAs were specified
        if (loraPrefix) {
            promptText = `${loraPrefix} ${promptText}`;
        }

        const result = await astriaApi.generateImage(parsedParams.model, {
            prompt: {
                text: promptText,
                super_resolution: parsedParams.super_resolution,
                inpaint_faces: parsedParams.inpaint_faces,
                negative_prompt: parsedParams.negative_prompt, // SDK will handle this appropriately
                width: parsedParams.width,
                height: parsedParams.height,
                num_images: parsedParams.num_images,
                guidance_scale: parsedParams.guidance_scale,
                seed: parsedParams.seed
            }
        });

        // Extract image URLs - in Astria API, images is an array of URLs
        const imageUrls = result.images || [];

        // Only open the browser if we have valid images
        if (imageUrls.length > 0 && FEATURES.OPEN_IMAGES_IN_BROWSER) {
            try {
                const open = (await import('open')).default;
                await open(imageUrls[0]);
                if (FEATURES.LOG_ERRORS) {
                    console.error(`Opened image in browser: ${imageUrls[0]}`);
                }
            } catch (openError) {
                if (FEATURES.LOG_ERRORS) {
                    console.error(`Failed to open image in browser: ${openError}`);
                }
            }
        }

        // Format a user-friendly response similar to EverArt
        if (imageUrls.length > 0) {
            // Create a content array for the response
            const contentArray = [];

            // Add the text content first
            let responseText = `Image generated successfully!\n\n`;
            responseText += `Generation details:\n`;
            responseText += `- Model: ${parsedParams.model}\n`;

            // Show detailed information about LoRAs if they were used
            if (parsedParams.lora_tunes && parsedParams.lora_tunes.length > 0) {
                responseText += `- LoRAs used:\n`;
                for (const lora of parsedParams.lora_tunes) {
                    // Try to get the LoRA details if available
                    try {
                        const tuneInfo = await validateLoraTune(lora.tune_id);
                        responseText += `  - ID ${lora.tune_id}: ${tuneInfo.title} (${tuneInfo.name} type, weight: ${lora.weight || 1.0})\n`;
                        if (tuneInfo.token) {
                            responseText += `    Required token: "${tuneInfo.token}" (automatically added to prompt)\n`;
                        }
                    } catch (error) {
                        // If we can't get details, just show the basic info
                        responseText += `  - ID ${lora.tune_id} (weight: ${lora.weight || 1.0})\n`;
                    }
                }
                responseText += `\nNote: LoRAs are applied using the syntax <lora:id:weight> in the prompt text.\n`;
            }
            responseText += `- Prompt: "${parsedParams.prompt}"\n`;
            if (parsedParams.negative_prompt) {
                responseText += `- Negative prompt: "${parsedParams.negative_prompt}"\n`;
            }
            responseText += `- Dimensions: ${parsedParams.width}x${parsedParams.height}\n`;

            contentArray.push({ type: "text", text: responseText } as TextContent);

            // Check if we should display images directly in chat
            if (FEATURES.DISPLAY_IMAGES_IN_CHAT) {
                try {
                    // Fetch the image data for the first image using our utility function
                    const { data, mimeType } = await fetchImageAsBase64(imageUrls[0]);

                    // Add the image directly to the response
                    contentArray.push({
                        type: "image",
                        data,
                        mimeType
                    });
                } catch (imageError) {
                    if (FEATURES.LOG_ERRORS) {
                        console.error(`Failed to fetch image data: ${imageError}`);
                    }
                }
            }

            // Always provide the URL and resource URI as text
            contentArray.push({
                type: "text",
                text: `\nImage URL: ${imageUrls[0]}\n\nResource URI: astria://image/${encodeURIComponent(imageUrls[0])}`
            } as TextContent);

            // Add additional images as text references if there are any
            if (imageUrls.length > 1) {
                let additionalText = `\n\nAdditional images:\n`;
                for (let i = 1; i < imageUrls.length; i++) {
                    const resourceUri = `astria://image/${encodeURIComponent(imageUrls[i])}`;
                    additionalText += `${i+1}. Image URL: ${imageUrls[i]}\n   Resource URI: ${resourceUri}\n`;
                }
                contentArray.push({ type: "text", text: additionalText } as TextContent);
            }

            return {
                content: contentArray,
            };
        } else {
            return {
                content: [{
                    type: "text",
                    text: `No images were generated. This might be due to content policy restrictions or a temporary issue.`
                } as TextContent],
            };
        }
    } catch (error: any) {
        if (FEATURES.LOG_ERRORS) {
            console.error(`MCP Error in generate_image tool: ${error.message}`);
        }

        let errorMessage = error.message || 'Unknown error';

        // Add context for common Astria API errors
        if (errorMessage.includes('text: must include')) {
            // This is likely a LoRA that requires a specific token
            const tokenMatch = errorMessage.match(/must include [`']([^'`]+)[`']/i);
            const requiredToken = tokenMatch ? tokenMatch[1] : 'specific token';

            errorMessage = `${errorMessage}\n\nThis error occurs when using a LoRA that requires a specific token in the prompt. ` +
                `Please add "${requiredToken}" to your prompt text when using this LoRA.`;
        } else if (errorMessage.includes('Model branch mismatch')) {
            // This is a branch mismatch error (trying to combine incompatible LoRAs)
            errorMessage = `${errorMessage}\n\nThis error occurs when trying to combine LoRAs from different model branches. ` +
                `You can only combine LoRAs that are from the same branch (e.g., all flux1 or all sd15).`;
        } else if (errorMessage.includes('API error (422)')) {
            // Generic validation error - add more context
            errorMessage = `${errorMessage}\n\nThis may be due to:\n` +
                `- Invalid LoRA ID or LoRA not accessible\n` +
                `- Missing required token for a LoRA\n` +
                `- Incompatible LoRAs from different branches\n` +
                `- Other validation issues with the prompt or parameters`;
        }

        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error generating image: ${errorMessage}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
