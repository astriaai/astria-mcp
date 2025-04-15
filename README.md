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

  