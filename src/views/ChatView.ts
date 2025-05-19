import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer } from 'obsidian';
import MCPAssistantPlugin from '../main';
import { Message, Conversation } from '../types';
import { AbstractInputSuggest } from 'obsidian';
import { App } from 'obsidian';
import { AgentConfig } from '../Settings';
import { TFile } from 'obsidian';

// Use a type reference for Obsidian's extended HTMLElement
type ObsidianHTMLElement = HTMLElement;

export const VIEW_TYPE_CHAT = 'mcp-assistant-chat-view';

class AgentSuggest extends AbstractInputSuggest<AgentConfig> {
  private agents: AgentConfig[];

  constructor(app: App, private inputEl: HTMLTextAreaElement, agents: AgentConfig[]) {
    super(app, inputEl as unknown as HTMLInputElement);
    this.agents = agents;
  }

  getSuggestions(inputStr: string): AgentConfig[] {
    const cursorPosition = this.inputEl.selectionStart;
    // Use direct access to inputEl.value for calculating textBeforeCursor
    const textBeforeCursor = this.inputEl.value.substring(0, cursorPosition); 
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (!atMatch) {
      return [];
    }

    const query = atMatch[1].toLowerCase();
    
    const filteredAgents = this.agents.filter(agent => 
      agent.name.toLowerCase().includes(query) || 
      agent.handle.toLowerCase().includes(query)
    );
    return filteredAgents;
  }

  renderSuggestion(agent: AgentConfig, el: HTMLElement): void {
    el.createDiv({ 
      text: agent.name, // Display only the agent's name
      cls: 'mcp-agent-suggestion-name' 
    });
  }

  selectSuggestion(agent: AgentConfig, evt: MouseEvent | KeyboardEvent): void {
    const cursorPosition = this.inputEl.selectionStart;
    const textBeforeCursorOriginal = this.inputEl.value.substring(0, cursorPosition); 
    const atMatch = textBeforeCursorOriginal.match(/@(\w*)$/);

    if (!atMatch || typeof atMatch.index === 'undefined') { 
      this.close();
      return;
    }

    const triggerStartPosition = atMatch.index; 
    const textBeforeTrigger = this.inputEl.value.substring(0, triggerStartPosition);
    const textAfterCursor = this.inputEl.value.substring(cursorPosition);
            
    // agent.handle is like "buba" (NO leading '@')
    // We construct "...@buba "
    const newText = 
      textBeforeTrigger +    // Text before the typed '@'
      "@" + agent.handle + " " + // Add "@", then the handle, then a space
      textAfterCursor;
            
    this.inputEl.value = newText;
    
    // Cursor position is after the added "@", the handle, and the space
    const newCursorPosition = triggerStartPosition + 1 + agent.handle.length + 1; 
    this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);
    
    this.inputEl.focus();
    this.close();
  }
}

// Suggestion class for Notes (triggered by [[)
class NoteSuggest extends AbstractInputSuggest<TFile> {
  constructor(app: App, private inputEl: HTMLTextAreaElement) {
    super(app, inputEl as unknown as HTMLInputElement);
  }

