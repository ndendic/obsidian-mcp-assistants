import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import * as dotenv from 'dotenv';
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { isAIMessage } from "@langchain/core/messages";

// Load environment variables from .env file
dotenv.config();

// First check if ANTHROPIC_API_KEY is set
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("Please set your ANTHROPIC_API_KEY environment variable");
  process.exit(1);
}

// Setup the MCP client
const client = new MultiServerMCPClient({
  mcpServers: {    
      "filesystem": {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
                  "transport": "stdio"
                },
      "sequential-thinking": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-sequential-thinking"
            ],
            "transport": "stdio"
          },      
  }
});

// Create the LLM
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "gemini-2.0-flash"
});

// Get tools from MCP client
const runGraph = async () => {
  // Get tools from the MCP client
  const tools = await client.getTools();
  
  // Create a tool node to handle tool execution
  const toolNode = new ToolNode(tools);
  
  // Bind the tools to the model
  const modelWithTools = llm.bindTools(tools);
  
  // Define the function to determine whether to continue or use tools
  const shouldContinue = async (state) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    
    // If the LLM makes a tool call, route to the "tools" node
    if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
      return "tools";
    }
    // Otherwise, stop (reply to the user)
    return "__end__";
  };
  
  // Define the function that calls the model
  const callModel = async (state) => {
    const { messages } = state;
    const response = await modelWithTools.invoke(messages);
    return { messages: [response] };
  };
  
  // Create the graph
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      __end__: "__end__",
    })
    .addEdge("tools", "agent")
    .compile();
  
  // Run the workflow with our query
  const response = await workflow.invoke({
    messages: [{ role: "user", content: "which files are in the root allowed directory?" }]
  });
  
  console.log(JSON.stringify(response, null, 2));
  
  // Close the client when done
  await client.close();
};

// Run the graph
runGraph().catch(console.error);