#!/usr/bin/env node
// src/index.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TextContent, ImageContent, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
// Import functions from the SDK using .js extension for ES Modules
import {
    createTune,
    retrieveTune,
    retrievePrompt,
    generateImage,
    CONFIG
} from "./astria-sdk";
import axios from 'axios';

// --- MCP Server Setup ---
const server = new McpServer({
    name: "astria-mcp-server",
    version: "1.0.0",
    capabilities: {
        tools: {}, // Enable tools capability
        resources: {}, // Enable resources capability
    },
});

// --- Helper functions ---

/**
 * Validates and converts string ID parameters to numbers
 * @param idString - The ID value to parse
 * @param paramName - Name of the parameter for error messages
 * @returns Parsed numeric ID
 * @throws Error if ID is invalid
 */
function parseId(idString: unknown, paramName: string): number {
    if (typeof idString !== 'string') {
        throw new Error(`Invalid type for ${paramName}: expected string, got ${typeof idString}`);
    }
    const id = parseInt(idString, 10);
    if (isNaN(id) || id <= 0) {
        throw new Error(`Invalid numeric value for ${paramName}: '${idString}'`);
    }
    return id;
}

/**
 * Standardizes error handling for MCP tool responses
 * @param error - The error object to process
 * @param context - Contextual information about the operation
 * @returns Formatted MCP error response
 */
function handleToolError(error: any, context: string): { isError: true, content: TextContent[] } {
    const errorMessage = error instanceof z.ZodError
        ? `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        : `Error ${context}: ${error.message}`;

    return {
        isError: true,
        content: [{ type: "text", text: errorMessage } as TextContent],
    };
}


// --- Resource Definitions ---

// Resource 1: Retrieve Specific Tune
const TuneResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}", { list: undefined });

server.resource(
    "astria_tune", // Unique ID for this resource definition
    TuneResourceTemplate,
    async (uri, params): Promise<ReadResourceResult> => {
        let tuneId: number;
        try {
            // Parse and validate tune_id from the URI template parameters
            tuneId = parseId(params.tune_id, 'tune_id');
            console.error(`MCP Resource Read: astria_tune with tune_id=${tuneId}`);

            // Call the SDK function
            const result = await retrieveTune(tuneId);

            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                }]
            };
        } catch (error: any) {
            // Propagate error from SDK
            throw error;
        }
    }
);

// Resource 2: Retrieve Specific Prompt (Nested under Tune)
// Template captures both tune_id and prompt_id
const PromptResourceTemplate = new ResourceTemplate("astria://tune/{tune_id}/prompt/{prompt_id}", { list: undefined });

server.resource(
    "astria_prompt", // Unique ID for this resource definition
    PromptResourceTemplate,
    async (uri, params): Promise<ReadResourceResult> => {
        let tuneId: number;
        let promptId: number;
        try {
            // Parse and validate both IDs from the URI template parameters
            tuneId = parseId(params.tune_id, 'tune_id');
            promptId = parseId(params.prompt_id, 'prompt_id');
            console.error(`MCP Resource Read: astria_prompt with tune_id=${tuneId}, prompt_id=${promptId}`);

            // Call the SDK function
            const result = await retrievePrompt(tuneId, promptId);

            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                }]
            };
        } catch (error: any) {
            // Propagate error from SDK
            throw error;
        }
    }
);


// --- Tool Definitions ---

// Tool 1: Create Tune
const CreateTuneRawSchema = {
    title: z.string().describe("Unique title for the tune (e.g., including a UUID)."),
    name: z.string().describe("Class name describing the subject (e.g., man, woman, cat, dog, boy, girl, baby, style, or any custom class)."),
    image_urls: z.array(z.string().url()).min(4).describe("Array of at least 4 image URLs for training."),
    characteristics: z.record(z.string()).optional().describe("Optional key-value pairs for prompt templating (e.g., {\"eye_color\": \"blue eyes\"})."),
};
const CreateTuneInputValidator = z.object(CreateTuneRawSchema);

server.tool(
    "create_tune",
    "Creates a new Astria fine-tune using Flux defaults.",
    CreateTuneRawSchema,
    async (params) => {
        try {
            const parsedParams = CreateTuneInputValidator.parse(params);
            console.error(`MCP Tool Call: create_tune`);

            // Set preset automatically based on class name
            const preset = parsedParams.name === 'boy' || parsedParams.name === 'girl' || parsedParams.name === 'baby' ? 'flux-lora-focus' : parsedParams.name === 'man' || parsedParams.name === 'woman' ? 'flux-lora-portrait' : parsedParams.name === 'style' ? null : 'flux-lora-focus';

            const tuneApiData = {
                tune: {
                    title: parsedParams.title,
                    name: parsedParams.name,
                    image_urls: parsedParams.image_urls,
                    base_tune_id: CONFIG.MODELS.FLUX.ID,
                    model_type: "lora",
                    preset,
                    characteristics: parsedParams.characteristics,
                },
            };
            const result = await createTune(tuneApiData);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                } as TextContent],
            };
        } catch (error: any) {
            return handleToolError(error, 'creating tune');
        }
    }
);

// Tool 2: Image Generation
const ImageRawSchema = {
    text: z.string().describe("Text description of the desired image"),
    tune: z.string().optional().describe("Name of the LoRA tune/subject to apply if found in the LoRA tune list."),
    aspect: z.enum(['square', 'portrait', 'landscape']).optional().default('square').describe("Aspect ratio of the generated image")
};
const ImageInputValidator = z.object(ImageRawSchema);

server.tool(
    "generate_image",
    "Generate an image with Astria. Just provide text and optionally a LoRA tune or subject name to use with inbuilt lora confirmation.",
    ImageRawSchema,
    async (params) => {
        try {
            const parsedParams = ImageInputValidator.parse(params);

            const imageParams = {
                prompt: parsedParams.text,
                tune_title: parsedParams.tune,
                aspect_ratio: parsedParams.aspect
            };

            console.error(`MCP Tool Call: image with text=${parsedParams.text}${parsedParams.tune ? `, tune=${parsedParams.tune}` : ''}`);

            const result = await generateImage(imageParams);

            const imageContents = [];

            if (result.images && result.images.length > 0) {
                for (let i = 0; i < result.images.length; i++) {
                    const imageUrl = result.images[i];

                    // Fetch the image
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

                    // Convert to base64
                    const base64Data = response.data.toString('base64');

                    // Add as image content
                    imageContents.push({
                        type: "image",
                        data: base64Data,
                        mimeType: "image/jpeg",
                    } as ImageContent);

                    // Add the direct URL as text for easy access
                    imageContents.push({
                        type: "text",
                        text: `[generated image url](${imageUrl})`,
                        annotations: {
                            format: 'markdown'
                        },
                    } as TextContent);
                }
            } else {
                imageContents.push({
                    type: "text",
                    text: "No images were generated. Try again with a different prompt or tune name."
                } as TextContent);
            }

            return {
                content: imageContents,
            };
        } catch (error: any) {
            return handleToolError(error, 'generating image');
        }
    }
);

// --- Start the Server ---
async function main() {
    try {
        console.error("Starting Astria MCP Server...");
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Astria MCP Server connected via stdio.");
    } catch (error: any) {
        console.error("Failed to start Astria MCP Server:", error.message, error.stack);
        process.exit(1);
    }
}

main();