  getSuggestions(inputStr: string): TFile[] {
    const cursorPosition = this.inputEl.selectionStart;
    const textBeforeCursor = this.inputEl.value.substring(0, cursorPosition);
    const doubleBracketMatch = textBeforeCursor.match(/(\[\[)([^[\]]*)$/);

    if (!doubleBracketMatch) {
      return [];
    }

    const query = doubleBracketMatch[2].toLowerCase();
    const allNotes = this.app.vault.getMarkdownFiles();

    if (!query) {
      // If no query, suggest a few recent notes (e.g., sorted by modification time)
      // For now, let's return a subset, sorted alphabetically for consistency
      return allNotes.sort((a, b) => a.basename.localeCompare(b.basename)).slice(0, 10);
    }

    // Filter notes that match the query in basename or path
    const filteredNotes = allNotes.filter(file => 
      file.basename.toLowerCase().includes(query) || // file.basename is the name without extension
      file.path.toLowerCase().includes(query) // also check full path
    );

    // Sort the filtered notes
    filteredNotes.sort((a, b) => {
      const aBasenameMatches = a.basename.toLowerCase().includes(query);
      const bBasenameMatches = b.basename.toLowerCase().includes(query);

      // Assign a score: 0 for basename match, 1 for path-only match
      const scoreA = aBasenameMatches ? 0 : 1;
      const scoreB = bBasenameMatches ? 0 : 1;

      if (scoreA !== scoreB) {
        return scoreA - scoreB; // Prioritize lower score (basename matches)
      }

      // If scores are equal (e.g., both are basename matches, or both are path-only matches),
      // then sort alphabetically by basename.
      return a.basename.localeCompare(b.basename);
    });

    return filteredNotes;
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.addClass('mcp-note-suggestion-item'); // Add a class to the outer element for styling

    el.createDiv({
      text: file.basename,
      cls: 'mcp-note-suggestion-basename'
    });

    if (file.parent) { // Check if parent exists (it should for files in the vault)
      el.createDiv({
        text: file.parent.path, // Display the parent folder's path
        cls: 'mcp-note-suggestion-path'
      });
    }
  }

  selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
    const cursorPosition = this.inputEl.selectionStart;
    const textBeforeCursor = this.inputEl.value.substring(0, cursorPosition);
    const doubleBracketMatch = textBeforeCursor.match(/(\[\[)([^[\]]*)$/);

    if (!doubleBracketMatch || typeof doubleBracketMatch.index === 'undefined') {
      this.close();
      return;
    }

    const triggerStartPosition = doubleBracketMatch.index;
    const textBeforeTrigger = this.inputEl.value.substring(0, triggerStartPosition);
    const textAfterCursor = this.inputEl.value.substring(cursorPosition);

    const newText = 
      textBeforeTrigger +
      `[[${file.path}|${file.basename}]]` + // Use full path for link, basename for display
      textAfterCursor;
            
    this.inputEl.value = newText;
    const newCursorPosition = triggerStartPosition + 2 + file.path.length + 1 + file.basename.length + 2; // After [[path|basename]]
    this.inputEl.setSelectionRange(newCursorPosition, newCursorPosition);
    
    this.inputEl.focus();
    this.close();
  }
}

export class ChatView extends ItemView {
  private plugin: MCPAssistantPlugin;
  private messages: Message[] = [];
  private chatContainer: ObsidianHTMLElement;
  private inputContainer: ObsidianHTMLElement;
  private inputField: HTMLTextAreaElement;
  private messageContainer: ObsidianHTMLElement;
  private titleElement: HTMLElement;
  private conversationTitle: string = 'New Conversation';
  private currentConversationId: string = 'default-conversation';
  private conversations: Map<string, Conversation> = new Map();
  private lastMarkdownUpdateTime: number = 0; // Add timestamp tracking for throttling updates
  private tokenAccumulator: string = ''; // Add a token accumulator for batching updates
  private tokenAccumulatorThreshold: number = 1; // Effectively: try to update often, let time be the main throttle
  private lastMarkdownUpdateThresholdMs: number = 50; // Update at most every 50ms
  private stateInitialized: boolean = false; // Track whether the current conversation state has been initialized

  constructor(leaf: WorkspaceLeaf, plugin: MCPAssistantPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getIcon(): string {
    return "message-square-heart";
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    return 'MCP Assistant';
  }

  async onOpen(): Promise<void> {
    const containerEl = this.containerEl;
    // Use as any to bypass TypeScript checking for Obsidian's extensions
    (containerEl as any).empty();
    (containerEl as any).addClass('mcp-assistant-container');

    // Add new UI controls for conversation management
    const controlsContainer = (containerEl as any).createDiv('controls-container');
    
    // Conversation selector
    const conversationSelectorContainer = document.createElement('div');
    conversationSelectorContainer.className = 'conversation-selector-container';
    
    // Add title display
    this.titleElement = document.createElement('div');
    this.titleElement.className = 'conversation-title';
    this.titleElement.textContent = this.conversationTitle;
    conversationSelectorContainer.appendChild(this.titleElement);
    
    // Add dropdown icon
    const menuIcon = document.createElement('div');
    menuIcon.className = 'conversation-menu-icon';
    menuIcon.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"></path></svg>';
    conversationSelectorContainer.appendChild(menuIcon);
    
    // Make the entire selector clickable
    conversationSelectorContainer.addEventListener('click', () => {
      this.showConversationMenu(conversationSelectorContainer);
    });
    
    // Add separate click handler for title editing on double click
    this.titleElement.addEventListener('dblclick', (e) => {
      e.stopPropagation(); // Prevent menu from opening
      this.editConversationTitle();
    });
    
    controlsContainer.appendChild(conversationSelectorContainer);
    
    // Controls on the right
    const rightControls = document.createElement('div');
    rightControls.className = 'right-controls';
    
    const newChatButton = document.createElement('button');
    newChatButton.className = 'mcp-assistant-control-button clickable-icon';
    newChatButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle-plus"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    newChatButton.setAttribute('aria-label', 'New Chat');
    newChatButton.addEventListener('click', () => this.startNewConversation());
    rightControls.appendChild(newChatButton);
    
    controlsContainer.appendChild(rightControls);

    // Create message container
    this.messageContainer = (containerEl as any).createDiv('message-container');

    // Create input container
    this.inputContainer = (containerEl as any).createDiv('input-container');
    
    // Create input field
    this.inputField = document.createElement('textarea');
    this.inputField.placeholder = 'Chat, "@" to tag an agent, "[[" to link a note..';
    this.inputField.rows = 1;
    this.inputField.className = 'mcp-assistant-input';
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Add auto-resize functionality for the input field
    this.inputField.addEventListener('input', () => {
      // Reset height to auto to properly calculate scrollHeight
      this.inputField.style.height = 'auto';
      
      // Calculate new height based on content (with max height)
      const newHeight = Math.min(this.inputField.scrollHeight, 200); // Increased max height
      this.inputField.style.height = newHeight + 'px';
    });
    
    this.inputContainer.appendChild(this.inputField);
    
    // Register the agent suggester
    new AgentSuggest(this.app, this.inputField, this.plugin.settings.agents);

    // Register the note suggester
    new NoteSuggest(this.app, this.inputField);

    // Create send button
    const sendButton = document.createElement('button');
    sendButton.className = 'mcp-assistant-send-button clickable-icon';
    sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
    sendButton.setAttribute('aria-label', 'Send');
    sendButton.addEventListener('click', () => this.sendMessage());
    this.inputContainer.appendChild(sendButton);
    
    // Load conversations from storage
    await this.loadConversations();
    
    // Load the current conversation
    await this.loadCurrentConversation();
    
    // If no messages were loaded, add an initial greeting or setup instruction
    if (this.messages.length === 0) {
      if (!this.plugin.settings.models || this.plugin.settings.models.length === 0 || !this.plugin.settings.defaultModelId) {
        this.addSystemMessage('Please configure your AI models in the plugin settings to use MCP Assistant. You need to add at least one model and set a default.');
      } else {
        this.addSystemMessage('Welcome to MCP Assistant. Ask me anything about your vault or files!');
      }
    } else {
      // Render the loaded messages
      this.renderMessages();
    }
  }

  // Show conversation menu to switch between conversations
  showConversationMenu(targetEl: HTMLElement) {
    // Remove any existing dropdown first
    const existingDropdown = document.querySelector('.conversation-dropdown');
    if (existingDropdown) {
      existingDropdown.remove();
    }
    
    // Create a dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'conversation-dropdown';
    dropdown.style.position = 'absolute';
    const rect = targetEl.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.zIndex = '1000';
    
    // Create a container for menu items
    const menuContainer = document.createElement('div');
    menuContainer.className = 'conversation-menu-container';
    dropdown.appendChild(menuContainer);
    
    // Add all conversations to the menu
    for (const [id, conversation] of this.conversations.entries()) {
      const menuItem = document.createElement('div');
      menuItem.className = 'conversation-menu-item';
      if (id === this.currentConversationId) {
        menuItem.classList.add('active');
      }
      
      // Container for title and icon
      const itemContent = menuItem.createDiv({ cls: 'conversation-menu-item-content' });

      const title = conversation.title || 'Untitled';
      itemContent.createDiv({ text: title, cls: 'conversation-menu-item-title' });
      
      // Add delete icon if there is more than one conversation
      if (this.conversations.size > 1) {
        const deleteIcon = itemContent.createDiv({ cls: 'mcp-delete-convo-icon clickable-icon' });
        deleteIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
        deleteIcon.setAttribute('aria-label', 'Delete conversation');

        deleteIcon.addEventListener('click', (event) => {
          event.stopPropagation(); // Prevent menu item click (switching convo)
          dropdown.remove(); // Close dropdown first
          this.deleteConversationById(id);
          // No need to re-render menu here, it's closed. If it were to stay open, we'd refresh it.
        });
      }

      menuItem.addEventListener('click', () => {
        dropdown.remove();
        this.switchConversation(id);
      });
      
      menuContainer.appendChild(menuItem);
    }
    
    // Add the dropdown to the document body
    document.body.appendChild(dropdown);
    
    // Close when clicking outside
    const closeDropdown = (e: MouseEvent) => {
      if (dropdown && !dropdown.contains(e.target as Node)) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    };
    
    // Add a slight delay to prevent immediate closing
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 100);
  }

  // Helper function to get the effective system prompt
  private getEffectiveSystemPrompt(agentId?: string): string {
    if (agentId) {
      const agent = this.plugin.settings.agents.find(a => a.id === agentId);
      if (agent && agent.systemPrompt) {
        return agent.systemPrompt;
      }
    }
    return this.plugin.settings.systemPrompt; // Default global system prompt
  }

  // Switch to a different conversation
  async switchConversation(conversationId: string) {
    if (conversationId === this.currentConversationId) {
      return; // Already on this conversation
    }
    
    // Save current conversation before switching
    // Ensure current conversation's messages all have IDs
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    await this.saveCurrentConversation();
    
    // Update current conversation ID
    this.currentConversationId = conversationId;
    
    // Reset state initialization flag
    this.stateInitialized = false;
    
    // Load the new conversation
    await this.loadCurrentConversation();
  }

  // Delete a conversation by its ID
  async deleteConversationById(conversationId: string) {
    try {
      // If we are trying to delete the currently active conversation
      if (this.currentConversationId === conversationId) {
        // And if it's not the only conversation left
        if (this.conversations.size > 1) {
          // First, remove it from the map to find the next one
          this.conversations.delete(conversationId);
          // Then, switch to another conversation (e.g., most recent)
          const sortedConversations = Array.from(this.conversations.entries())
            .sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);
          if (sortedConversations.length > 0) {
            await this.switchConversation(sortedConversations[0][0]);
          } else {
            // This case should ideally not be reached if size > 1 initially
            await this.startNewConversation(); // Fallback
          }
        } else {
          // It IS the only conversation, so just clear it and effectively start new
          this.conversations.delete(conversationId);
          await this.startNewConversation(); 
          // Ensure startNewConversation also clears LangGraph state for the old ID if necessary
          // or we clear it here for the specific ID before starting new.
          try { await this.plugin.clearConversationState(conversationId); } catch (e) { /* ignore */ }
          new Notice('Conversation cleared.');
          return; // Exit after handling the "last conversation" case
        }
      } else {
        // Deleting a conversation that is NOT currently active
        this.conversations.delete(conversationId);
      }

      // Try to clear the LangGraph state for the deleted conversation, but don't block if it fails
      try {
        await this.plugin.clearConversationState(conversationId);
      } catch (error) {
        console.warn(`Could not clear LangGraph state for ${conversationId}:`, error);
      }

      // Save changes to the conversation list
      await this.saveConversations();
      new Notice('Conversation deleted');

    } catch (error) {
      console.error("Error deleting conversation by ID:", error);
      new Notice('Error deleting conversation');
    }
  }

  // Edit conversation title
  editConversationTitle() {
    if (!this.titleElement) return;
    
    const currentTitle = this.conversationTitle;
    
    // Create input for editing
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.value = currentTitle;
    inputEl.className = 'title-edit-input';
    
    // Replace title with input
    this.titleElement.innerHTML = '';
    this.titleElement.appendChild(inputEl);
    inputEl.focus();
    inputEl.select();
    
    // Handle saving on enter or blur
    const saveTitle = () => {
      const newTitle = inputEl.value.trim() || 'New Conversation';
      this.conversationTitle = newTitle;
      this.titleElement.textContent = newTitle;
      
      // Update the title in the conversations map
      if (this.conversations.has(this.currentConversationId)) {
        const conversation = this.conversations.get(this.currentConversationId);
        if (conversation) {
          conversation.title = newTitle;
          this.saveConversations();
        }
      }
    };
    
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTitle();
      } else if (e.key === 'Escape') {
        this.titleElement.textContent = currentTitle;
      }
    });
    
