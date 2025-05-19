# 🤖 MCP Assistants for Obsidian 🧠

**Your intelligent, file-aware AI companion, seamlessly integrated into Obsidian!**

MCP Assistant brings the power of advanced language models directly into your Obsidian vault, enhanced by the **Model Context Protocol (MCP)**. This allows your AI assistant to not only chat but also securely interact with your local files, understand your notes, and become a true second brain.

[![Obsidian Target Version](https://img.shields.io/badge/Obsidian-1.0.0%2B-blueviolet)](https://obsidian.md)
_Inspired by the desire for a deeply integrated AI that respects local data and offers unparalleled flexibility._

---

## ✨ Features

*   💬 **Advanced Chat Interface**:
    *   Engage in multiple, switchable conversations.
    *   Edit conversation titles (double-click!) or let them be auto-generated.
    *   Clean, modern UI with Markdown rendering and code syntax highlighting.
    *   Text selection and copy-pasting from chat messages.
    *   Timestamps for all messages.
    *   Graceful handling of long-running responses with a "Cancel" option.
*   🔌 **Flexible Model Configuration**:
    *   Connect to a wide array of LLM providers: OpenAI, Anthropic, Google Gemini, Ollama (for local models!), and more.
    *   Define multiple model configurations with custom labels, API keys (provider-level or model-specific), endpoints, temperature, and other advanced JSON options.
    *   Set a global default model for quick access.
*   🤖 **Customizable Agents**:
    *   Create specialized "Agents" with unique system prompts and assigned models.
    *   Easily invoke agents in chat using `@agent_handle` syntax.
    *   Agent suggester pops up as you type `@` to help you find the right assistant.
*   📝 **Seamless Note Integration**:
    *   Link to your Obsidian notes directly within the chat input using `[[note_name]]` syntax.
    *   Smart suggestions for notes appear as you type, prioritizing note titles over full paths.
    *   Inserted links use the standard Obsidian format (`[[path/to/note.md|Note Title]]`).
*   📂 **Powerful MCP Integration (Model Context Protocol)**:
    *   Unlock your AI's full potential by allowing it to securely interact with your local vault and beyond through the Model Context Protocol.
    *   **Built-in Toolkit**: The default MCP filesystem server comes equipped with a range of powerful tools enabling the AI to:
        *   `read_file`: Read the content of specific notes.
        *   `upsert_note`: Create new notes or update existing ones, even targeting specific sections.
        *   `delete_file`: Remove notes from your vault.
        *   `simple_search`: Perform plain-text searches across all your notes.
        *   `list_files_by_tag`: Find notes associated with specific tags.
        *   `get_active_note`: Access the content of the currently open note.
        *   `get_vault_path`: Retrieve the absolute path to your vault (desktop only).
        *   `get_vault_structure`: List files and folders to understand your vault's organization.
    *   **Extensible & Customizable**: Advanced users can define custom MCP server configurations using JSON. This allows connection to specialized external tools, private data sources, or any custom service that speaks MCP, making your assistant truly tailored to your workflow.
    *   This protocol is key to features like summarizing documents, answering questions based on your notes, drafting content, and performing complex, multi-step operations that involve your local data.
---

## 🚀 Getting Started

1.  **Installation**:
    *   Once published, MCP Assistant will be available in the Obsidian Community Plugins list. Search for "MCP Assistant" and click "Install," then "Enable."
    *   (For manual installation: Download `main.js`, `styles.css`, and `manifest.json` from the latest release. Create a folder named `mcp-assistant` in your vault's `.obsidian/plugins/` directory. Place the downloaded files into this folder. Then, go to Obsidian Settings > Community Plugins, and enable "MCP Assistant".)
2.  **Initial Configuration**:
    *   Navigate to **Settings > MCP Assistant**.
    *   **API Keys Tab**: Add API keys for the AI providers you intend to use.
    *   **Models Tab**:
        *   Click "Add Model" to configure your first AI model. Select the provider, enter the model ID (e.g., `gpt-4o`, `claude-3-sonnet-20240229`), and provide its API key (or leave blank to use the global provider key).
        *   Set one of your configured models as the "Default Model."
    *   **MCP Tab**: For basic local file access, ensure "Use Default Filesystem Server" is enabled (it is by default).
3.  **Open the Chat View**:
    *   Click the "message-square-heart" icon in the Obsidian ribbon (usually on the left sidebar).
    *   This will open the MCP Assistant chat panel.

---

## 🔧 Configuration Deep Dive

The settings panel is designed to give you full control over your AI assistant.
It's generally recommended to configure API Keys and Models before setting up Agents that rely on them.

*   ### General
    *   **System Prompt**: Define the base instructions and persona for your default assistant. This prompt is sent with every conversation unless overridden by an Agent.
    *   **Chat History Settings**:
        *   *Maximum Conversations*: Control how many past conversations are stored. Older ones are automatically pruned.
        *   *Clear All Conversations*: Permanently delete all conversation history.
    *   **Default Model**: Select one of your configured models to be used by default when no specific agent is invoked.
*   ### API Keys
    *   Enter API keys for each provider you want to use (e.g., OpenAI, Anthropic). These keys are stored locally in your Obsidian configuration.
    *   Use the "Reveal" button to temporarily show a key.
*   ### Models
    *   This is where you define the specific LLMs your assistant can use.
    *   **Add Model**:
        *   *Label*: A friendly name for you to identify this model (e.g., "My Speedy GPT-3.5").
        *   *Provider*: Select from the dropdown (OpenAI, Anthropic, etc.).
        *   *Model ID/Name*: The official model identifier from the provider (e.g., `gpt-3.5-turbo`, `claude-2.1`).
        *   *API Key (optional)*: If this specific model needs a different API key than the one set in the "API Keys" tab for its provider, enter it here.
        *   *Endpoint URL (optional)*: For self-hosted models (like Ollama) or proxies.
        *   *Temperature (optional)*: Control randomness (e.g., 0.7).
        *   *Custom LLM Options (JSON, optional)*: Advanced parameters like `max_tokens`, `top_p`.
*   ### MCP (Model Context Protocol)
    *   **Use Default Filesystem Server**: (Recommended for most users) Enables a built-in server that grants the LLM access to a powerful suite of tools for interacting with your vault's files (e.g., reading, writing, searching, listing by tag, getting vault structure). This is the simplest way to make your assistant file-aware.
    *   **Use Custom Server Configuration**: For advanced users or developers. This option allows you to define connections to any number of external MCP-compliant servers. Provide a JSON configuration to specify how the plugin should connect to and use these servers. This is ideal for:
        *   Integrating specialized tools (e.g., scientific computation, financial data lookup).
        *   Connecting to private or proprietary data sources and APIs.
        *   Orchestrating complex workflows that go beyond standard file operations.
        *   If enabled, this custom configuration will override the default filesystem server. You can, however, include a configuration for `@modelcontext/server-filesystem` within your custom JSON if you still want its functionality alongside other custom servers.
        *   *Example Custom JSON Structure (conceptual)*:
            ```json
            {
              "my_custom_tool_server": {
                "command": "node",
                "args": ["/path/to/my/custom/mcp-server.js"],
                "env": {
                  "API_KEY_FOR_CUSTOM_SERVICE": "your_key_here"
                }
              },
              "another_service": {
                "transport": "stdio", // or "http"
                "command": "python",
                "args": ["-m", "my_mcp_service_module"],
                "env": {}
              }
            }
            ```
*   ### Agents
    *   Create specialized assistants!
    *   **Add Agent**:
        *   *Name*: A display name for the agent (e.g., "Creative Writer", "Code Helper").
        *   *Handle*: A short, unique identifier used to invoke the agent (e.g., `writer`, `coder`). You'll use `@handle` in chat.
        *   *Model*: Select one of your configured models from the "Models" tab.
        *   *System Prompt*: Give this agent specific instructions, a persona, or context that differs from the global system prompt.

---

## 💬 How to Use MCP Assistant

*   **Open the Chat View**: Click the ribbon icon.
*   **Start Chatting**: Type your queries in the input field and press Enter or click the send icon.
*   **Use Agents**: Type `@` followed by the agent's handle (e.g., `@coder summarize this code...`). Suggestions will appear as you type.
*   **Link Notes**: Type `[[` and start typing a note name. Select from the suggestions to insert a link like `[[path/to/note|Note Title]]`.
*   **Manage Conversations**:
    *   Click the current conversation title at the top of the chat view to open a dropdown menu.
    *   Select a past conversation to switch to it.
    *   Delete conversations using the trash icon next to each title in the dropdown (only available if more than one conversation exists).
    *   Start a new chat using the "message-circle-plus" icon in the header.
    *   Double-click the current conversation title to rename it.

---

## 💡 Tips & Tricks

*   Combine agents and note links for powerful contextual queries: `@research_assistant summarize the key points in [[My Important Meeting Notes.md]]`.
*   If you use local models via Ollama, configure an "Ollama" provider model in settings and point the endpoint to your Ollama server (e.g., `http://localhost:11434/v1`).
*   Regularly review and refine your global system prompt and agent-specific prompts for better AI responses.

---

## 🤝 Contributing

This plugin is open source and contributions are welcome! If you have ideas, bug reports, or want to contribute code, please visit the GitHub repository:
[https://github.com/ndendic/obsidian-mcp-assistant](https://github.com/ndendic/obsidian-mcp-assistant)

---

## 📄 License

This plugin is released under the [MIT License](LICENSE.md).

---

Enjoy your supercharged Obsidian experience with MCP Assistants! 🎉 