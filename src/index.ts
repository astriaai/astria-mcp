// src/index.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TextContent, ImageContent, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
// Import functions from the SDK using .js extension for ES Modules
import {
    createTune,
    listTunes,
    retrieveTune,
    retrievePrompt,
    generateImage,
    CONFIG
} from "./astria-sdk.js";
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

// Tool 2: List Tunes
const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0."),
};
const ListTunesInputValidator = z.object(ListTunesRawSchema);

server.tool(
    "list_tunes",
    "Lists the user's Astria fine-tunes.",
    ListTunesRawSchema,
    async (params) => {
        try {
            const parsedParams = ListTunesInputValidator.parse(params);
            console.error(`MCP Tool Call: list_tunes with offset=${parsedParams.offset}`);

            // Call the SDK function
            const result = await listTunes(parsedParams.offset);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                } as TextContent],
            };
        } catch (error: any) {
            return handleToolError(error, 'listing tunes');
        }
    }
);


// Tool 3: Generate Image (Removed create_prompt as it's redundant)

const GenerateImageRawSchema = {
    prompt: z.string().describe("Text description of the desired image"),
    lora_tunes: z.array(z.object({
        tune_id: z.number().int().positive().describe("ID of the LoRA tune to apply"),
        weight: z.number().min(0.1).max(1.0).default(1.0).describe("Weight/strength of the LoRA effect (0.1-1.0)")
    })).optional().describe("Optional array of LoRA tunes to apply"),
    width: z.number().int().min(512).max(2048).default(1024).describe("Image width in pixels (512-2048)"),
    height: z.number().int().min(512).max(2048).default(1024).describe("Image height in pixels (512-2048)"),
    guidance_scale: z.number().min(1).max(20).default(7.5).describe("How closely to follow the prompt (1-20)"),
    num_images: z.number().int().min(1).max(4).default(1).describe("Number of images to generate (1-4)"),
    super_resolution: z.boolean().default(true).describe("Apply super-resolution enhancement"),
    inpaint_faces: z.boolean().default(true).describe("Apply face inpainting/enhancement"),
    seed: z.number().int().optional().describe("Random seed for reproducible results")
};
const GenerateImageInputValidator = z.object(GenerateImageRawSchema);

server.tool(
    "generate_image",
    "Generate high-quality images using Astria's models. Using the flux model. Supports optional Flux LoRA fine-tunes when using the Flux model (LoRAs must be used with their compatible base model).",
    GenerateImageRawSchema,
    async (params) => {
        try {
            const parsedParams = GenerateImageInputValidator.parse(params);

            console.error(`MCP Tool Call: generate_image with prompt=${parsedParams.prompt}`);

            // Call the SDK function
            const result = await generateImage(parsedParams);

            // Format the response with images displayed in chat
            const imageContents = [];

            if (result.images && result.images.length > 0) {
                for (let i = 0; i < result.images.length; i++) {
                    const imageUrl = result.images[i];

                    // Fetch the image
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

                    // Convert to base64
                    const base64Data = response.data.toString('base64');

                    // Add as image content if it's not too large
                    if (base64Data.length < 512000 ) {
                        imageContents.push({
                            type: "image",
                            data: base64Data,
                            mimeType: "image/jpeg"
                        } as ImageContent);
                    }

                    // Add the direct URL as text for easy access
                    imageContents.push({
                        type: "text",
                        text: `GENERATED IMAGE URL: ${imageUrl}`
                    } as TextContent);
                }
            }
            else {
                imageContents.push({
                    type: "text",
                    text: "No images were generated. try again"
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
