// src/index.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TextContent, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
// Import functions from the SDK using .js extension for ES Modules
import {
    createTune,
    listTunes,
    retrieveTune, // Added
    createPrompt,
    retrievePrompt // Added
} from "./astria-sdk.js";

// --- MCP Server Setup ---
const server = new McpServer({
    name: "astria-mcp-server",
    version: "1.0.0",
    capabilities: {
        tools: {}, // Enable tools capability
        resources: {}, // Enable resources capability
    },
});

// --- Helper function for parsing IDs ---
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
            console.error(`MCP Error reading astria_tune resource (${params.tune_id}): ${error.message}`);
            throw new Error(`Failed to read Astria tune resource: ${error.message}`);
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
            console.error(`MCP Error reading astria_prompt resource (tune=${params.tune_id}, prompt=${params.prompt_id}): ${error.message}`);
            throw new Error(`Failed to read Astria prompt resource: ${error.message}`);
        }
    }
);


// --- Tool Definitions ---

// Tool 1: Create Tune
const CreateTuneRawSchema = {
    title: z.string().describe("Unique title for the tune (e.g., including a UUID)."),
    name: z.enum(["man", "woman", "cat", "dog", "boy", "girl", "style"]).describe("Class name describing the subject."),
    image_urls: z.array(z.string().url()).min(4).describe("Array of at least 4 image URLs for training."),
    callback: z.string().url().optional().describe("Optional webhook URL for when training finishes."),
    preset: z.enum(["flux-lora-focus", "flux-lora-portrait", "flux-lora-fast"]).optional().default("flux-lora-portrait").describe("Optional Flux training preset."),
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
            const tuneApiData = {
                tune: {
                    title: parsedParams.title,
                    name: parsedParams.name,
                    image_urls: parsedParams.image_urls,
                    callback: parsedParams.callback,
                    base_tune_id: 1504944,
                    model_type: "lora",
                    preset: parsedParams.preset,
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
            console.error(`MCP Error in create_tune tool: ${error.message}`);
            const displayMessage = error instanceof z.ZodError
                ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                : `Error creating tune: ${error.message}`;
            return {
                isError: true,
                content: [{ type: "text", text: displayMessage } as TextContent],
            };
        }
    }
);

// Tool 2: List Tunes (Moved back to Tool)
const ListTunesRawSchema = {
    offset: z.number().int().min(0).optional().describe("Starting offset for the list (page size is 20). Default 0."),
};
const ListTunesInputValidator = z.object(ListTunesRawSchema);

server.tool(
    "list_tunes", // Now a tool again
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
            console.error(`MCP Error in list_tunes tool: ${error.message}`);
            const displayMessage = error instanceof z.ZodError
                ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                : `Error listing tunes: ${error.message}`;
            return {
                isError: true,
                content: [{ type: "text", text: displayMessage } as TextContent],
            };
        }
    }
);


// Tool 3: Create Prompt (Simplified)
const CreatePromptRawSchemaSimplified = {
    lora_tune_id: z.number().int().positive().describe("The ID of the *user's* trained LoRA fine-tune."),
    text: z.string().describe("Text description for the image generation (excluding LoRA tag)."),
};
const CreatePromptInputValidatorSimplified = z.object(CreatePromptRawSchemaSimplified);

server.tool(
    "create_prompt",
    "Creates a new Astria prompt using a user's LoRA on the Flux base model with default settings (super-resolution, face-inpainting).",
    CreatePromptRawSchemaSimplified,
    async (params) => {
        try {
            const parsedParams = CreatePromptInputValidatorSimplified.parse(params);
            console.error(`MCP Tool Call: create_prompt (simplified) for lora_tune_id=${parsedParams.lora_tune_id}`);

            const fullPromptText = `<lora:${parsedParams.lora_tune_id}:1.0> ${parsedParams.text}`;
            const promptApiData = {
                prompt: {
                    text: fullPromptText,
                    super_resolution: true,
                    inpaint_faces: true,
                    // Optional params commented out
                },
            };
            const result = await createPrompt(promptApiData);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                } as TextContent],
            };
        } catch (error: any) {
            console.error(`MCP Error in create_prompt tool: ${error.message}`);
            const displayMessage = error instanceof z.ZodError
                ? `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                : `Error creating prompt: ${error.message}`;
            return {
                isError: true,
                content: [{ type: "text", text: displayMessage } as TextContent],
            };
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
