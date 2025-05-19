// Langgraph.ts
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { isAIMessage, AIMessage, AIMessageChunk, SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { MCPAssistantSettings } from './Settings';
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import { ChatXAI } from "@langchain/xai";
import { ChatDeepSeek } from "@langchain/deepseek";
import { App, FileSystemAdapter } from "obsidian";
import { readFileTool, upsertNoteTool,deleteFileTool, getVaultPathTool, listByTagTool, getActiveNoteTool,simpleSearchTool, getVaultStructureTool } from './tools';

// Function to sanitize tool schemas specifically for Google Generative AI
function sanitizeSchemaForGoogle(schema: any, parentKey?: string): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(item => sanitizeSchemaForGoogle(item, parentKey));
  }

  const newSchema: any = {};

  // Handle schema composition keywords first by sanitizing their subschemas
  // and placing them into newSchema. The main loop will handle other keys.
  for (const keyword of ['anyOf', 'allOf', 'oneOf']) {
    if (schema.hasOwnProperty(keyword)) {
      if (Array.isArray(schema[keyword])) {
        newSchema[keyword] = schema[keyword].map((subSchema: any) => sanitizeSchemaForGoogle(subSchema, `${keyword}_item`));
      } else {
        // This case (non-array content for composition keywords) is unlikely for valid JSON Schema
        // but sanitize it recursively if encountered.
        newSchema[keyword] = sanitizeSchemaForGoogle(schema[keyword], `${keyword}_item`);
      }
    }
  }

  // Process other keys
  let originalType = schema.type; // Store original type if needed for format check later
  let hasEnum = false; // Track if an enum has been processed for this schema level

  // Handle 'enum' specifically as it dictates the 'type' must be 'string' for Google
  if (schema.hasOwnProperty('enum') && Array.isArray(schema.enum)) {
    hasEnum = true;
    newSchema.type = 'string'; // Google: "enum: only allowed for STRING type"
    newSchema.enum = schema.enum.map((val: any) => String(val));
  } else if (schema.hasOwnProperty('type')) {
    // Only set 'type' if not already set by 'enum' logic (which forces 'string')
    if (!newSchema.hasOwnProperty('type')) {
        newSchema.type = schema.type;
    }
  }

  // Iterate over all keys in the original schema
  for (const key in schema) {
    // Skip keys that were already handled by specific keyword logic (composition, enum, type)
    if (key === 'type' || key === 'enum' || key === 'anyOf' || key === 'allOf' || key === 'oneOf') {
      continue;
    }

    // Explicitly remove/skip unsupported validation keywords
    if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
      // console.warn(`[Sanitize] Removing '${key}' from ${parentKey || 'schema'}'s child '${key}'`);
      continue;
    }

    // Handle 'format' with specific logic
    if (key === 'format') {
      const typeForFormatCheck = newSchema.type || originalType; // Use type from newSchema if set, else original
      if (typeForFormatCheck === 'string') {
        // For strings, Google seems to primarily support 'date-time'.
        // Depending on strictness, one might allow others or none.
        // Based on previous logic, only 'date-time' was explicitly kept for strings.
        if (schema[key] === 'date-time') {
          newSchema[key] = schema[key];
        }
        // Other string formats are implicitly dropped if not 'date-time'
      } else {
        // For non-string types, or if type is not yet determined, keep the format.
        newSchema[key] = schema[key];
      }
      continue; // 'format' has been handled
    }
    
    // Default recursive sanitization for all other properties
    newSchema[key] = sanitizeSchemaForGoogle(schema[key], key);
  }
  
  // If, after all processing, newSchema has properties but no type, and wasn't an enum, assume 'object'
  // This helps ensure objects that are purely defined by 'properties' get a 'type: "object"'
  if (!newSchema.hasOwnProperty('type') && newSchema.hasOwnProperty('properties') && !hasEnum) {
    newSchema.type = 'object';
  }

  return newSchema;
}

function sanitizeToolsForGoogle(tools: any[]): any[] {
  if (!tools || tools.length === 0) return [];
  return tools.map(tool => {
    const newTool = { ...tool }; 
    if (newTool.parameters && typeof newTool.parameters === 'object') {
        newTool.parameters = sanitizeSchemaForGoogle(newTool.parameters, newTool.name || 'tool_parameters');
    } else if (newTool.schema && typeof newTool.schema === 'object') {
        newTool.schema = sanitizeSchemaForGoogle(newTool.schema, newTool.name || 'tool_schema');
    } 
    return newTool; 
  });
}

