// Generate image tool implementation

import { z } from 'zod';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { astriaApi } from '../api/client';
import { FEATURE_FLAGS, MODEL_CONFIG } from '../config';
// import { AstriaError, AstriaErrorCode } from '../errors/index'; // Unused for now

const AVAILABLE_MODELS = Object.keys(MODEL_CONFIG.MODEL_IDS) as [string, ...string[]];

export const GenerateImageRawSchema = {
    prompt: z.string().describe("Text description of the desired image"),
    model: z.enum(AVAILABLE_MODELS).default('flux').describe("Model to use: 'flux' (standard quality)"),
    lora_tune_id: z.number().int().positive().optional().describe("Optional ID of a Flux LoRA fine-tune to use with the Flux model (LoRAs must be used with their compatible base model)"),
    lora_weight: z.number().min(0.1).max(1.0).default(1.0).optional().describe("Weight of the LoRA effect (0.1-1.0)"),
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

export async function handleGenerateImage(params: any): Promise<any> {
    try {
        // Validate parameters - this will throw if validation fails
        const parsedParams = GenerateImageSchema.parse(params);
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Tool Call: generate_image with model=${parsedParams.model}${parsedParams.lora_tune_id ? `, lora=${parsedParams.lora_tune_id}` : ''}`);
        }

        // Check if user provided a negative prompt with Flux model
        if (parsedParams.model === 'flux' && parsedParams.negative_prompt) {
            if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                console.error(`Warning: Negative prompt provided but not supported by Flux model. It will be ignored.`);
            }
        }

        // Check if user is trying to use a LoRA with a non-Flux model
        if (parsedParams.lora_tune_id && parsedParams.model !== 'flux') {
            throw new Error(`LoRA fine-tunes can only be used with their compatible base models. The selected LoRA is a Flux LoRA and can only be used with the Flux model.`);
        }

        // Call the API client with all parameters including LoRA if provided
        const result = await astriaApi.generateImage(parsedParams.model, {
            prompt: {
                text: parsedParams.prompt,
                super_resolution: parsedParams.super_resolution,
                inpaint_faces: parsedParams.inpaint_faces,
                negative_prompt: parsedParams.negative_prompt, // SDK will handle this appropriately
                width: parsedParams.width,
                height: parsedParams.height,
                num_images: parsedParams.num_images,
                guidance_scale: parsedParams.guidance_scale,
                seed: parsedParams.seed
            },
            lora_tune_id: parsedParams.lora_tune_id,
            lora_weight: parsedParams.lora_weight
        });

        // Extract image URLs - in Astria API, images is an array of URLs
        const imageUrls = result.images || [];

        // Only open the browser if we have valid images
        if (imageUrls.length > 0 && FEATURE_FLAGS.OPEN_IMAGES_IN_BROWSER) {
            try {
                const open = (await import('open')).default;
                await open(imageUrls[0]);
                if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
                    console.error(`Opened image in browser: ${imageUrls[0]}`);
                }
            } catch (openError) {
                if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
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
            if (parsedParams.lora_tune_id) {
                responseText += `- LoRA: ID ${parsedParams.lora_tune_id} (weight: ${parsedParams.lora_weight || 1.0})\n`;
            }
            responseText += `- Prompt: "${parsedParams.prompt}"\n`;
            if (parsedParams.negative_prompt) {
                responseText += `- Negative prompt: "${parsedParams.negative_prompt}"\n`;
            }
            responseText += `- Dimensions: ${parsedParams.width}x${parsedParams.height}\n`;

            contentArray.push({ type: "text", text: responseText } as TextContent);

            // Check if we should display images directly in chat
            if (FEATURE_FLAGS.DISPLAY_IMAGES_IN_CHAT) {
                try {
                    // Fetch the image data for the first image
                    const axios = (await import('axios')).default;
                    const response = await axios.get(imageUrls[0], { responseType: 'arraybuffer' });

                    // Convert to base64
                    const buffer = Buffer.from(response.data, 'binary');
                    const base64Data = buffer.toString('base64');

                    // Determine MIME type based on URL extension
                    let mimeType = 'image/jpeg'; // Default
                    if (imageUrls[0].endsWith('.png')) mimeType = 'image/png';
                    else if (imageUrls[0].endsWith('.gif')) mimeType = 'image/gif';
                    else if (imageUrls[0].endsWith('.webp')) mimeType = 'image/webp';

                    // Add the image directly to the response
                    contentArray.push({
                        type: "image",
                        data: base64Data,
                        mimeType: mimeType
                    });
                } catch (imageError) {
                    if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
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
        if (FEATURE_FLAGS.ENABLE_ERROR_LOGGING) {
            console.error(`MCP Error in generate_image tool: ${error.message}`);
        }
        const displayMessage = error instanceof z.ZodError
            ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            : `Error generating image: ${error.message}`;
        return {
            isError: true,
            content: [{ type: "text", text: displayMessage } as TextContent],
        };
    }
}
