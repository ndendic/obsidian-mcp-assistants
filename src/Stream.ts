import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";

// Helper function to robustly extract string content from various message content formats
function extractStringContent(messageContent: any): string {
    if (typeof messageContent === 'string') {
        return messageContent;
    }
    if (Array.isArray(messageContent)) {
        let textContent = "";
        for (const block of messageContent) {
            if (block.type === 'text' && typeof block.text === 'string') {
                textContent += block.text;
            } else if (typeof block === 'string') { 
                textContent += block;
            }
        }
        return textContent;
    }
    if (messageContent && typeof messageContent.content === 'string') {
        return messageContent.content;
    }
    if (messageContent && Array.isArray(messageContent.content)) {
        return extractStringContent(messageContent.content); 
    }
    if (messageContent && messageContent.kwargs && typeof messageContent.kwargs.content === 'string') {
        return messageContent.kwargs.content;
    }
    if (messageContent && messageContent.kwargs && Array.isArray(messageContent.kwargs.content)) {
        return extractStringContent(messageContent.kwargs.content); 
    }
    // console.warn("[Stream.ts] Unknown message content structure for extraction:", messageContent);
    return ""; 
}

export async function streamQuery(
  workflow: any, 
  messages: any[], 
  conversationId: string, 
  agentId: string | undefined, 
  callback: (eventData: any, isComplete: boolean) => void
) {
  const streamConfig: { configurable: { thread_id: string; agent_id?: string }, version?: string } = {
    configurable: { thread_id: conversationId },
    version: "v2"
  };

  if (agentId) {
    streamConfig.configurable.agent_id = agentId;
  }

  let accumulatedTokensForFinalFallback = ""; 

  // console.log("[Stream.ts] Starting streamQuery with streamEvents v2"); // Optional: uncomment for debugging start

  try {
    const stream = await workflow.streamEvents(
      { messages: messages }, 
      streamConfig
    );

    for await (const event of stream) {
      // console.log("[Stream.ts RAW EVENT]", JSON.stringify(event, null, 2)); // Optional: uncomment for debugging raw events

      if (event.event === "on_chat_model_stream") {
        const chunkContent = event.data?.chunk?.content;
        const token = extractStringContent(chunkContent); 
        if (token.length > 0) {
          accumulatedTokensForFinalFallback += token;
          callback({ type: "token", content: token, name: event.name }, false);
        }
      } else if (event.event === "on_tool_start") {
        callback({ 
          type: "tool_start", 
          toolCallId: event.data.id,
          name: event.data.name,
          input: event.data.input,
          nodeName: event.name
        }, false);
      } else if (event.event === "on_tool_end") {
        callback({ 
          type: "tool_end", 
          toolCallId: event.data.id,
          name: event.data.name,
          output: event.data.output,
          nodeName: event.name
        }, false);
      } else if (event.event === "on_chain_end" && event.name === "LangGraph") {
        let finalContent = "";
        const outputMessages = event.data.output?.messages;
        if (outputMessages && Array.isArray(outputMessages) && outputMessages.length > 0) {
            const lastMessage = outputMessages[outputMessages.length - 1];
            if (lastMessage) {
                const contentSource = lastMessage.content ?? lastMessage.kwargs?.content;
                finalContent = extractStringContent(contentSource);
            }
        }
        if (!finalContent && accumulatedTokensForFinalFallback) {
            // console.warn("[Stream.ts] on_chain_end for LangGraph had no parsable content, using accumulated tokens as fallback.");
            finalContent = accumulatedTokensForFinalFallback;
        }
        callback({ type: "final_response", content: finalContent || "Graph execution finished.", name: event.name }, true);
        accumulatedTokensForFinalFallback = ""; 
      } else if (event.event === "on_chain_error" || event.event === "on_llm_error" || event.event === "on_tool_error") {
        callback({ type: "error", error: event.data?.error?.message || event.data?.error || "Unknown error", name: event.name }, true);
        return; 
      }
    }
  } catch (error: any) {
    // console.error("[Stream.ts] Error in streamQuery: ", error); // Optional: uncomment for debugging errors
    let errorMessage = "An unexpected error occurred during streaming.";
    if (error.message) { errorMessage = error.message; }
    else if (typeof error.toString === 'function') { errorMessage = error.toString(); }
    
    if (errorMessage.includes('exceeded your current quota')) {
      callback({ error: "You have exceeded your API quota. Please check your billing." }, true);
    } else if (errorMessage.includes('invalid api key') || errorMessage.includes('Incorrect API key') || errorMessage.includes('authentication')) {
      callback({ error: "Invalid API key. Please check your settings." }, true);
    } else {
      callback({ error: errorMessage }, true);
    } // This closes the else block
  } // This closes the catch block
} // This closes the streamQuery function 