function getChatModel(config: any) {
  const opts: any = { apiKey: config.apiKey, model: config.model, temperature: config.temperature ?? 0.7, ...config.customOptions };
  if (config.endpointUrl) opts.baseURL = config.endpointUrl;
  switch (config.provider) {
    case "openai": return new ChatOpenAI(opts);
    case "anthropic": return new ChatAnthropic(opts);
    case "google-genai": return new ChatGoogleGenerativeAI(opts);
    case "groq": return new ChatGroq(opts);
    case "mistral": return new ChatMistralAI(opts);
    case "ollama": return new ChatOllama(opts);
    case "xai": return new ChatXAI(opts);
    case "deepseek": return new ChatDeepSeek(opts);
    default: throw new Error("Unsupported provider: " + config.provider);
  }
}

export class LanggraphAgent {
  client: MultiServerMCPClient | null = null;
  workflow: any = null;
  settings: MCPAssistantSettings;
  app: App;
  private localTools: any[] = [];
  private mcpTools: any[] = [];

  constructor(settings: MCPAssistantSettings, app: App) {
    this.settings = settings;
    this.app = app;
  }

  async initializeMCP() {
    let mcpConfig: Record<string, any> = {};

    // 1. Add predefined Memory Server if enabled
    if (this.settings.useMemoryServer) {
      const adapter = this.app.vault.adapter;
      let memoryFilePath = "";
      if (adapter instanceof FileSystemAdapter) {
        let rawPath = `${adapter.getBasePath()}/${this.app.vault.configDir}/plugins/obsidian-mcp-assistant/memory.json`;
        memoryFilePath = rawPath.replace(/\\/g, '/');
        // console.log("[Langgraph.initializeMCP] Adding Memory Server. Normalized Path:", memoryFilePath);
      } else {
        console.warn("[Langgraph.initializeMCP] Vault adapter is not FileSystemAdapter. Cannot determine absolute path for memory.json. Memory server might not work as expected if it requires an absolute path.");
        memoryFilePath = `${this.app.vault.configDir}/plugins/obsidian-mcp-assistant/memory.json`.replace(/\\/g, '/');
      }

      if (memoryFilePath) {
        mcpConfig["memory"] = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
          env: {
            MEMORY_FILE_PATH: memoryFilePath,
          },
          transport: "stdio" // Assuming stdio, as it's common
        };
      } else {
        console.error("[Langgraph.initializeMCP] Could not determine memoryFilePath. Memory server not configured.");
      }
    }

    // 2. Merge custom MCP configuration if enabled
    // This will override the predefined memory server if a "memory" key exists in customServerConfig
    if (this.settings.useCustomConfig) {
      try {
        const customConfig = JSON.parse(this.settings.customServerConfig);
        mcpConfig = { ...mcpConfig, ...customConfig }; // Merge, custom overrides predefined
        // console.log("[Langgraph.initializeMCP] Merged custom MCP config:", customConfig);
      } catch (e) {
        console.error("[Langgraph.initializeMCP] Failed to parse custom MCP config:", e);
        // If custom config is enabled but invalid, we don't fall back to any default servers.
        // mcpConfig might still contain the memory server if it was enabled.
      }
    } // Removed the old default filesystem server logic here
    
    // Initialize MCP client only if there's some configuration
    if (Object.keys(mcpConfig).length > 0) {
      // console.log("[Langgraph.initializeMCP] Initializing MCP with config:", mcpConfig);
      this.client = new MultiServerMCPClient(mcpConfig);
      await this.client.initializeConnections();
    }
    
    // Initialize local tools based on enabled settings
    this.localTools = [];
    
    // Only add tools that are enabled in settings
    if (this.settings.enabledTools.read_file) this.localTools.push(readFileTool(this.app));    
    if (this.settings.enabledTools.upsert_note) this.localTools.push(upsertNoteTool(this.app));
    if (this.settings.enabledTools.delete_file) this.localTools.push(deleteFileTool(this.app));    
    if (this.settings.enabledTools.list_files_by_tag) this.localTools.push(listByTagTool(this.app));
    if (this.settings.enabledTools.get_active_note) this.localTools.push(getActiveNoteTool(this.app));
    if (this.settings.enabledTools.get_vault_path) this.localTools.push(getVaultPathTool(this.app));
    if (this.settings.enabledTools.simple_search) this.localTools.push(simpleSearchTool(this.app));
    if (this.settings.enabledTools.get_vault_structure) this.localTools.push(getVaultStructureTool(this.app));
    
