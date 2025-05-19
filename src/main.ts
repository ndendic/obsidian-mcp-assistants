import { App, Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ChatView, VIEW_TYPE_CHAT } from './views/ChatView';
import { Message } from './types';
import { MCPAssistantSettings, DEFAULT_SETTINGS, MCPAssistantSettingTab } from './Settings';
import { LanggraphAgent } from './Langgraph';
import { streamQuery } from './Stream';

export default class MCPAssistantPlugin extends Plugin {
	settings: MCPAssistantSettings;
	agent: LanggraphAgent | null = null;
	
	async onload() {
		await this.loadSettings();
		
		// Register view
		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf: WorkspaceLeaf) => new ChatView(leaf, this)
		);
		
		// Add settings tab
		this.addSettingTab(new MCPAssistantSettingTab(this.app, this));

		// Add the view to the right sidebar
		this.addRibbonIcon('message-square-heart', 'Open MCP Assistant', () => {
			this.activateView();
		});

		// Initialize MCP client and workflow if models are configured or if tools are enabled
		const hasEnabledTools = Object.values(this.settings.enabledTools).some(enabled => enabled);
		if ((this.settings.models && this.settings.models.length > 0 && this.settings.defaultModelId) ||
		    this.settings.useCustomConfig || hasEnabledTools) {
			// Errors during this background initialization will be caught here.
			this.initializeMCP().catch(error => {
				console.error("Background MCP initialization failed:", error);
				// Optionally, show a less obtrusive notice to the user if needed,
				// or just log it, as initializeMCP already shows notices.
			});
		}
	}
	
	async activateView() {
		const { workspace } = this.app;
		
		// Check if view already exists
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
		
		if (!leaf) {
			// Create a new leaf in the right sidebar
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({
				type: VIEW_TYPE_CHAT,
				active: true,
			});
		}
		
		// Reveal the leaf
		workspace.revealLeaf(leaf);
	}
		
	async initializeMCP() {
		try {
			this.agent = new LanggraphAgent(this.settings, this.app);
			await this.agent.initializeMCP();
			
			// Only show success notice if MCP is enabled or if there are enabled tools
			const hasEnabledTools = Object.values(this.settings.enabledTools).some(enabled => enabled);
			if (this.settings.useCustomConfig || hasEnabledTools) {
				new Notice("MCP Assistant initialized successfully");
			}
		} catch (error) {
			console.error("Failed to initialize MCP:", error);
			new Notice("Failed to initialize MCP Assistant");
		}
	}

	async runQuery(messages: Message[], conversationId: string, agentId?: string): Promise<any> {
		if (!this.agent || !this.agent.workflow) {
			new Notice("MCP Assistant not initialized. Please check your settings.");
			return null;
		}
		
		try {
			const llmMessages = messages.map(msg => {
				if (msg.role === 'system') return null;
				return {
					role: msg.role === 'user' ? 'user' : 'assistant',
					content: msg.content
				};
			}).filter(Boolean);
			return await this.agent.runQuery(llmMessages, conversationId, agentId);
		} catch (error) {
			console.error("Error running query:", error);
			throw error;
		}
	}

	/**
	 * Stream a query to the MCP workflow and yield chunks as they are generated
	 * @param messages List of conversation messages
	 * @param conversationId Unique ID for the conversation thread
	 * @param agentId Optional ID of the agent to use
	 * @param callback Function that will be called with each chunk of the response
	 */
	async streamQuery(messages: Message[], conversationId: string, agentId: string | undefined, callback: (chunk: any, isComplete: boolean) => void): Promise<void> {
		if (!this.agent || !this.agent.workflow) {
			new Notice("MCP Assistant not initialized. Please check your settings.");
			callback({ error: "MCP Assistant not initialized" }, true);
			return;
		}
		
		try {
			const llmMessages = messages.map(msg => {
				if (msg.role === 'system') return null;
				return {
					role: msg.role === 'user' ? 'user' : 'assistant',
					content: msg.content
				};
			}).filter(Boolean);
			await streamQuery(this.agent.workflow, llmMessages, conversationId, agentId, callback);
		} catch (error) {
			console.error("Error streaming query:", error);
			callback({ error: error.toString() }, true);
		}
	}

	onunload() {
		// Close MCP client when plugin is unloaded
		if (this.agent && this.agent.client) {
			this.agent.client.close().catch(console.error);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// Clean up API key - remove quotes and whitespace that users might accidentally include when copying
		await this.saveData(this.settings);
		
		// Reinitialize MCP if settings have changed and models are configured
		// or if MCP is enabled or if there are enabled tools
		const hasEnabledTools = Object.values(this.settings.enabledTools).some(enabled => enabled);
		if ((this.settings.models && this.settings.models.length > 0 && this.settings.defaultModelId) ||
		    this.settings.useCustomConfig || hasEnabledTools) {
			await this.initializeMCP();
		}
	}
	
	// Method to clean up old conversations when we exceed maxConversations
	async cleanupOldConversations() {
		// Load all data
		const savedData = await this.loadData() || {};
		
		if (savedData.conversations) {
			const conversations = savedData.conversations;
			const conversationIDs = Object.keys(conversations);
			
			// If we have more conversations than the limit, remove the oldest ones
			if (conversationIDs.length > this.settings.maxConversations) {
				// Sort conversations by lastUpdated timestamps (oldest first)
				const sortedIDs = conversationIDs.sort((a, b) => {
					return conversations[a].lastUpdated - conversations[b].lastUpdated;
				});
				
				// Calculate how many to remove
				const countToRemove = sortedIDs.length - this.settings.maxConversations;
				
				// Get the IDs to remove (oldest ones)
				const idsToRemove = sortedIDs.slice(0, countToRemove);
				
				// Remove the old conversations
				for (const id of idsToRemove) {
					delete conversations[id];
				}
				
				// Save the updated data
				await this.saveData(savedData);
			}
		}
	}

	// Method to clear a conversation's state from LangGraph memory
	async clearConversationState(conversationId: string): Promise<void> {
		if (!this.agent) return;
		try {
			await this.agent.clearConversationState(conversationId);
		} catch (error) {
			console.error("Error clearing conversation state:", error);
		}
	}

	// Method to reset and initialize a conversation's state from history
	async initializeConversationState(conversationId: string, messages: Message[], systemPrompt: string, skipApiCall: boolean = false): Promise<void> {
		if (!this.agent) return;
		try {
			await this.agent.initializeConversationState(conversationId, messages, systemPrompt, skipApiCall);
		} catch (error) {
			console.error("Error initializing conversation state:", error);
		}
	}
} 