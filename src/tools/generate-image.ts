import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client.js';
import { MODELS } from '../config.js';
import { AstriaError, AstriaErrorCode, handleMcpError } from '../errors/index.js';
import { TuneInfo } from '../api/types.js';
import { fetchImageAsBase64 } from '../utils/helpers.js';
import { saveBase64Image, openFile } from '../utils/file-system.js';
import path from 'path';

const AVAILABLE_MODELS = [MODELS.FLUX.NAME] as [string, ...string[]];

// Schema for the generate-image tool
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
        // Only wrap non-AstriaError errors
        if (!(error instanceof AstriaError)) {
            throw new AstriaError(
                `Failed to validate LoRA tune with ID ${tuneId}: ${(error as Error).message}. This may be due to API access issues or network problems.`,
                AstriaErrorCode.API_ERROR
            );
        }
        throw error;
    }
}

export async function handleGenerateImage(params: any): Promise<any> {
    try {
        const parsedParams = GenerateImageSchema.parse(params);

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
                        promptText = `${tuneInfo.token} ${tuneInfo.name} ${promptText}`;
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

        // Create a content array for the response
        const contentArray = [];

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
                }

                // Open the first image if available
                if (localFilePaths.length > 0) {
                    // Open image with fallback to browser
                    openFile(localFilePaths[0])
                        .catch(() => import('open')
                            .then(({ default: open }) => open(imageUrls[0]))
                            .catch(() => { /* Unable to open image, but continue anyway */ })
                        );
                }
            } catch (saveError) {
                contentArray.push({
                    type: "text",
                    text: `Note: Could not save images locally. Using online URLs only.`
                } as TextContent);
            }
        }

        // Format a user-friendly response
        if (imageUrls.length > 0) {
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

            // Try to add image preview with thumbnail, fall back to text message if it fails
            const previewResult = await fetchImageAsBase64(imageUrls[0], {
                width: 400,  // Reasonable thumbnail size for chat
                thumbnail: true,
                fit: 'inside'
            }).catch(error => {
                contentArray.push({
                    type: "text",
                    text: `Note: Could not load image preview. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                } as TextContent);
                return null;
            });

            if (previewResult) {
                contentArray.push({
                    type: "image",
                    data: previewResult.data,
                    mimeType: previewResult.mimeType
                });
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

            // Add additional images with thumbnails if there are any
            if (imageUrls.length > 1) {
                contentArray.push({
                    type: "text",
                    text: `\n\nAdditional images:\n`
                } as TextContent);

                // Process each additional image
                for (let i = 1; i < imageUrls.length; i++) {
                    // Try to add thumbnail for this image
                    try {
                        const thumbnailResult = await fetchImageAsBase64(imageUrls[i], {
                            width: 400, 
                            thumbnail: true,
                            fit: 'inside'
                        });

                        // Add the thumbnail
                        contentArray.push({
                            type: "image",
                            data: thumbnailResult.data,
                            mimeType: thumbnailResult.mimeType
                        });

                        // Add image info
                        const resourceUri = `astria://image/${encodeURIComponent(imageUrls[i])}`;
                        let imageInfo = `${i+1}. Image URL: ${imageUrls[i]}\n`;

                        // Add local file path if available
                        if (i < localFilePaths.length) {
                            imageInfo += `   Local file: ${localFilePaths[i]}\n`;
                        }

                        imageInfo += `   Resource URI: ${resourceUri}`;

                        contentArray.push({ type: "text", text: imageInfo } as TextContent);
                    } catch {
                        // If thumbnail fails, just add the text reference
                        const resourceUri = `astria://image/${encodeURIComponent(imageUrls[i])}`;
                        let imageInfo = `${i+1}. Image URL: ${imageUrls[i]}\n`;

                        // Add local file path if available
                        if (i < localFilePaths.length) {
                            imageInfo += `   Local file: ${localFilePaths[i]}\n`;
                        }

                        imageInfo += `   Resource URI: ${resourceUri}\n   (Preview not available)`;

                        contentArray.push({ type: "text", text: imageInfo } as TextContent);
                    }
                }
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
        return handleMcpError(error, 'generate_image');
    }
}
