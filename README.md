# Astria MCP Server

## Overview
This MCP server allows using Astria inside your chat application in order to fine-tune and generate images with Astria fine-tuning API.

/ TODO add Smithery installation instructions and publish to awesome lists and smithery

## Setting up with Claude desktop client
In terminal:
```bash
git clone https://github.com/astriaai/astria-mcp.git
```

Open your Claude desktop app, and go to settings -> Developer -> Edit config
```JSON
{
  "mcpServers": {
    "astria": {
      "command": "node",
      "args": [
        "PATH_TO_ASTRIA_MCP_SERVER/astria-mcp-server/dist/index.js"
      ],
      "env": {
        "ASTRIA_API_KEY": "YOUR_API_KEY => https://www.astria.ai/users/edit#api",
        "ASTRIA_IMAGE_DIRECTORY": "C:/Users/YourUsername/Pictures/Astria"  // Optional: Custom directory for storing images
      }
    }
  }
}
```

## Configuration

### Required Environment Variables

- `ASTRIA_API_KEY` - Your Astria API key (get it from https://www.astria.ai/users/edit#api)

### Optional Environment Variables

- `ASTRIA_IMAGE_DIRECTORY` - Custom directory for storing generated images and training images
  - Default: `AppData/Local/astria-mcp` (Windows) or `~/.astria-mcp` (macOS/Linux)

## Examples

### Generate Images with the Flux Model

1. **Basic image generation**:
   ```
   Generate an image of a cat in a cyberpunk city with neon lights reflecting off its fur
   ```

2. **Customizing dimensions**:
   ```
   Generate a detailed image of a fantasy castle on a mountain that's 1024x1024 pixels
   ```

3. **Controlling image generation with guidance scale**:
   ```
   Generate an image of a futuristic spaceship with a guidance scale of 15 so it follows my prompt more precisely
   ```

4. **Using a specific seed for reproducibility**:
   ```
   Generate a portrait of a woman with blue eyes and blonde hair using seed 42
   ```

5. **Creating multiple variations**:
   ```
   Generate 4 different images of a peaceful beach at sunset
   ```

6. **Using negative prompts**:
   ```
   Generate an image of a forest landscape but don't include any people, buildings, text, or watermarks
   ```
   *Note: Negative prompts are not supported by the Flux model*

### Create Fine-Tunes (LoRAs)

1. **Creating a person LoRA with local image files**:
   ```
   Create a fine-tune called "John Portrait LoRA" of a man using these images: portrait1.jpg, portrait2.jpg, portrait3.jpg, and portrait4.jpg
   ```
   *Note: Make sure the image files are in your tune_images directory, and copy the full path of the selected images in the prompt*

2. **Creating a style LoRA with image URLs**:
   ```
   Create a style fine-tune called "Watercolor Style" using these image URLs:
   https://example.com/watercolor1.jpg
   https://example.com/watercolor2.jpg
   https://example.com/watercolor3.jpg
   https://example.com/watercolor4.jpg
   ```

3. **Creating a pet LoRA with characteristics**:
   ```
   Create a fine-tune of my dog named "Max the Dog" using these images: max1.jpg, max2.jpg, max3.jpg, and max4.jpg. His characteristics are golden retriever breed with golden fur.
   ```

4. **Testing with the fast branch (no charges)**:
   ```
   Create a test fine-tune called "Test LoRA" of a woman using these image URLs without incurring any charges by using the fast branch:
   https://example.com/test1.jpg
   https://example.com/test2.jpg
   https://example.com/test3.jpg
   https://example.com/test4.jpg
   ```

5. **Using a specific training preset**:
   ```
   Create a quick fine-tune of a woman called "Quick Portrait" using the flux-lora-fast preset with these images: portrait1.jpg, portrait2.jpg, portrait3.jpg, and portrait4.jpg
   ```

### Use LoRAs in Image Generation

1. **Basic LoRA usage with tune ID**:
   ```
   Generate an image of a man in a sci-fi environment using my fine-tune with ID 123456 at a weight of 0.8
   ```

2. **Combining multiple LoRAs**:
   ```
   Generate a portrait in a fantasy setting using two fine-tunes: ID 123456 at weight 0.7 and ID 789012 at weight 0.5
   ```

3. **Style LoRA with specific weight**:
   ```
   Generate an image of a peaceful mountain landscape using my style fine-tune with ID 345678 at a weight of 0.9
   ```

4. **Fine-tuning the weight parameter**:
   ```
   Generate an image of a person as an astronaut using my fine-tune with ID 123456 at a weight of 0.6 to balance between the subject and the astronaut concept
   ```

### Working with LoRA Resources

1. **Select and use a LoRA resource**:
   ```
   Generate an image of a person in a fantasy setting using this LoRA
   ```
   *Click on a LoRA resource first, which will attach it to your message*

2. **View LoRA details**:
   ```
   Tell me more about this LoRA
   ```
   *Click on a LoRA resource first to attach it to your message*

3. **Using selected LoRA resources with custom weights**:
   ```
   Generate an image using this LoRA at a weight of 0.7 showing a portrait in a cyberpunk setting
   ```
   *Click on a LoRA resource first to attach it to your message*

4. **Combining selected LoRA resources**:
   ```
   Generate an image combining these two LoRAs
   ```
   *Click on multiple LoRA resources to attach them to your message*

### List and Manage Fine-Tunes

1. **List all available Fine-Tunes**:
   ```
   List all my fine-tunes
   ```

2. **List Fine-Tunes with pagination**:
   ```
   Show me the next page of my Fine-Tunes starting from offset 20
   ```

3. **Complete workflow example**:
   ```
   First, list all my available LoRAs. Then, I'll select one to generate an image of a portrait in a renaissance style setting.
   ```

