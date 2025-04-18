# Astria MCP Server

## Overview
This MCP server allows using Astria inside your chat application in order to fine-tune and generate images with Astria fine-tuning API.

/ TODO add Smithery installation instructions and publish to awesome lists and smithery

## Installation

### Using Smithery (Recommended)

The easiest way to install the Astria MCP server is using Smithery with a single command:

```bash
npx -y @smithery/cli install astria-mcp-server --client claude --env.ASTRIA_API_KEY="your-api-key-here"
```

This will automatically install and configure the Astria MCP server for use with Claude, including your API key.

> You can get your Astria API key from: https://www.astria.ai/users/edit#api

#### Alternative: Manual API Key Configuration

If you prefer to install first and add the API key later, you can:

1. **Install without the API key:**

```bash
npx -y @smithery/cli install astria-mcp-server --client claude
```

2. **Then add your API key using the Smithery CLI:**

```bash
npx @smithery/cli config set astria-mcp-server.env.ASTRIA_API_KEY="your-api-key-here"
```

3. **Or manually edit the Claude config file:**

Open your Claude desktop app, and go to Settings → Developer → Edit config. Add your API key to the environment variables:

```json
{
  "mcpServers": {
    "astria-mcp-server": {
      "env": {
        "ASTRIA_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Manual Installation

If you prefer to install manually, follow these steps:

1. Clone the repository:
```bash
git clone https://github.com/astriaai/astria-mcp.git
cd astria-mcp
```

2. Install dependencies and build:
```bash
npm install
npm run build
```

3. Configure Claude desktop client:

Open your Claude desktop app, and go to Settings → Developer → Edit config
```json
{
  "mcpServers": {
    "astria": {
      "command": "node",
      "args": [
        "PATH_TO_ASTRIA_MCP_SERVER/astria-mcp-server/dist/index.js"
      ],
      "env": {
        "ASTRIA_API_KEY": "YOUR_API_KEY => https://www.astria.ai/users/edit#api"
      }
    }
  }
}
```