    try {
        this.mcpTools = await this.client.getTools();
    } catch (e) {
        console.error("[Langgraph.initializeMCP] Failed to get MCP tools:", e);
        this.mcpTools = []; 
    }
    
    const allPluginTools = [...this.localTools, ...this.mcpTools];
    // console.log(`[Langgraph.initializeMCP] Initialized with ${this.localTools.length} local tools and ${this.mcpTools.length} MCP tools. Total: ${allPluginTools.length}`);

    const toolNode = new ToolNode(allPluginTools); 
    const memorySaver = new MemorySaver();
    const shouldContinue = async (state: any) => {
      const { messages } = state;
      const lastMessage = messages[messages.length - 1];
      if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) return "tools";
      return "__end__";
    };

    const callModel = async (state: any, config: any) => {
      const { messages } = state;
      const agentId = config?.configurable?.agent_id;
      let activeModelConfig: any;
      let activeSystemPrompt: string | undefined;

      if (agentId) {
        const agentConfig = this.settings.agents.find(a => a.id === agentId);
        if (agentConfig) {
          activeModelConfig = this.settings.models.find(m => m.id === agentConfig.modelId);
          activeSystemPrompt = agentConfig.systemPrompt;
        }
      }
      if (!activeModelConfig) {
        activeModelConfig = this.settings.models.find(m => m.id === this.settings.defaultModelId);
        if (!activeModelConfig && this.settings.models.length > 0) activeModelConfig = this.settings.models[0];
      }
      if (!activeSystemPrompt) activeSystemPrompt = this.settings.systemPrompt;
      if (!activeModelConfig) {
        console.error("[Langgraph.callModel] No valid model config. Using fallback.");
        activeModelConfig = { provider: "openai", model: "gpt-4o", apiKey: this.settings.apiKeys["openai"], temperature: 0.7 };
        activeSystemPrompt = activeSystemPrompt || "You are a helpful assistant.";
      }
      let llm;
      try { llm = getChatModel(activeModelConfig); }
      catch (e) { 
        console.error("Error creating chat model, falling back:", e); 
        llm = new ChatOpenAI({ apiKey: this.settings.apiKeys["openai"], model: "gpt-4o", temperature: 0.7 });
      }

      let toolsToBind: any[];
      if (activeModelConfig.provider === "google-genai") {
        // console.log("[Langgraph.callModel] Sanitizing MCP tools and combining with local tools for Google Generative AI.");
        const sanitizedMcpTools = sanitizeToolsForGoogle(this.mcpTools);
        const sanitizedLocalTools = sanitizeToolsForGoogle(this.localTools); // Sanitize local tools
        toolsToBind = [...sanitizedLocalTools, ...sanitizedMcpTools]; 
        console.log("[Langgraph.ts] Tools to bind for Google (sanitized):", JSON.stringify(toolsToBind, null, 2));
      } else {
        toolsToBind = [...this.localTools, ...this.mcpTools]; 
      }

      const modelWithTools = llm.bindTools(toolsToBind);
      const historyMessages = messages.filter((msg: any) => msg._getType() !== 'system');
      const messagesForThisTurn = [ new SystemMessage({ content: activeSystemPrompt || "Fallback: You are helpful." }), ...historyMessages ];
      // console.log("[Langgraph.callModel] Streaming from LLM for agentId:", agentId, "with model:", activeModelConfig?.model);

      let responseAIMessage: AIMessage;
      try {
        const llmStream = await modelWithTools.stream(messagesForThisTurn);
        let accumulatedChunkAnnotation: AIMessageChunk | null = null;
        const toolCallChunksList: any[] = [];
        let responseId: string | undefined, responseName: string | undefined, usageMetadata: any = null, responseMetadata: any = null;
        let firstChunkProcessed = false;
        for await (const chunk of llmStream) { 
          if (!firstChunkProcessed) { responseId = chunk.id; if (chunk.name) responseName = chunk.name; firstChunkProcessed = true; }
          if (!accumulatedChunkAnnotation) { accumulatedChunkAnnotation = chunk; } else { accumulatedChunkAnnotation = accumulatedChunkAnnotation.concat(chunk); }
          if (Array.isArray(chunk.tool_call_chunks)) { toolCallChunksList.push(...chunk.tool_call_chunks); }
          if (chunk.usage_metadata) usageMetadata = chunk.usage_metadata;
          if (chunk.response_metadata) responseMetadata = chunk.response_metadata;
        }
        const finalToolCalls: any[] = []; 
        if (toolCallChunksList.length > 0) {
            const chunksByToolCallIndex = toolCallChunksList.reduce((acc, toolCallChunk) => {
                const index = toolCallChunk?.index; if (typeof index !== 'number') { return acc; } 
                acc[index] = acc[index] || []; acc[index].push(toolCallChunk); return acc;
            }, {} as Record<number, any[]>);
            for (const indexKey in chunksByToolCallIndex) {
                const toolCallIndex = parseInt(indexKey, 10);
                const chunksForThisToolCall = chunksByToolCallIndex[toolCallIndex];
                let name: string | undefined, id: string | undefined, argsString = "";
                for (const tc_chunk of chunksForThisToolCall) {
                    if (tc_chunk.name && !name) name = tc_chunk.name; if (tc_chunk.id && !id) id = tc_chunk.id; 
                    if (typeof tc_chunk.args === 'string') argsString += tc_chunk.args;
                }
                if (name && id) { 
                    let parsedArgs = {}; try { parsedArgs = JSON.parse(argsString || "{}"); } 
                    catch (e) { parsedArgs = { _raw_args: argsString }; console.warn(`[L] Failed to parse tool args for ${name}: ${argsString}`); }
                    finalToolCalls.push({ name: name, args: parsedArgs, id: id, type: "tool_call" });
                } else { console.warn(`[L] Skipping tool call assembly: missing name/id. Index: ${toolCallIndex}`); }
            }
        }
        const finalContent = accumulatedChunkAnnotation ? accumulatedChunkAnnotation.content : "";
        responseAIMessage = new AIMessage({
            content: finalContent, tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
            id: responseId, name: responseName, usage_metadata: accumulatedChunkAnnotation?.usage_metadata || usageMetadata,
            response_metadata: accumulatedChunkAnnotation?.response_metadata || responseMetadata,
            additional_kwargs: accumulatedChunkAnnotation?.additional_kwargs || {},
        });
        // console.log("[Langgraph.callModel] Reconstructed AIMessage:", responseAIMessage);
      } catch (e: any) {
        console.error("[Langgraph.callModel] Error LLM stream/reconstruction:", e);
        responseAIMessage = new AIMessage({ content: "Error: " + e.message });
      }
      return { messages: [...messages, responseAIMessage] };
    };
    const graph = new StateGraph(MessagesAnnotation)
      .addNode("agent", callModel).addNode("tools", toolNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue, { tools: "tools", __end__: "__end__" })
      .addEdge("tools", "agent");
    this.workflow = graph.compile({ checkpointer: memorySaver });
  }

  async runQuery(messages: any[], conversationId: string, agentId?: string) {
    const config: { configurable: { thread_id: string; agent_id?: string } } = {
      configurable: { thread_id: conversationId }
    };
    if (agentId) {
      config.configurable.agent_id = agentId;
    }
    return await this.workflow.invoke({ messages: messages }, config);
  }

  async clearConversationState(conversationId: string) {
    if (!this.workflow) return;
    if (typeof this.workflow.delete === 'function') {
      await this.workflow.delete({ configurable: { thread_id: conversationId } });
    }
  }

  async initializeConversationState(conversationId: string, messages: any[], systemPrompt: string, skipApiCall: boolean = false) {
    if (!this.workflow) return;
    await this.clearConversationState(conversationId);
    
    if (skipApiCall) return;

    if (systemPrompt) {
      const systemMessage = new SystemMessage({ content: systemPrompt });
      
      const llmMessages = messages
        .filter(msg => msg.role !== 'system' && !msg.isLoading)
        .map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }));
      
      const messagesToPrime = [systemMessage, ...llmMessages];
      
      if (messagesToPrime.length > 0) { 
        // console.log("[Langgraph.ts] Priming memory for", conversationId, "with messages count:", messagesToPrime.length);
        await this.workflow.invoke(
          { messages: messagesToPrime },
          {
            configurable: { thread_id: conversationId },
            interrupt_before: ["agent"] 
          }
        );
      } else {
        // console.log("[Langgraph.ts] Skipping memory priming for", conversationId, "as there are no messages to prime.");
      }
    }
  }
} 