    inputEl.addEventListener('blur', saveTitle);
  }

  async startNewConversation() {
    // Save current conversation first
    // Ensure current conversation's messages all have IDs
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    await this.saveCurrentConversation();
    
    // Generate a unique ID for the new conversation
    const newId = 'conversation-' + Date.now().toString();
    
    // Create new conversation
    this.conversations.set(newId, {
      id: newId,
      title: 'New Conversation',
      lastUpdated: Date.now(),
      messages: [],
      lastUsedAgentId: undefined // Ensure lastUsedAgentId is initialized
    });
    
    // Reset state initialization flag
    this.stateInitialized = false;
    
    // Switch to the new conversation
    this.currentConversationId = newId;
    this.conversationTitle = 'New Conversation';
    this.messages = [];
    
    // Update UI
    if (this.titleElement) {
      this.titleElement.textContent = this.conversationTitle;
    }
    
    // Clear any existing LLM state for this conversation ID
    await this.plugin.clearConversationState(this.currentConversationId);
    
    // Render (empty) messages
    this.renderMessages();
    
    // Save
    await this.saveConversations();
    
    // Focus on input
    this.inputField.focus();
  }

  async loadConversations() {
    try {
      const savedData = await this.plugin.loadData();
      
      if (savedData && savedData.conversations) {
        // Convert conversations object to Map
        this.conversations = new Map();
        
        for (const [id, convo] of Object.entries(savedData.conversations)) {
          this.conversations.set(id, {
            ...(convo as Conversation),
            lastUsedAgentId: (convo as any).lastUsedAgentId || undefined // Ensure lastUsedAgentId is loaded
          });
        }
        
        // Get the last active conversation ID
        if (savedData.lastActiveConversationId) {
          this.currentConversationId = savedData.lastActiveConversationId;
        } else if (this.conversations.size > 0) {
          // Default to the first conversation

          this.currentConversationId = this.conversations.keys().next().value;
        } else {
          // No conversations, create a default one
          this.currentConversationId = 'default-conversation';
          this.conversations.set(this.currentConversationId, {
            id: this.currentConversationId,
            title: 'New Conversation',
            lastUpdated: Date.now(),
            messages: [],
            lastUsedAgentId: undefined // Ensure lastUsedAgentId is initialized
          });
        }        
        // Cleanup old conversations
        await this.cleanupOldConversations();
      } else {
        // No saved conversations, initialize with default
        this.conversations = new Map();
        this.currentConversationId = 'default-conversation';
        this.conversations.set(this.currentConversationId, {
          id: this.currentConversationId,
          title: 'New Conversation',
          lastUpdated: Date.now(),
          messages: [],
          lastUsedAgentId: undefined // Ensure lastUsedAgentId is initialized
        });
      }
    } catch (error) {
      // Initialize with default on error
      this.conversations = new Map();
      this.currentConversationId = 'default-conversation';
      this.conversations.set(this.currentConversationId, {
        id: this.currentConversationId,
        title: 'New Conversation',
        lastUpdated: Date.now(),
        messages: [],
        lastUsedAgentId: undefined // Ensure lastUsedAgentId is initialized
      });
    }
  }

  async loadCurrentConversation() {
    try {
      // Load the current conversation from the map
      const conversation = this.conversations.get(this.currentConversationId);
      
      if (conversation) {
        this.conversationTitle = conversation.title;
        
        // Filter out any loading messages
        this.messages = conversation.messages.filter(msg => !msg.isLoading);
        
        // Update title in UI
        if (this.titleElement) {
          this.titleElement.textContent = this.conversationTitle;
        }
        
        const systemPromptToUse = this.getEffectiveSystemPrompt(conversation.lastUsedAgentId);

        // Skip API calls during initial loading for better performance
        // State will be initialized when user sends the first message
        try {
          await this.plugin.initializeConversationState(
            this.currentConversationId, 
            this.messages, 
            systemPromptToUse, // Pass determined system prompt
            true // Skip API call during loading
          );
        } catch (stateError) {
          // Continue with UI updates even if state initialization fails
        }
        
        // Reset state initialization flag
        this.stateInitialized = false;
        
        // Render messages
        this.renderMessages();
      } else {
        this.messages = [];
        this.conversationTitle = 'New Conversation';
        
        if (this.titleElement) {
          this.titleElement.textContent = this.conversationTitle;
        }
      }
    } catch (error) {
      // Provide a fallback experience if loading fails
      this.messages = [];
      this.conversationTitle = 'New Conversation';
      
      if (this.titleElement) {
        this.titleElement.textContent = this.conversationTitle;
      }
      
      this.renderMessages();
      new Notice('Error loading conversation');
    }
  }

  async saveCurrentConversation() {
    // Filter out loading messages before saving
    const messagesToSave = this.messages.filter(msg => !msg.isLoading);
    
    const currentConversationData = this.conversations.get(this.currentConversationId);

    // Update the conversation in the map
    this.conversations.set(this.currentConversationId, {
      id: this.currentConversationId,
      title: this.conversationTitle,
      lastUpdated: Date.now(),
      messages: messagesToSave,
      lastUsedAgentId: currentConversationData?.lastUsedAgentId // Preserve existing lastUsedAgentId
    });
    
    // Save all conversations to storage
    await this.saveConversations();
  }

  async saveConversations() {
    try {
      // Get current data
      const savedData = await this.plugin.loadData() || {};
      
      // Convert Map to object for storage
      const conversationsObj = {};
      for (const [id, conversation] of this.conversations.entries()) {
        conversationsObj[id] = conversation;
      }
      
      // Update the data
      savedData.conversations = conversationsObj;
      savedData.lastActiveConversationId = this.currentConversationId;
      
      // Save back to storage
      await this.plugin.saveData(savedData);
    } catch (error) {
      new Notice('Failed to save conversations');
    }
  }

  async cleanupOldConversations() {
    // If we have more conversations than the limit, remove the oldest ones
    if (this.conversations.size > this.plugin.settings.maxConversations) {
      // Sort conversations by lastUpdated
      const sortedConversations = Array.from(this.conversations.entries())
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
      
      // Determine how many to remove
      const countToRemove = this.conversations.size - this.plugin.settings.maxConversations;
      
      // Remove oldest conversations
      for (let i = 0; i < countToRemove; i++) {
        const [idToRemove] = sortedConversations[i];
        
        // Don't remove the current conversation
        if (idToRemove !== this.currentConversationId) {
          this.conversations.delete(idToRemove);
        }
      }
      
      // Save changes
      await this.saveConversations();
    }
  }

  // Helper function to update a single message in the DOM
  private updateMessageInDOM(messageId: string) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;

    const messageEl = document.getElementById(messageId) as HTMLElement;
    if (!messageEl) return;

    let contentHostingEl: HTMLElement | null = null;
    if (message.role === 'assistant') {
      contentHostingEl = messageEl.querySelector('.markdown-rendered');
      if (!contentHostingEl) { 
        const timestampEl = messageEl.querySelector('.assistant-timestamp');
        messageEl.innerHTML = ''; 
        if (timestampEl) messageEl.appendChild(timestampEl); 
        contentHostingEl = messageEl.createDiv('markdown-rendered') as unknown as HTMLElement;
      }
    } else if (message.role === 'user' || message.role === 'system') { 
      contentHostingEl = messageEl.querySelector('.message-content');
       if (!contentHostingEl && messageEl.classList.contains('message')) { 
            messageEl.innerHTML = ''; 
            const timestampEl = messageEl.querySelector('.message-timestamp'); 
            if(timestampEl) messageEl.appendChild(timestampEl);
            contentHostingEl = messageEl.createDiv('message-content') as unknown as HTMLElement;
       }
    }

    if (!contentHostingEl) return; 

    (contentHostingEl as any).empty(); 

    if (message.role === 'assistant') {
      let prefixHTML = "";
      if (message.agentId) {
        const agent = this.plugin.settings.agents.find(a => a.id === message.agentId);
        if (agent) {
          prefixHTML = `<span class="mcp-agent-attribution">@${agent.handle}: </span>`;
        }
      }
      // Render prefix directly if it exists
      if (prefixHTML) {
        contentHostingEl.innerHTML = prefixHTML;
      }

      // Target for actual content (Markdown, tool call, etc.)
      // If prefix exists, content should be placed after it. If not, directly in contentHostingEl.
      // For simplicity, we create a contentDiv, and if no prefix, we make contentHostingEl the contentDiv.
      const actualContentTarget = prefixHTML ? contentHostingEl.createDiv() : contentHostingEl;
      if(prefixHTML && actualContentTarget !== contentHostingEl) {
        // if prefix exists, contentHostingEl was cleared and then had prefix set.
        // We created actualContentTarget as a new div INSIDE contentHostingEl, so no need to clear actualContentTarget itself here.
      } else if (!prefixHTML) {
        // actualContentTarget is contentHostingEl, which was already emptied.
      }

      if (message.isToolCall) {
        try {
          MarkdownRenderer.renderMarkdown(String(message.content), actualContentTarget, '.', this);
        } catch (e) {
          actualContentTarget.innerHTML = `<p>${this.escapeHtml(String(message.content))}</p>`;
        }
      } else if (typeof message.content === 'string' && message.content.length > 0) {
        try {
          MarkdownRenderer.renderMarkdown(message.content, actualContentTarget, '.', this);
        } catch (e) {
          actualContentTarget.innerHTML = `<p>${this.escapeHtml(message.content)}</p>`;
        }
      } else if (Array.isArray(message.content)) { 
        message.content.forEach(item => {
          const itemDiv = actualContentTarget.createDiv(); // Append each item inside actualContentTarget
          if (item.type === 'text') {
            try { MarkdownRenderer.renderMarkdown(item.text, itemDiv, '.', this); } 
            catch (e) { itemDiv.innerHTML = `<p>${this.escapeHtml(item.text)}</p>`; }
          } else if (item.type === 'tool_use') {
            itemDiv.className = 'tool-use';
            itemDiv.innerHTML = `<div class="tool-header">Using tool: ${item.name}</div><div class="tool-input">${JSON.stringify(item.input, null, 2)}</div>`;
          }
        });
      } else if (message.isLoading && actualContentTarget.innerHTML.trim() === '') {
         // Only show loader if isLoading is true AND actualContentTarget is empty.
         // (prefix is in contentHostingEl, actualContentTarget is where main content goes)
        const loaderDiv = actualContentTarget.createDiv('loading-indicator');
        loaderDiv.innerHTML = '<div class="loader"></div>';
      } else if (typeof message.content === 'object' && message.content !== null) { 
          actualContentTarget.innerHTML = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
      } 

    } else if (message.role === 'user' || message.role === 'system') {
      if (typeof message.content === 'string') {
        try {
          MarkdownRenderer.renderMarkdown(message.content, contentHostingEl, '.', this);
        } catch (e) {
          contentHostingEl.innerHTML = `<p>${this.escapeHtml(message.content)}</p>`;
        }
      } else {
        contentHostingEl.innerHTML = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
      }
    }
    if (messageEl.isSameNode(this.messageContainer.lastElementChild)) {
        this.messageContainer.scrollTo({
            top: this.messageContainer.scrollHeight,
            behavior: 'auto' 
        });
    }
  }

  async sendMessage() {
    // Get the input text
    const rawMessageContent = this.inputField.value.trim();
    
    let explicitAgentId: string | undefined = undefined;
    let processedMessageContent = rawMessageContent;

    // Regex to parse @agent_handle at the beginning of the message
    const agentHandleRegex = /^@([a-zA-Z0-9_]+)(?:\s|$)/;
    const match = rawMessageContent.match(agentHandleRegex);

    if (match && match[1]) {
      const parsedHandle = match[1];
      const targetAgent = this.plugin.settings.agents.find(agent => agent.handle === parsedHandle);

      if (targetAgent) {
        explicitAgentId = targetAgent.id;
        // Remove the @handle from the message content that will be sent to the agent
        processedMessageContent = rawMessageContent.replace(agentHandleRegex, '').trim();
        new Notice(`Routing to agent: @${parsedHandle}`); // Optional: notify user
      } else {
        // Optionally notify if handle is typed but not found, or just proceed with default/last agent
        // For now, we'll just proceed. If a user types @unknown_agent, it won't find an agent, 
        // and explicitAgentId will remain undefined.
      }
    }

    // Clear input field
    this.inputField.value = '';
    this.inputField.style.height = 'auto';
    
    // Don't send empty messages (after potential handle stripping)
    if (!processedMessageContent) {
      return;
    }
    
    // Check if models are configured
    if (!this.plugin.settings.models || this.plugin.settings.models.length === 0 || !this.plugin.settings.defaultModelId) {
      this.addSystemMessage('MCP Assistant is not fully configured. Please go to settings, add at least one AI model, and select a default.');
      return;
    }

    // Add user message to the list (using the processed content)
    const userMessageTimestamp = Date.now();
    const userMessageId = this.generateMessageId();
    this.messages.push({
      id: userMessageId,
      role: 'user',
      content: processedMessageContent,
      timestamp: userMessageTimestamp
    });
    this.renderMessages(); // Render user message immediately

    // Create a loading message
    const loadingMessageId = this.generateMessageId();
    const currentConversation = this.conversations.get(this.currentConversationId);
    if (!currentConversation) {
        new Notice("Error: Current conversation not found when trying to send message.");
        return;
    }
    let agentIdToUse = explicitAgentId || currentConversation.lastUsedAgentId;

    // If an agent was explicitly mentioned, update it as the last used agent for this conversation
    if (explicitAgentId) {
      currentConversation.lastUsedAgentId = explicitAgentId;
      // Note: The conversation will be saved later, after the message is processed.
    }

    // This is the message object that will be updated
    const loadingMessageObject: Message = {
      id: loadingMessageId, role: 'assistant', content: '', isLoading: true, 
      timestamp: Date.now(), agentId: agentIdToUse 
    };
    this.messages.push(loadingMessageObject);
    this.renderMessages(); // Initial render to get the bubble in the DOM with a loader
    
    // No need to query for streamingContentHostEl here anymore, updateMessageInDOM will handle it.

    if (!this.stateInitialized) {
      try {
        const historyForInitialization = this.messages.slice(0, this.messages.length - 2);
        const systemPromptToUse = this.getEffectiveSystemPrompt(agentIdToUse);
        await this.plugin.initializeConversationState(
          this.currentConversationId, 
          historyForInitialization.filter(m => !m.isLoading && m.id !== loadingMessageId),
          systemPromptToUse, false );
        this.stateInitialized = true;
      } catch (error) { console.error("Error initializing state:", error); }
    }
    await this.saveCurrentConversation();
    const newUserMessageForStream: Message = { id: userMessageId, role: 'user', content: processedMessageContent, timestamp: userMessageTimestamp };
    this.tokenAccumulator = '';
      
    await this.plugin.streamQuery([newUserMessageForStream], this.currentConversationId, agentIdToUse, async (chunk, isComplete) => {
      const messageToUpdate = this.messages.find(m => m.id === loadingMessageId);
      if (!messageToUpdate) {
        // This case should be rare if loadingMessage was pushed and not removed.
        // console.warn("Target message for update not found, ID:", loadingMessageId);
        if (isComplete && chunk.type === "final_response") { // If it's the end, add as new message
            this.addAIMessage(chunk.content, false, agentIdToUse);
        } else if (isComplete && chunk.error) {
            this.addSystemMessage(`**Error:** ${chunk.error}`);
        }
        return;
      }

      if (!isComplete) {
        if (chunk.type === "tool_start") {
          messageToUpdate.content = `Calling tool: **${chunk.name}** with input: \`\`\`json\n${JSON.stringify(chunk.input, null, 2)}\n\`\`\``;
          messageToUpdate.isToolCall = true; messageToUpdate.toolCallId = chunk.toolCallId;
          messageToUpdate.isLoading = false; 
          this.updateMessageInDOM(loadingMessageId); 
        } else if (chunk.type === "tool_end") {
          if (messageToUpdate.toolCallId === chunk.toolCallId && messageToUpdate.isToolCall) {
            messageToUpdate.content = `Tool **${chunk.name}** finished. Output: \`\`\`json\n${JSON.stringify(chunk.output, null, 2)}\n\`\`\`\nWaiting for agent's analysis...`;
            this.updateMessageInDOM(loadingMessageId); 
          }
        } else if (chunk.type === "token") {
          if (messageToUpdate.isToolCall) { 
            messageToUpdate.content = chunk.content; 
            messageToUpdate.isToolCall = false;
            this.tokenAccumulator = chunk.content;
            messageToUpdate.isRenderedOnce = false; 
          } else {
            this.tokenAccumulator += chunk.content;
            messageToUpdate.content = this.tokenAccumulator;
          }
          messageToUpdate.isLoading = true; 

          const now = Date.now();
          const timeThresholdMet = now - this.lastMarkdownUpdateTime > this.lastMarkdownUpdateThresholdMs;
          // Update on newline OR if the time threshold is met.
          // The isRenderedOnce flag ensures the very first token(s) make it through quickly.
          const shouldUpdate = this.tokenAccumulator.endsWith('\n') || timeThresholdMet || !messageToUpdate.isRenderedOnce;
          
          if (shouldUpdate && this.tokenAccumulator.length > 0) { // also ensure there is content to render
            // console.log(`[ChatView.ts] Updating DOM. Reason: newline? ${this.tokenAccumulator.endsWith('\n')}, time? ${timeThresholdMet}, firstRender? ${!messageToUpdate.isRenderedOnce}. Acc: "${this.tokenAccumulator}"`);
            this.updateMessageInDOM(loadingMessageId);
            messageToUpdate.isRenderedOnce = true;
            this.lastMarkdownUpdateTime = now; 
            // No need to reset tokenAccumulator, messageToUpdate.content holds the full string
          }
        } else if (chunk.error) {
          messageToUpdate.content = `**Error:** ${chunk.error}`; 
          messageToUpdate.isLoading = false; messageToUpdate.isToolCall = false;
          this.updateMessageInDOM(loadingMessageId);
        }
      } else { // isComplete === true
        // Ensure any remaining tokens in the accumulator are rendered if not already by the loop
        if (this.tokenAccumulator.length > 0 && messageToUpdate.content !== this.tokenAccumulator) {
             // This case handles if the stream ends WITHOUT a newline and before the time threshold for the last few tokens.
            messageToUpdate.content = this.tokenAccumulator;
            // console.log("[ChatView.ts] Force update for remaining tokens before final_response.");
            this.updateMessageInDOM(loadingMessageId); 
        }

        if (chunk.type === "final_response") {
          messageToUpdate.content = (chunk.content && chunk.content.length > 0) ? chunk.content : this.tokenAccumulator;
          messageToUpdate.timestamp = Date.now();
        } else if (chunk.error) {
          messageToUpdate.content = `**Error:** ${chunk.error}`;
        }
        messageToUpdate.isLoading = false; messageToUpdate.isToolCall = false;
        this.tokenAccumulator = ''; 
        this.updateMessageInDOM(loadingMessageId); 
        this.messages.forEach(msg => { if (!msg.id) msg.id = this.generateMessageId(); });
        await this.saveCurrentConversation();
        this.updateConversationTitle(); 
      }
    });
  }

  // Helper method to render markdown content
  renderMarkdown(content: string, container: HTMLElement): void {
    try {
      // For streaming we handle clearing outside this method
      if (container.classList.contains('markdown-rendered')) {
        // We're updating an existing markdown container, so don't clear it again
        // This is handled by the caller, usually by setting innerHTML = '' before calling renderMarkdown
      } else if (!container.classList.contains('stream-container') || container.children.length === 0) {
        // Clear existing content for non-streaming containers or empty stream containers
        container.innerHTML = ''; // Use innerHTML for faster clearing
      }
      
      // Use Obsidian's markdown renderer
      MarkdownRenderer.renderMarkdown(
        content,
        container as any, // Cast to any to bypass type checking
        '',
        this
      );
    } catch (error) {
      // Fallback to basic HTML if renderer fails
      container.innerHTML = `<div>${this.escapeHtml(content)}</div>`;
    }
  }

  addUserMessage(content: string) {
    this.messages.push({ 
      id: this.generateMessageId(), 
      role: 'user', 
      content, 
      timestamp: Date.now() 
    });
    this.renderMessages();
    // Ensure all messages have IDs before saving
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    this.saveCurrentConversation();
  }

  addAIMessage(content: any, isLoading = false, agentId?: string) { // Added isLoading and agentId
    this.messages.push({ 
      id: this.generateMessageId(), 
      role: 'assistant', 
      content, 
      isLoading, 
      timestamp: Date.now(),
      agentId // Store agentId if provided
    });
    this.renderMessages();
    // Ensure all messages have IDs before saving
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    this.saveCurrentConversation();
  }

  addSystemMessage(content: string) {
    this.messages.push({ 
      id: this.generateMessageId(), 
      role: 'system', 
      content, 
      timestamp: Date.now() 
    });
    this.renderMessages();
    // Ensure all messages have IDs before saving
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    this.saveCurrentConversation();
  }

  renderMessages() {
    const prevScroll = this.messageContainer.scrollTop + this.messageContainer.clientHeight >= this.messageContainer.scrollHeight - 50; // Check if near bottom

    (this.messageContainer as any).empty(); // Clear all messages
    
    // Add a restart button that's visible when we have a stuck message
    if (this.messages.some(m => m.isLoading)) {
      // Create the container but don't add it to the DOM yet
      const restartContainer = document.createElement('div');
      restartContainer.className = 'restart-container';
      restartContainer.style.display = 'none'; // Hide initially
      
      const restartMessage = document.createElement('div');
      restartMessage.className = 'restart-message';
      restartMessage.textContent = "Message seems to be taking a while...";
      
      const restartButton = document.createElement('button');
      restartButton.className = 'restart-button';
      restartButton.textContent = "Cancel";
      restartButton.onclick = () => {
        // Remove loading messages
        this.messages = this.messages.filter(msg => !msg.isLoading && !msg.isToolCall);
        // Add a system message explaining what happened
        this.addSystemMessage('Previous response was cancelled.');
        // Force re-render
        this.renderMessages();
      };
      
      restartContainer.appendChild(restartMessage);
      restartContainer.appendChild(restartButton);
      
      this.messageContainer.appendChild(restartContainer);
      
      // Show the restart message after a 10-second delay if still loading
      setTimeout(() => {
        // Only show if we still have loading messages
        if (this.messages.some(m => m.isLoading) && restartContainer.parentNode) {
          restartContainer.style.display = 'flex';
          restartContainer.classList.add('shown');
        }
      }, 10000); // 10 seconds
    }
    
    for (const message of this.messages) {
      // Different styling based on message role
      if (message.role === 'user') {
        // User messages in chat bubble
        const messageEl = (this.messageContainer as any).createDiv(`message user-message`);
        messageEl.id = message.id; // Assign message ID to the element
        
        // Create content container
        const contentEl = (messageEl as any).createDiv('message-content');
        
        // Show timestamp if available
        if (message.timestamp) {
          const timestampEl = (messageEl as any).createDiv('message-timestamp');
          const date = new Date(message.timestamp);
          timestampEl.textContent = this.formatTimestamp(date);
        }
        
        // Handle message content
        if (typeof message.content === 'string') {
          // Use Obsidian's markdown renderer
          try {
            MarkdownRenderer.renderMarkdown(message.content, contentEl, '.', this);
          } catch (e) {
            // Fallback to simple text if renderer fails
            contentEl.innerHTML = `<p>${this.escapeHtml(message.content)}</p>`;
          }
        } else {
          contentEl.innerHTML = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
        }
      } else if (message.role === 'assistant') {
        // Assistant messages without bubble, rendered as markdown
        const messageEl = (this.messageContainer as any).createDiv(`message-assistant-container`);
        messageEl.id = message.id; // Assign message ID to the element
        
        // Add timestamp for assistant messages
        if (message.timestamp) {
          const timestampEl = (messageEl as any).createDiv('assistant-timestamp');
          const date = new Date(message.timestamp);
          timestampEl.textContent = this.formatTimestamp(date);
        }
        
        // Create content container - using special Obsidian markdown rendering
        const contentEl = (messageEl as any).createDiv('markdown-rendered'); // This class is for Obsidian's styling
        
        // Agent attribution
        let prefix = "";
        if (message.agentId) {
          const agent = this.plugin.settings.agents.find(a => a.id === message.agentId);
          if (agent) {
            prefix = `<span class="mcp-agent-attribution">@${agent.handle}: </span>`;
          }
        }
        if (prefix) {
            const attributionEl = contentEl.createEl('span'); // Create a span for the prefix
            attributionEl.innerHTML = prefix; // Set its content
        }

        // Handle different content types
        if (message.isLoading) {
          (contentEl as any).createDiv('loading-indicator').innerHTML = '<div class="loader"></div>';
        } else if (message.isToolCall) {
            // Render tool call information specially
            // The content might already be formatted markdown string from the callback
            try {
                MarkdownRenderer.renderMarkdown(message.content, contentEl, '.', this);
            } catch (e) {
                contentEl.innerHTML = `<p>${this.escapeHtml(String(message.content))}</p>`;
            }
        } else if (typeof message.content === 'string') {
          // Use Obsidian's markdown renderer
          try {
            // If there was a prefix, the actual markdown rendering should happen in a new container,
            // or ensure the prefix is not part of what MarkdownRenderer processes.
            // For simplicity, if prefix is present, append to contentEl directly.
            // If no prefix, contentEl directly receives markdown.
            // Let's assume contentEl is the main container. If prefix was added, we need to add content after it.
            const markdownTarget = prefix ? contentEl.createDiv() : contentEl;
            MarkdownRenderer.renderMarkdown(message.content, markdownTarget, '.', this);
          } catch (e) {
            // Fallback to simple text if renderer fails
            const fallbackTarget = prefix ? contentEl.createDiv() : contentEl;
            fallbackTarget.innerHTML = `<p>${this.escapeHtml(message.content)}</p>`;
          }
        } else if (Array.isArray(message.content)) {
          // Handle content array (common in Claude responses)
          for (const item of message.content) {
            if (item.type === 'text') {
              // Create a new element for each text item to render markdown properly
              const textEl = contentEl.createDiv();
              try {
                MarkdownRenderer.renderMarkdown(item.text, textEl, '.', this);
              } catch (e) {
                // Fallback to simple text if renderer fails
                textEl.innerHTML = `<p>${this.escapeHtml(item.text)}</p>`;
              }
            } else if (item.type === 'tool_use') {
              // Show tool usage in a special way
              const toolEl = (contentEl as any).createDiv('tool-use');
              toolEl.innerHTML = `<div class="tool-header">Using tool: ${item.name}</div>`;
              toolEl.innerHTML += `<div class="tool-input">${JSON.stringify(item.input, null, 2)}</div>`;
            }
          }
        } else if (typeof message.content === 'object') {
          // Fallback for other object types
          contentEl.innerHTML = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
        }
      } else {
        // System message
        const messageEl = (this.messageContainer as any).createDiv(`message system-message`);
        messageEl.id = message.id; // Assign message ID to the element
        
        // Create content container
        const contentEl = (messageEl as any).createDiv('message-content');
        
        if (typeof message.content === 'string') {
          // Use Obsidian's markdown renderer for system messages too
          try {
            MarkdownRenderer.renderMarkdown(message.content, contentEl, '.', this);
          } catch (e) {
            // Fallback to simple text if renderer fails
            contentEl.innerHTML = `<p>${this.escapeHtml(message.content)}</p>`;
          }
        } else {
          contentEl.innerHTML = `<pre>${JSON.stringify(message.content, null, 2)}</pre>`;
        }
      }
    }
    
    if (prevScroll || this.messages.length <= 1) { // Auto-scroll if was at bottom or very few messages
        this.messageContainer.scrollTo({
            top: this.messageContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
  }
  
  // Helper function to escape HTML in code blocks - we'll keep this for the JSON stringification
  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Format timestamp to a human-readable format
  formatTimestamp(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
             ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  async onClose(): Promise<void> {
    // Save conversation on close
    // Ensure all messages have IDs before saving
    this.messages.forEach(msg => {
      if (!msg.id) msg.id = this.generateMessageId();
    });
    await this.saveCurrentConversation();
  }

  updateConversationTitle(): void {
    // Update title based on the first message if this is a new conversation
    if (this.messages.length >= 2 && this.conversationTitle === 'New Conversation') {
      // Get the first user message
      const firstUserMessage = this.messages.find(msg => msg.role === 'user');
      
      if (firstUserMessage) {
        // Use the first few words of the first message as the title
        const newTitle = firstUserMessage.content.split(' ').slice(0, 4).join(' ') + '...';
        this.conversationTitle = newTitle;
        
        if (this.titleElement) {
          this.titleElement.textContent = newTitle;
        }
      }
    }
  }

  // Helper function to generate unique message IDs
  private generateMessageId(): string {
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  }
} 