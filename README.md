# Docs MCP Server: Your AI's Up-to-Date Documentation Expert

AI coding assistants often struggle with outdated documentation and hallucinations. The **Docs MCP Server** solves this by providing a personal, always-current knowledge base for your AI. It **indexes 3rd party documentation** from various sources (websites, GitHub, npm, PyPI, local files) and offers powerful, version-aware search tools via the Model Context Protocol (MCP).

This enables your AI agent to access the **latest official documentation**, dramatically improving the quality and reliability of generated code and integration details. It's **free**, **open-source**, runs **locally** for privacy, and integrates seamlessly into your development workflow.

## Why Use the Docs MCP Server?

LLM-assisted coding promises speed and efficiency, but often falls short due to:

- 🌀 **Stale Knowledge:** LLMs train on snapshots of the internet and quickly fall behind new library releases and API changes.
- 👻 **Code Hallucinations:** AI can invent plausible-looking code that is syntactically correct but functionally wrong or uses non-existent APIs.
- ❓ **Version Ambiguity:** Generic answers rarely account for the specific version dependencies in your project, leading to subtle bugs.
- ⏳ **Verification Overhead:** Developers spend valuable time double-checking AI suggestions against official documentation.

**Docs MCP Server solves these problems by:**

- ✅ **Providing Up-to-Date Context:** Fetches and indexes documentation directly from official sources (websites, GitHub, npm, PyPI, local files) on demand.
- 🎯 **Delivering Version-Specific Answers:** Search queries can target exact library versions, ensuring information matches your project's dependencies.
- 💡 **Reducing Hallucinations:** Grounds the LLM in real documentation for accurate examples and integration details.
- ⚡ **Boosting Productivity:** Get trustworthy answers faster, integrated directly into your AI assistant workflow.

## ✨ Key Features

- **Accurate & Version-Aware AI Responses:** Provides up-to-date, version-specific documentation to reduce AI hallucinations and improve code accuracy.
- **Broad Source Compatibility:** Scrapes documentation from websites, GitHub repos, package manager sites (npm, PyPI), and local file directories.
- **Advanced Search & Processing:** Intelligently chunks documentation semantically, generates embeddings, and combines vector similarity with full-text search.
- **Flexible Embedding Models:** Supports various providers including OpenAI (and compatible APIs), Google Gemini/Vertex AI, Azure OpenAI, and AWS Bedrock.
- **Web Interface:** Easy-to-use web interface for searching and managing documentation.
- **Local & Private:** Runs entirely on your machine, ensuring data and queries remain private.
- **Free & Open Source:** Community-driven and freely available.
- **Simple Deployment:** Easy setup via Docker or `npx`.
- **Seamless Integration:** Works with MCP-compatible clients (like Claude, Cline, Roo).

> **What is semantic chunking?**
>
> Semantic chunking splits documentation into meaningful sections based on structure—like headings, code blocks, and tables—rather than arbitrary text size. Docs MCP Server preserves logical boundaries, keeps code and tables intact, and removes navigation clutter from HTML docs. This ensures LLMs receive coherent, context-rich information for more accurate and relevant answers.

## How to Run the Docs MCP Server

Get started quickly:

