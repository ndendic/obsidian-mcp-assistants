// Type definitions for LangChain and MCP libraries
// These are simplified to make the build work

declare module "@langchain/mcp-adapters" {
  export class MultiServerMCPClient {
    constructor(config: any);
    getTools(): Promise<any[]>;
    close(): Promise<void>;
  }
}

declare module "@langchain/anthropic" {
  export class ChatAnthropic {
    constructor(options: any);
    invoke(messages: any[]): Promise<any>;
    bindTools(tools: any[]): ChatAnthropic;
  }
}

declare module "@langchain/langgraph" {
  export class StateGraph {
    constructor(annotation: any);
    addNode(name: string, func: Function): this;
    addEdge(start: string, end: string): this;
    addConditionalEdges(start: string, condition: Function, routes: Record<string, string>): this;
    compile(): any;
  }

  export class MessagesAnnotation {
    static inputKeys: string[];
    static outputKeys: string[];
  }
}

declare module "@langchain/langgraph/prebuilt" {
  export class ToolNode {
    constructor(tools: any[]);
  }
  
  export function createReactAgent(options: any): any;
}

declare module "@langchain/core/messages" {
  export function isAIMessage(message: any): boolean;
} 