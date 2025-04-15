import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client.js';
import { FEATURES, MODELS } from '../config.js';
import { AstriaError, AstriaErrorCode, handleMcpError } from '../errors/index.js';
import { TuneInfo } from '../api/types.js';
import { fetchImageAsBase64 } from '../utils/helpers.js';
import { saveBase64Image, openFile } from '../utils/file-system.js';
import path from 'path';

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
// Checks if the tune exists, is trained, and is a LoRA type
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

// Handles the generate image request
// Processes the parameters, validates LoRAs, generates images, and formats the response
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

        // Array to store local file paths
        const localFilePaths: string[] = [];

        // Save images locally if we have valid images
        if (imageUrls.length > 0) {
            try {
                // Save each image to local storage
                for (let i = 0; i < imageUrls.length; i++) {
                    const imageUrl = imageUrls[i];
                    const { data, mimeType } = await fetchImageAsBase64(imageUrl);

                    // Generate a filename based on the prompt and index
                    const promptWords = parsedParams.prompt.split(' ').slice(0, 3).join('-');
                    const sanitizedPrompt = promptWords.replace(/[^a-zA-Z0-9-]/g, '');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const extension = mimeType.split('/')[1] || 'png';
                    const filename = `${sanitizedPrompt}-${timestamp}${i > 0 ? `-${i+1}` : ''}.${extension}`;

                    // Save the image
                    const filePath = saveBase64Image(data, filename);
                    localFilePaths.push(filePath);

                    if (FEATURES.LOG_ERRORS) {
                        console.error(`Saved image to: ${filePath}`);
                    }
                }

                // Open the first image if available
                if (localFilePaths.length > 0) {
                    // Try to open in local viewer first
                    let localViewerSuccess = false;
                    try {
                        await openFile(localFilePaths[0]);
                        localViewerSuccess = true;
                        if (FEATURES.LOG_ERRORS) {
                            console.error(`Opened image in local viewer: ${localFilePaths[0]}`);
                        }
                    } catch (openError) {
                        if (FEATURES.LOG_ERRORS) {
                            console.error(`Failed to open image in local viewer: ${openError}`);
                        }
                        // Local viewer failed, will try browser as fallback
                    }

                    // If local viewer failed, try browser as fallback
                    if (!localViewerSuccess) {
                        try {
                            const open = (await import('open')).default;
                            await open(imageUrls[0]);
                            if (FEATURES.LOG_ERRORS) {
                                console.error(`Opened image in browser as fallback: ${imageUrls[0]}`);
                            }
                        } catch (openError) {
                            if (FEATURES.LOG_ERRORS) {
                                console.error(`Failed to open image in browser: ${openError}`);
                            }
                        }
                    }
                }
            } catch (saveError) {
                if (FEATURES.LOG_ERRORS) {
                    console.error(`Failed to save images locally: ${saveError}`);
                }
                // Continue without local files - we'll still have the URLs
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

            // Always provide the URL, local path, and resource URI as text
            let resourceInfo = `\nImage URL: ${imageUrls[0]}`;

            // Add local file path if available
            if (localFilePaths.length > 0) {
                resourceInfo += `\nLocal file: ${localFilePaths[0]}`;
                resourceInfo += `\nSaved to: ${path.dirname(localFilePaths[0])}`;
            }

            resourceInfo += `\nResource URI: astria://image/${encodeURIComponent(imageUrls[0])}`;

            contentArray.push({
                type: "text",
                text: resourceInfo
            } as TextContent);

            // Add additional images as text references if there are any
            if (imageUrls.length > 1) {
                let additionalText = `\n\nAdditional images:\n`;
                for (let i = 1; i < imageUrls.length; i++) {
                    const resourceUri = `astria://image/${encodeURIComponent(imageUrls[i])}`;
                    additionalText += `${i+1}. Image URL: ${imageUrls[i]}\n`;

                    // Add local file path if available
                    if (i < localFilePaths.length) {
                        additionalText += `   Local file: ${localFilePaths[i]}\n`;
                    }

                    additionalText += `   Resource URI: ${resourceUri}\n`;
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
        // Special handling for specific error types before using the standard handler
        if (error.message && typeof error.message === 'string') {
            // Add context for common Astria API errors
            if (error.message.includes('text: must include')) {
                // This is likely a LoRA that requires a specific token
                const tokenMatch = error.message.match(/must include [`']([^'`]+)[`']/i);
                const requiredToken = tokenMatch ? tokenMatch[1] : 'specific token';

                error.message = `${error.message}\n\nThis error occurs when using a LoRA that requires a specific token in the prompt. ` +
                    `Please add "${requiredToken}" to your prompt text when using this LoRA.`;
            } else if (error.message.includes('Model branch mismatch')) {
                // This is a branch mismatch error (trying to combine incompatible LoRAs)
                error.message = `${error.message}\n\nThis error occurs when trying to combine LoRAs from different model branches. ` +
                    `You can only combine LoRAs that are from the same branch (e.g., all flux1 or all sd15).`;
            } else if (error.message.includes('API error (422)')) {
                // Generic validation error - add more context
                error.message = `${error.message}\n\nThis may be due to:\n` +
                    `- Invalid LoRA ID or LoRA not accessible\n` +
                    `- Missing required token for a LoRA\n` +
                    `- Incompatible LoRAs from different branches\n` +
                    `- Other validation issues with the prompt or parameters`;
            }
        }

        // Use the standardized error handler
        return handleMcpError(error, 'generate_image');
    }
}