- [Recommended: Docker (Pre-built Image)](#recommended-docker-pre-built-image)
- [Alternative: npx (Limited Features)](#alternative-npx-limited-features)
- [Advanced: Docker Compose (Scaling)](#advanced-docker-compose-scaling)

## Recommended: Docker (Pre-built Image)

The easiest way to get started is using the pre-built Docker image for simple, single-container usage.

1. **Install Docker.**
2. **Start the server:**

   ```bash
   docker run --rm \
     -e OPENAI_API_KEY="your-openai-api-key" \
     -v docs-mcp-data:/data \
     -p 6280:6280 \
     ghcr.io/arabold/docs-mcp-server:latest \
     --protocol http --port 6280
   ```

   Replace `your-openai-api-key` with your actual OpenAI API key.

3. **Configure your MCP client:**
   Add this to your MCP settings (VS Code, Claude Desktop, etc.). Choose one of the following connection types:

   ```json
   {
     "mcpServers": {
       "docs-mcp-server": {
         "type": "sse",
         "url": "http://localhost:6280/sse",
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

   **Alternative connection types:**

   ```json
   // Streamable HTTP
   "url": "http://localhost:6280/mcp"

   // SSE (Server-Sent Events)
   "url": "http://localhost:6280/sse"
   ```

   Restart your AI assistant after updating the config.

4. **Access the Web Interface:**
   Open `http://localhost:6280` in your browser.

**Benefits:**

- Single command setup with both web UI and MCP server
- Persistent data storage via Docker volume
- No repository cloning required

To stop the server, press `Ctrl+C` or use `docker stop` if running in detached mode (`-d` flag).

### Adding Library Documentation

1. Open the Web Interface at `http://localhost:6280`.
2. Use the "Queue New Scrape Job" form.
3. Enter the documentation URL, library name, and (optionally) version.
4. Click "Queue Job". Monitor progress in the Job Queue.
5. Repeat for each library you want indexed.

Once a job completes, the docs are searchable via your AI assistant or the Web UI.

![Docs MCP Server Web Interface](docs/docs-mcp-server.png)

## Scraping Local Files and Folders

You can index documentation from your local filesystem by using a `file://` URL as the source. This works in both the Web UI and CLI.

**Examples:**

- Web: `https://react.dev/reference/react`
- Local file: `file:///Users/me/docs/index.html`
- Local folder: `file:///Users/me/docs/my-library`

**Requirements:**

- All files with a MIME type of `text/*` are processed. This includes HTML, Markdown, plain text, and source code files such as `.js`, `.ts`, `.tsx`, `.css`, etc. Binary files, PDFs, images, and other non-text formats are ignored.
- You must use the `file://` prefix for local files/folders.
- The path must be accessible to the server process.
- **If running in Docker or Docker Compose:**
  - You must mount the local folder into the container and use the container path in your `file://` URL.
  - Example Docker run:
    ```bash
    docker run --rm \
      -e OPENAI_API_KEY="your-key" \
      -v /absolute/path/to/docs:/docs:ro \
      -v docs-mcp-data:/data \
      ghcr.io/arabold/docs-mcp-server:latest \
      scrape mylib file:///docs/my-library
    ```
  - In the Web UI, enter the path as `file:///docs/my-library` (matching the container path).

See the tooltips in the Web UI and CLI help for more details.

## Alternative: npx (Limited Features)

You can run the Docs MCP Server without installing or cloning the repo, but note that this method **lacks the web interface**.

**For Direct MCP Integration (VS Code, Claude, etc.):**

1. **Configure your MCP client:**
   ```json
   {
     "mcpServers": {
       "docs-mcp-server": {
         "command": "npx",
         "args": ["@arabold/docs-mcp-server@latest"],
         "env": {
           "OPENAI_API_KEY": "sk-proj-..." // Your OpenAI API key
         },
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```
   Replace `sk-proj-...` with your OpenAI API key and restart your application.

**For CLI usage:**

You can run CLI commands directly with npx:

```bash
OPENAI_API_KEY="your-key" npx @arabold/docs-mcp-server@latest <command> [options]
```

Example:

```bash
OPENAI_API_KEY="your-key" npx @arabold/docs-mcp-server@latest list
```

**Note:** Data is stored in a temporary directory and will not persist between runs. For persistent storage and web interface, use the recommended Docker method above.

## Advanced: Docker Compose (Scaling)

For production deployments or when you need to scale processing, use Docker Compose to run separate services.

**Start the services:**

```bash
# Clone the repository (to get docker-compose.yml)
git clone https://github.com/arabold/docs-mcp-server.git
cd docs-mcp-server

# Set your environment variables
export OPENAI_API_KEY="your-key-here"

# Start all services
docker compose up -d

# Scale workers if needed
docker compose up -d --scale worker=3
```

**Service architecture:**

- **Worker** (port 8080): Handles documentation processing jobs
- **MCP Server** (port 6280): Provides `/sse` endpoint for AI tools
- **Web Interface** (port 6281): Browser-based management interface

**Configure your MCP client:**

```json
{
  "mcpServers": {
    "docs-mcp-server": {
      "url": "http://localhost:6280/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Alternative connection types:**

```json
// HTTP (Streamable) - Recommended
"url": "http://localhost:6280/mcp"

// SSE (Server-Sent Events)
"url": "http://localhost:6280/sse"

// stdio (Command line)
"command": ["npx", "@arabold/docs-mcp-server", "--protocol", "stdio"]
```

**Access interfaces:**

- Web Interface: `http://localhost:6281`
- MCP Endpoint (HTTP): `http://localhost:6280/mcp`
- MCP Endpoint (SSE): `http://localhost:6280/sse`

This architecture allows independent scaling of processing (workers) and user interfaces.

## Configuration

The Docs MCP Server is configured via environment variables. Set these in your shell, Docker, or MCP client config.

| Variable                           | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `DOCS_MCP_EMBEDDING_MODEL`         | Embedding model to use (see below for options).       |
| `OPENAI_API_KEY`                   | OpenAI API key for embeddings.                        |
| `OPENAI_API_BASE`                  | Custom OpenAI-compatible API endpoint (e.g., Ollama). |
| `GOOGLE_API_KEY`                   | Google API key for Gemini embeddings.                 |
| `GOOGLE_APPLICATION_CREDENTIALS`   | Path to Google service account JSON for Vertex AI.    |
| `AWS_ACCESS_KEY_ID`                | AWS key for Bedrock embeddings.                       |
| `AWS_SECRET_ACCESS_KEY`            | AWS secret for Bedrock embeddings.                    |
| `AWS_REGION`                       | AWS region for Bedrock.                               |
| `AZURE_OPENAI_API_KEY`             | Azure OpenAI API key.                                 |
| `AZURE_OPENAI_API_INSTANCE_NAME`   | Azure OpenAI instance name.                           |
| `AZURE_OPENAI_API_DEPLOYMENT_NAME` | Azure OpenAI deployment name.                         |
| `AZURE_OPENAI_API_VERSION`         | Azure OpenAI API version.                             |
| `DOCS_MCP_DATA_DIR`                | Data directory (default: `./data`).                   |
| `DOCS_MCP_PORT`                    | Server port (default: `6281`).                        |

See [examples above](#alternative-using-docker) for usage.

### Embedding Model Options

Set `DOCS_MCP_EMBEDDING_MODEL` to one of:

- `text-embedding-3-small` (default, OpenAI)
- `openai:llama2` (OpenAI-compatible, Ollama)
- `vertex:text-embedding-004` (Google Vertex AI)
- `gemini:embedding-001` (Google Gemini)
- `aws:amazon.titan-embed-text-v1` (AWS Bedrock)
- `microsoft:text-embedding-ada-002` (Azure OpenAI)
- Or any OpenAI-compatible model name

### Provider-Specific Configuration Examples

Here are complete configuration examples for different embedding providers:

**OpenAI (Default):**

```bash
docker run --rm \
  -e OPENAI_API_KEY="sk-proj-your-openai-api-key" \
  -e DOCS_MCP_EMBEDDING_MODEL="text-embedding-3-small" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**Ollama (Local):**

```bash
docker run --rm \
  -e OPENAI_API_KEY="ollama" \
  -e OPENAI_API_BASE="http://host.docker.internal:11434/v1" \
  -e DOCS_MCP_EMBEDDING_MODEL="nomic-embed-text" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**LM Studio (Local):**

```bash
docker run --rm \
  -e OPENAI_API_KEY="lmstudio" \
  -e OPENAI_API_BASE="http://host.docker.internal:1234/v1" \
  -e DOCS_MCP_EMBEDDING_MODEL="text-embedding-qwen3-embedding-4b" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**Google Gemini:**

```bash
docker run --rm \
  -e GOOGLE_API_KEY="your-google-api-key" \
  -e DOCS_MCP_EMBEDDING_MODEL="gemini:embedding-001" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**Google Vertex AI:**

```bash
# Mount your service account JSON file
docker run --rm \
  -e GOOGLE_APPLICATION_CREDENTIALS="/app/gcp-key.json" \
  -e DOCS_MCP_EMBEDDING_MODEL="vertex:text-embedding-004" \
  -v /path/to/your/gcp-service-account.json:/app/gcp-key.json:ro \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**AWS Bedrock:**

```bash
docker run --rm \
  -e AWS_ACCESS_KEY_ID="your-aws-access-key-id" \
  -e AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key" \
  -e AWS_REGION="us-east-1" \
  -e DOCS_MCP_EMBEDDING_MODEL="aws:amazon.titan-embed-text-v1" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

**Azure OpenAI:**

```bash
docker run --rm \
  -e AZURE_OPENAI_API_KEY="your-azure-openai-api-key" \
  -e AZURE_OPENAI_API_INSTANCE_NAME="your-instance-name" \
  -e AZURE_OPENAI_API_DEPLOYMENT_NAME="your-deployment-name" \
  -e AZURE_OPENAI_API_VERSION="2024-02-01" \
  -e DOCS_MCP_EMBEDDING_MODEL="microsoft:text-embedding-ada-002" \
  -v docs-mcp-data:/data \
  -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest \
  --protocol http --port 6280
```

> **Note for Local APIs (Ollama, LM Studio):** When running in Docker, use `host.docker.internal` instead of `localhost` to access services running on your host machine.

For more architectural details, see the [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

To develop or contribute to the Docs MCP Server:

- Fork the repository and create a feature branch.
- Follow the code conventions in [ARCHITECTURE.md](ARCHITECTURE.md).
- Write clear commit messages (see Git guidelines above).
- Open a pull request with a clear description of your changes.

For questions or suggestions, open an issue.

### Architecture

For details on the project's architecture and design principles, please see [ARCHITECTURE.md](ARCHITECTURE.md).

_Notably, the vast majority of this project's code was generated by the AI assistant Cline, leveraging the capabilities of this very MCP server._

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
