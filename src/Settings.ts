import { PluginSettingTab, App, Setting, Notice, Modal, TextComponent } from 'obsidian';

export interface ApiKeyStore {
  [provider: string]: string;
}

export interface ModelConfig {
  id: string;
  provider: string;
  model: string;
  label?: string;
  apiKey: string;
  endpointUrl?: string;
  temperature?: number;
  customOptions?: Record<string, any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  handle: string; // auto-generated
  modelId: string; // ID of a ModelConfig
  systemPrompt: string;
}

export interface MCPAssistantSettings {
  apiKeys: ApiKeyStore;
  models: ModelConfig[];
  agents: AgentConfig[];
  defaultModelId: string;
  useFilesystemServer: boolean;
  customServerConfig: string;
  useCustomConfig: boolean;
  useMemoryServer: boolean;
  maxConversations: number;
  systemPrompt: string;
  // Tool toggles
  enabledTools: {
    read_file: boolean;
    upsert_note: boolean;
    delete_file: boolean;
    list_files_by_tag: boolean;
    get_active_note: boolean;
    get_vault_path: boolean;
    simple_search: boolean;
    get_vault_structure: boolean;
  };
}

export const PROVIDERS = [
  { value: "openai", label: "OpenAI", defaultEndpoint: "https://api.openai.com/v1", helpURL: "https://platform.openai.com/api-keys"},
  { value: "anthropic", label: "Anthropic", defaultEndpoint: "https://api.anthropic.com/", helpURL: "https://console.anthropic.com/settings/keys"},
  { value: "google-genai", label: "Google Gemini", defaultEndpoint: "https://generativelanguage.googleapis.com", helpURL: "https://aistudio.google.com/apikey"},
  // { value: "groq", label: "Groq", defaultEndpoint: "https://api.groq.com/openai", helpURL: "https://console.groq.com/keys"},
  // { value: "mistral", label: "MistralAI", defaultEndpoint: "https://api.mistral.ai/v1", helpURL: "https://console.mistral.ai/api-keys"},
  { value: "ollama", label: "Ollama", defaultEndpoint: "http://localhost:11434/v1/", helpURL: "http://localhost:11434/v1/"},
  // { value: "xai", label: "xAI", defaultEndpoint: "https://api.x.ai/v1", helpURL: "https://console.x.ai/"},
  // { value: "deepseek", label: "DeepSeek", defaultEndpoint: "https://api.deepseek.com/", helpURL: "https://platform.deepseek.com/api-keys"},
];

export const DEFAULT_SETTINGS: MCPAssistantSettings = {
  apiKeys: {},
  models: [
    {
      id: "openai-gpt-4o",
      provider: "openai",
      model: "gpt-4o",
      label: "OpenAI GPT-4o (default)",
      apiKey: "", // Will be auto-filled from apiKeys if present
      endpointUrl: "https://api.openai.com/v1",
      temperature: 0.7,
    }
  ],
  defaultModelId: "openai-gpt-4o",
  useFilesystemServer: true,
  agents: [],
  customServerConfig: JSON.stringify({
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      transport: "stdio"
    }
  }, null, 2),
  useCustomConfig: false,
  useMemoryServer: true,
  maxConversations: 5,
  // Default all tools to enabled
  enabledTools: {
    read_file: true,
    upsert_note: true,
    delete_file: true,
    list_files_by_tag: true,
    get_active_note: true,
    get_vault_path: true,
    simple_search: true,
    get_vault_structure: true
  },
  systemPrompt: `You are a helpful assistant integrated into Obsidian.

Key instructions:
- Use rich markdown formatting when replying to user
- Always add emojis to enrich your content
- When showing code, use proper markdown formatting with language identifiers
- If you need any file information, always use the appropriate tools rather than making assumptions about file contents. Be cautious when modifying files, ensuring you don't cause data loss. Always confirm before making significant changes.

Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     b) Store facts about them as observations`
};

export class MCPAssistantSettingTab extends PluginSettingTab {
  plugin: any;
  private contentBaseEl: HTMLElement;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h1', { text: 'MCP Assistant Settings' });

    const navEl = containerEl.createDiv({ cls: 'mcp-settings-tab-nav' });
    this.contentBaseEl = containerEl.createDiv({ cls: 'mcp-settings-tab-content' }) as any as HTMLElement;

    const tabs = {
      "General": this.createGeneralSettings.bind(this),
      "API Keys": this.createApiKeysSettings.bind(this),
      "Models": this.createModelsSettings.bind(this),
      "Tools/MCPs": this.createMCPSettings.bind(this),
      "Agents": this.createAgentsSettings.bind(this)
    };

    const contentElements: Record<string, HTMLElement> = {};

    Object.keys(tabs).forEach(tabName => {
      const tabButton = navEl.createEl('button', { text: tabName, cls: 'mcp-settings-tab-button' });
      const tabContentEl = this.contentBaseEl.createDiv({ cls: 'mcp-settings-tab-pane' });
      contentElements[tabName] = tabContentEl as HTMLElement;

      tabButton.addEventListener('click', () => {
        (navEl as HTMLElement).querySelectorAll('.mcp-settings-tab-button').forEach(btn => btn.classList.remove('active'));
        (this.contentBaseEl as HTMLElement).querySelectorAll('.mcp-settings-tab-pane').forEach(pane => (pane as HTMLElement).style.display = 'none');
        
        (tabButton as HTMLElement).classList.add('active');
        (tabContentEl as HTMLElement).style.display = 'block';
        (tabContentEl as any).empty(); 
        tabs[tabName](tabContentEl as HTMLElement);
      });
    });

    const firstTabName = Object.keys(tabs)[0];
    const firstButton = (navEl as HTMLElement).querySelector('.mcp-settings-tab-button') as HTMLElement | null;
    if (firstButton) {
      firstButton.classList.add('active');
      (contentElements[firstTabName] as HTMLElement).style.display = 'block';
      (contentElements[firstTabName] as any).empty();
      tabs[firstTabName](contentElements[firstTabName] as HTMLElement);
    }
  }

  private createGeneralSettings(containerEl: HTMLElement): void {
    // This will call sub-methods for "Assistant Behavior" and "Chat History Settings"
    this.createAssistantBehaviorSettings(containerEl);
    this.createChatHistorySettings(containerEl);
  }
  
  private createAssistantBehaviorSettings(containerEl: HTMLElement): void {
    (containerEl as any).createEl('h3', {text: 'Assistant Behavior'});
    const systemPromptSetting = new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Instructions that define how the assistant behaves. This is sent with every message.');
    const systemPromptContainer = (containerEl as any).createDiv();
    (systemPromptContainer as any).addClass('mcp-system-prompt-textarea');
    const systemPromptTextarea = (systemPromptContainer as any).createEl('textarea', {
      attr: {
        rows: '12',
        cols: '50',
        style: 'width: 100%; font-family: monospace;'
      },
      text: this.plugin.settings.systemPrompt
    });
    systemPromptTextarea.addEventListener('change', async (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      this.plugin.settings.systemPrompt = target.value;
      await this.plugin.saveSettings();
    });
    const restoreButton = document.createElement('button');
    restoreButton.textContent = 'Restore Default System Prompt';
    restoreButton.className = 'mod-warning';
    restoreButton.style.marginBottom = '20px';
    (containerEl as any).createDiv('setting-item').appendChild(
      restoreButton
    ).addEventListener('click', async () => {
      if (confirm('Are you sure you want to restore the default system prompt?')) {
        systemPromptTextarea.value = DEFAULT_SETTINGS.systemPrompt;
        this.plugin.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
        await this.plugin.saveSettings();
        new Notice('Default system prompt restored');
      }
    });
  }

  private createChatHistorySettings(containerEl: HTMLElement): void {
    (containerEl as any).createEl('h3', {text: 'Chat History Settings'});
    new Setting(containerEl)
      .setName('Maximum Conversations')
      .setDesc('Maximum number of conversations to store (older ones will be deleted)')
      .addText(text => text
        .setPlaceholder('10')
        .setValue(String(this.plugin.settings.maxConversations))
        .onChange(async (value: string) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue) && numValue >= 1 && numValue <= 50) {
            this.plugin.settings.maxConversations = numValue;
            await this.plugin.saveSettings();
            await this.plugin.cleanupOldConversations();
          }
        }));
    new Setting(containerEl)
      .setName('Clear All Conversations')
      .setDesc('Delete all saved conversation history')
      .addButton(button => button
        .setButtonText('Clear History')
        .onClick(async () => {
          if (confirm('Are you sure you want to delete all conversation history? This cannot be undone.')) {
            try {
              const savedData = await this.plugin.loadData() || {};
              if (savedData.conversations) {
                savedData.conversations = {};
                await this.plugin.saveData(savedData);
                new Notice('All conversation history has been cleared');
              }
            } catch (error) {
              console.error('Error clearing conversation history:', error);
              new Notice('Failed to clear conversation history');
            }
          }
        }));
  }

  private createApiKeysSettings(containerEl: HTMLElement): void {
    (containerEl as any).createEl('h3', {text: 'API Keys (per provider)'});
    for (const provider of PROVIDERS) {
      // // Skip creating API key input for providers that are commented out in PROVIDERS array
      // if (provider.value === "groq" || provider.value === "mistral" || provider.value === "xai" || provider.value === "deepseek") {
      //   // Optionally, you could add a placeholder or a message indicating these are disabled
      //   // For now, we just skip them, and they won't appear because they are commented out in PROVIDERS.
      //   // If PROVIDERS was not modified, this check would be strictly necessary.
      //   // Given PROVIDERS is modified, this explicit check is more for clarity or future-proofing if someone uncomments them there
      //   // without realizing this section also needs adjustment.
      //   // However, since PROVIDERS is filtered, this loop won't even run for them.
      //   continue;
      // }

      const apiKeySetting = new Setting(containerEl)
        .setName(`${provider.label} API Key`)
        .setDesc("\u00A0");
      if (provider.helpURL) {
        const link = document.createElement('a');
        link.href = provider.helpURL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Get ${provider.label} API key`;
        let descEl: HTMLElement | null = null;
        if ((apiKeySetting as any).components?.desc) {
            descEl = (apiKeySetting as any).components.desc;
        } else if ((apiKeySetting as any).controlEl) {
            descEl = (apiKeySetting as any).controlEl.querySelector('.setting-item-description');
        } else if ((apiKeySetting as any).settingEl) {
            descEl = (apiKeySetting as any).settingEl.querySelector('.setting-item-description');
        }
        if (descEl) {
            descEl.textContent = "";
            descEl.appendChild(link);
        }
      }
      let isRevealed = false;
      let apiKeyInput: HTMLInputElement;
      apiKeySetting.addText(text => {
        text.inputEl.type = 'password';
        apiKeyInput = text.inputEl;
        text.setPlaceholder('Enter API key...')
          .setValue(this.plugin.settings.apiKeys[provider.value] || "")
          .onChange(async (value: string) => {
            this.plugin.settings.apiKeys[provider.value] = value;
            for (const model of this.plugin.settings.models) {
              if (model.provider === provider.value && !model.apiKey) {
                model.apiKey = value;
              }
            }
            await this.plugin.saveSettings();
          });
      });
      apiKeySetting.addButton(btn => {
        btn.setButtonText('Reveal').onClick(() => {
          isRevealed = !isRevealed;
          apiKeyInput.type = isRevealed ? 'text' : 'password';
          btn.setButtonText(isRevealed ? 'Hide' : 'Reveal');
        });
      });
    }
  }

  private createModelsSettings(containerEl: HTMLElement): void {
    (containerEl as any).createEl('h3', {text: 'Models'});
    new Setting(containerEl)
      .setName('Default Model')
      .setDesc('Select the default model to use')
      .addDropdown(drop => {
        for (const model of this.plugin.settings.models) {
          drop.addOption(model.id, model.label || `${model.provider}: ${model.model}`);
        }
        drop.setValue(this.plugin.settings.defaultModelId);
        drop.onChange(async (value: string) => {
          this.plugin.settings.defaultModelId = value;
          await this.plugin.saveSettings();
        });
      });

    const modelsTable = document.createElement('table');
    modelsTable.className = 'mcp-settings-table';
    modelsTable.style.width = '100%';
    const header = modelsTable.createTHead();
    const headerRow = header.insertRow();
    headerRow.insertCell().textContent = 'Label';
    headerRow.insertCell().textContent = 'Provider';
    headerRow.insertCell().textContent = 'Model ID';
    headerRow.insertCell().textContent = 'Actions';

    const body = modelsTable.createTBody();
    for (const model of this.plugin.settings.models) {
      const row = body.insertRow();
      row.insertCell().textContent = model.label || model.id;
      row.insertCell().textContent = model.provider;
      row.insertCell().textContent = model.model;

      const actionsCell = row.insertCell();
      actionsCell.addClass('mcp-table-actions-cell');

      const editBtn = actionsCell.createEl('button', { cls: 'clickable-icon mcp-table-action-button' });
      editBtn.setAttribute('aria-label', 'Edit Model');
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      editBtn.onclick = () => {
        this.openModelEditModal(model);
      };

      const deleteBtn = actionsCell.createEl('button', { cls: 'clickable-icon mcp-table-action-button mod-warning' });
      deleteBtn.setAttribute('aria-label', 'Delete Model');
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
      deleteBtn.style.marginLeft = '8px';
      deleteBtn.onclick = async () => {
        if (this.plugin.settings.models.length <= 1) {
          new Notice("Cannot delete the last model.");
          return;
        }
        if (model.id === this.plugin.settings.defaultModelId) {
          new Notice("Cannot delete the default model. Please change the default model first.");
          return;
        }
        if (confirm(`Are you sure you want to delete model "${model.label || model.id}"?`)) {
            this.plugin.settings.models = this.plugin.settings.models.filter(m => m.id !== model.id);
            await this.plugin.saveSettings();
            const modelsTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.models-tab-content');
             if (modelsTabContent) {
                (modelsTabContent as any).empty();
                this.createModelsSettings(modelsTabContent as HTMLElement);
             } else {
                this.display();
             }
        }
      };
    }
    (containerEl as any).appendChild(modelsTable);

    new Setting(containerEl)
      .addButton(btn => {
        btn.setButtonText('Add Model').onClick(() => {
          this.openModelEditModal();
        });
      });
  }

  private createAgentsSettings(containerEl: HTMLElement): void {
    (containerEl as any).createEl('h3', {text: 'Agent Management'});
    const agentsTable = document.createElement('table');
    agentsTable.className = 'mcp-settings-table';
    agentsTable.style.width = '100%';
    const agentHeader = agentsTable.createTHead();
    const agentHeaderRow = agentHeader.insertRow();
    agentHeaderRow.insertCell().textContent = 'Name';
    agentHeaderRow.insertCell().textContent = 'Handle';
    agentHeaderRow.insertCell().textContent = 'Model';
    agentHeaderRow.insertCell().textContent = 'Actions';
    const agentBody = agentsTable.createTBody();

    for (const agent of this.plugin.settings.agents) {
      const row = agentBody.insertRow();
      row.insertCell().textContent = agent.name;
      row.insertCell().textContent = `@${agent.handle}`;
      const modelUsed = this.plugin.settings.models.find(m => m.id === agent.modelId);
      row.insertCell().textContent = modelUsed ? (modelUsed.label || modelUsed.id) : 'N/A';
      
      const actionsCell = row.insertCell();
      actionsCell.addClass('mcp-table-actions-cell');

      const editBtn = actionsCell.createEl('button', { cls: 'clickable-icon mcp-table-action-button' });
      editBtn.setAttribute('aria-label', 'Edit Agent');
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      editBtn.style.marginRight = '8px';
      editBtn.onclick = () => {
        this.openAgentEditModal(agent);
      };

      const deleteBtn = actionsCell.createEl('button', { cls: 'clickable-icon mcp-table-action-button mod-warning' });
      deleteBtn.setAttribute('aria-label', 'Delete Agent');
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
      deleteBtn.onclick = async () => {
        if (confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
          this.plugin.settings.agents = this.plugin.settings.agents.filter(a => a.id !== agent.id);
          await this.plugin.saveSettings();
          const agentsTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.agents-tab-content');
          if (agentsTabContent) {
            (agentsTabContent as any).empty();
            this.createAgentsSettings(agentsTabContent as HTMLElement);
          } else {
            this.display();
          }
          new Notice(`Agent "${agent.name}" deleted.`);
        }
      };
    }
    (containerEl as any).appendChild(agentsTable);

    new Setting(containerEl)
      .addButton(btn => {
        btn.setButtonText('Add Agent').onClick(() => {
          this.openAgentEditModal();
        });
      });
  }

  private createMCPSettings(containerEl: HTMLElement): void {
    // Built-in Tools Section
    (containerEl as any).createEl('h3', {text: 'Built-in Tools'});
    
    // Read File Tool
    new Setting(containerEl)
      .setName('Read File')
      .setDesc('Read the full markdown contents of a file in the current vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.read_file)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.read_file = value;
          await this.plugin.saveSettings();
        }));
    
    // Upsert Note Tool
    new Setting(containerEl)
      .setName('Create/Edit Note')
      .setDesc('Create or edit notes in the vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.upsert_note)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.upsert_note = value;
          await this.plugin.saveSettings();
        }));
    
    // Delete File Tool
    new Setting(containerEl)
      .setName('Delete File')
      .setDesc('Delete files from the vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.delete_file)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.delete_file = value;
          await this.plugin.saveSettings();
        }));
    
    // List Files by Tag Tool
    new Setting(containerEl)
      .setName('List Files by Tag')
      .setDesc('Find files containing specific tags')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.list_files_by_tag)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.list_files_by_tag = value;
          await this.plugin.saveSettings();
        }));
    
    // Get Active Note Tool
    new Setting(containerEl)
      .setName('Get Active Note')
      .setDesc('Access the currently open note')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.get_active_note)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.get_active_note = value;
          await this.plugin.saveSettings();
        }));
    
    // Get Vault Path Tool
    new Setting(containerEl)
      .setName('Get Vault Path')
      .setDesc('Get the filesystem path of the vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.get_vault_path)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.get_vault_path = value;
          await this.plugin.saveSettings();
        }));
    
    // Simple Search Tool
    new Setting(containerEl)
      .setName('Simple Search')
      .setDesc('Search for text across all notes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.simple_search)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.simple_search = value;
          await this.plugin.saveSettings();
        }));
    
    // Get Vault Structure Tool
    new Setting(containerEl)
      .setName('Get Vault Structure')
      .setDesc('Get a tree view of files and folders')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabledTools.get_vault_structure)
        .onChange(async (value: boolean) => {
          this.plugin.settings.enabledTools.get_vault_structure = value;
          await this.plugin.saveSettings();
        }));
    
    // MCP Server Configuration Section
    (containerEl as any).createEl('h3', {text: 'MCP Server Configuration'});
    
    // Predefined servers subsection
    (containerEl as any).createEl('h4', { text: 'Predefined Servers' });

    new Setting(containerEl)
      .setName('Memory Server')
      .setDesc('Claude Memory MCP Server (enables a memory.json file in plugin config for persistent memory across sessions)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useMemoryServer)
        .onChange(async (value: boolean) => {
          this.plugin.settings.useMemoryServer = value;
          await this.plugin.saveSettings();
          // Potentially re-initialize or notify the plugin about the change
          if (this.plugin.mcpClient && this.plugin.mcpClient.updateConfiguration) {
            // We might need a way to tell Langgraph.ts to re-evaluate its mcpConfig
            // For now, just saving. Langgraph will pick it up on next full init.
          }
          // Refresh the MCP settings tab to show/hide custom config if needed (though this toggle doesn't directly control that)
          const mcpTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.tools-mcps-tab-content');
          if (mcpTabContent) {
              (mcpTabContent as any).empty();
              this.createMCPSettings(mcpTabContent as HTMLElement);
          } else { this.display(); }
        }));
    
    new Setting(containerEl)
      .setName('Use Custom MCP Configuration')
      .setDesc('Enable to define your own MCP servers or override predefined ones using JSON.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useCustomConfig)
        .onChange(async (value: boolean) => {
          this.plugin.settings.useCustomConfig = value;
          // If enabling MCP, also enable filesystem server by default -- THIS LOGIC MIGHT NEED REVISION
          // if (value) {
          //   this.plugin.settings.useFilesystemServer = true; 
          // }
          const mcpTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.tools-mcps-tab-content');
          if (mcpTabContent) {
              (mcpTabContent as any).empty();
              this.createMCPSettings(mcpTabContent as HTMLElement);
          } else { this.display(); }
          await this.plugin.saveSettings();
          if (this.plugin.mcpClient && this.plugin.mcpClient.updateConfiguration) {
            this.plugin.mcpClient.updateConfiguration(this.plugin.settings);
          }
        }));
    
    if (this.plugin.settings.useCustomConfig) {
      // Manually create the setting title for "MCP Configuration"
      const titleEl = containerEl.createEl('div', { cls: 'setting-item' });
      const titleInfoEl = titleEl.createDiv({ cls: 'setting-item-info' });
      titleInfoEl.createDiv({ cls: 'setting-item-name', text: 'MCP Configuration' });

      const textareaContainer = containerEl.createDiv();
      textareaContainer.addClass('mcp-config-textarea');
      (textareaContainer as HTMLElement).style.width = '100%';
      (textareaContainer as HTMLElement).style.marginBottom = '10px';

      const textarea = textareaContainer.createEl('textarea', {
        attr: {
          rows: '15',
          style: 'width: 100%; font-family: monospace;'
        },
        text: this.plugin.settings.customServerConfig
      });
      textarea.addEventListener('change', async (e: Event) => {
        const target = e.target as HTMLTextAreaElement;
        this.plugin.settings.customServerConfig = target.value;
        await this.plugin.saveSettings();
        if (this.plugin.mcpClient && this.plugin.mcpClient.updateConfiguration) {
            this.plugin.mcpClient.updateConfiguration(this.plugin.settings);
          }
      });

      const helpDiv = containerEl.createDiv({cls: 'setting-item-description'});
      (helpDiv as HTMLElement).style.width = '100%';
      helpDiv.innerHTML = `
        <p>Define custom MCP server configurations. If "Use Custom MCP Configuration" is enabled, this JSON will be the primary source for MCP servers.</p>
        <p>If "Memory Server" is enabled and "Use Custom MCP Configuration" is also enabled, the memory server config will be merged if not explicitly defined in this JSON.</p>
        <p>Example configuration:</p>
        <pre style="width: 100%; white-space: pre-wrap; word-break: break-all; background-color: var(--background-secondary); padding: 10px; border-radius: var(--radius-m);">
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/your/directory"],
    "transport": "stdio"
  }
}
        </pre>
        <p>Each key represents a server name that can be used by the LLM.</p>
      `;
    }
  }

  openModelEditModal = (model?: ModelConfig) => {
    const isNew = !model;
    const editingModel = model ? { ...model } : {
      id: `model-${Date.now()}`,
      provider: PROVIDERS[0].value,
      model: '',
      label: '',
      apiKey: this.plugin.settings.apiKeys[PROVIDERS[0].value] || '',
      endpointUrl: PROVIDERS[0].defaultEndpoint,
      temperature: 0.7,
      customOptions: {},
    };
    const modal = new ModelEditModal(this.app, editingModel, PROVIDERS, this.plugin.settings.apiKeys, async (result) => {
      if (result) {
        if (isNew) {
          this.plugin.settings.models.push(result);
        } else {
          const idx = this.plugin.settings.models.findIndex(m => m.id === result.id);
          if (idx !== -1) this.plugin.settings.models[idx] = result;
        }
        await this.plugin.saveSettings();
        const modelsTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.models-tab-content');
        if (modelsTabContent) {
            (modelsTabContent as any).empty();
            this.createModelsSettings(modelsTabContent as HTMLElement);
        } else {
            this.display();
        }
      }
    });
    modal.open();
  };

  openAgentEditModal = (agent?: AgentConfig) => {
    const isNew = !agent;
    const editingAgent = agent ? { ...agent } : {
      id: `agent-${Date.now()}`,
      name: '',
      handle: '',
      modelId: this.plugin.settings.models.length > 0 ? this.plugin.settings.models[0].id : '',
      systemPrompt: '',
    };
    const modal = new AgentEditModal(this.app, editingAgent, this.plugin.settings.models, async (result) => {
      if (result) {
        if (isNew) {
          this.plugin.settings.agents.push(result);
        } else {
          const idx = this.plugin.settings.agents.findIndex(a => a.id === result.id);
          if (idx !== -1) this.plugin.settings.agents[idx] = result;
        }
        await this.plugin.saveSettings();
        const agentsTabContent = (this.contentBaseEl as HTMLElement).querySelector('.mcp-settings-tab-pane.agents-tab-content');
        if (agentsTabContent) {
            (agentsTabContent as any).empty();
            this.createAgentsSettings(agentsTabContent as HTMLElement);
        } else {
            this.display();
        }
      }
    });
    modal.open();
  };
}

function generateAgentHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 50);
}

class AgentEditModal extends Modal {
  agent: AgentConfig;
  allModels: ModelConfig[];
  onSubmit: (result: AgentConfig | null) => void;
  isNew: boolean;
  originalHandle?: string; 
  private handleTextComponent: TextComponent | null = null; 

  constructor(app: App, agentConfig: Partial<AgentConfig> | undefined, allModels: ModelConfig[], onSubmit: (result: AgentConfig | null) => void) {
    super(app);
    this.allModels = allModels;
    this.onSubmit = onSubmit;
    this.isNew = !agentConfig || !agentConfig.id;

    if (this.isNew) {
      this.agent = {
        id: `agent-${Date.now()}`,
        name: '',
        handle: '',
        modelId: allModels.length > 0 ? allModels[0].id : '',
        systemPrompt: '',
        ...agentConfig,
      };
    } else {
      this.agent = { ...(agentConfig as AgentConfig) };
      this.originalHandle = this.agent.handle;
    }
    if (!this.agent.handle && this.agent.name) {
      this.agent.handle = generateAgentHandle(this.agent.name);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.isNew ? 'Add Agent' : 'Edit Agent' });

    new Setting(contentEl)
      .setName('Name')
      .setDesc('The display name for the agent.')
      .addText(text => text
        .setPlaceholder('My Custom Agent')
        .setValue(this.agent.name)
        .onChange(value => {
          this.agent.name = value;
          if (!this.originalHandle || this.agent.handle === generateAgentHandle(this.agent.name === value ? "" : this.agent.name.substring(0, this.agent.name.length - value.length))) {
             this.agent.handle = generateAgentHandle(value);
          }
          if (this.handleTextComponent) {
            this.handleTextComponent.setValue(this.agent.handle);
          }
        }));

    new Setting(contentEl)
      .setName('Handle')
      .setDesc('Used to invoke the agent (e.g., @handle). Can be customized.')
      .addText(text => {
        this.handleTextComponent = text; 
        text.setValue(this.agent.handle)
            .onChange(value => {
                this.agent.handle = value.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0,50);
                if (this.handleTextComponent && this.handleTextComponent.getValue() !== this.agent.handle) {
                     this.handleTextComponent.setValue(this.agent.handle);
                }
                this.originalHandle = this.agent.handle;
            });
      });
      
    if (this.allModels.length > 0) {
      new Setting(contentEl)
        .setName('Model')
        .setDesc('The language model this agent will use.')
        .addDropdown(drop => {
          this.allModels.forEach(model => {
            drop.addOption(model.id, model.label || `${model.provider}: ${model.model}`);
          });
          drop.setValue(this.agent.modelId || this.allModels[0].id);
          drop.onChange(value => {
            this.agent.modelId = value;
          });
        });
    } else {
      contentEl.createEl('p', {text: 'No models configured. Please add a model before creating an agent.'});
    }

    // --- Refactored System Prompt Section ---
    const systemPromptSettingEl = contentEl.createDiv({ cls: 'setting-item' });
    (systemPromptSettingEl as HTMLElement).style.flexDirection = 'column';
    (systemPromptSettingEl as HTMLElement).style.alignItems = 'flex-start';

    const systemPromptInfoEl = systemPromptSettingEl.createDiv({ cls: 'setting-item-info' });
    systemPromptInfoEl.createDiv({ cls: 'setting-item-name', text: 'System Prompt' });
    systemPromptInfoEl.createDiv({ cls: 'setting-item-description', text: 'Custom instructions that define how this agent behaves.' });

    const systemPromptControlEl = systemPromptSettingEl.createDiv({ cls: 'setting-item-control' });
    (systemPromptControlEl as HTMLElement).style.width = '100%';
    (systemPromptControlEl as HTMLElement).style.marginLeft = '0'; // Override default margin
    (systemPromptControlEl as HTMLElement).style.marginTop = 'var(--size-4-2)'; // Add some space above

    const systemPromptTextarea = systemPromptControlEl.createEl('textarea') as HTMLTextAreaElement;
    systemPromptTextarea.placeholder = 'You are a specialized assistant for...';
    systemPromptTextarea.value = this.agent.systemPrompt;
    systemPromptTextarea.rows = 8;
    (systemPromptTextarea as HTMLElement).style.width = '100%';
    (systemPromptTextarea as HTMLElement).style.fontFamily = 'var(--font-monospace)';
    (systemPromptTextarea as HTMLElement).style.border = '1px solid var(--background-modifier-border)';
    (systemPromptTextarea as HTMLElement).style.borderRadius = 'var(--radius-s)';
    (systemPromptTextarea as HTMLElement).style.padding = 'var(--size-2-2)'; 
    (systemPromptTextarea as HTMLElement).style.backgroundColor = 'var(--background-secondary)';

    systemPromptTextarea.addEventListener('change', (e) => {
        this.agent.systemPrompt = (e.target as HTMLTextAreaElement).value;
    });
    // --- End of Refactored System Prompt Section ---

    const buttonRow = contentEl.createDiv({ cls: 'modal-button-row' });
    (buttonRow as HTMLElement).style.marginTop = '20px';
    (buttonRow as HTMLElement).style.display = 'flex';
    (buttonRow as HTMLElement).style.justifyContent = 'flex-end';

    const confirmButton = buttonRow.createEl('button', { 
      text: this.isNew ? 'Add Agent' : 'Save Changes',
      cls: 'mod-cta' 
    });
    (confirmButton as HTMLElement).style.marginLeft = '10px';
    confirmButton.addEventListener('click', () => {
      if (!this.agent.name.trim()) {
        new Notice("Agent name cannot be empty.");
        return;
      }
      if (!this.agent.handle.trim()) {
        new Notice("Agent handle cannot be empty.");
        return;
      }
      const existingAgents = ((this.app as any).plugins.plugins['langchain-mcp']?.settings as MCPAssistantSettings)?.agents || [];
      if (this.isNew || (this.originalHandle !== this.agent.handle)) {
          if (existingAgents.some(a => a.handle === this.agent.handle && a.id !== this.agent.id)) {
              new Notice(`Agent handle "@${this.agent.handle}" is already in use. Please choose a unique handle.`);
              return;
          }
      }
      if (!this.agent.modelId && this.allModels.length > 0) {
        new Notice("Please select a model for the agent.");
        return;
      }
      if (this.allModels.length === 0) {
          new Notice("Cannot save agent: No models available. Please configure models first.");
          return;
      }
      this.close();
      this.onSubmit(this.agent);
    });

    const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
        this.close();
        this.onSubmit(null);
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ModelEditModal extends Modal {
  model: ModelConfig;
  providers: typeof PROVIDERS;
  apiKeys: ApiKeyStore;
  onSubmit: (result: ModelConfig | null) => void;
  isRevealed: boolean = false;
  apiKeyInput?: HTMLInputElement;

  constructor(app: App, model: ModelConfig, providers: typeof PROVIDERS, apiKeys: ApiKeyStore, onSubmit: (result: ModelConfig | null) => void) {
    super(app);
    this.model = { ...model };
    if (!this.model.customOptions) this.model.customOptions = {};
    this.providers = providers;
    this.apiKeys = apiKeys;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.model.label || this.model.id !== `model-${Date.now()}` ? 'Edit Model' : 'Add Model' });

    new Setting(contentEl)
      .setName('Label')
      .setDesc('A user-friendly name for this model configuration (e.g., "My GPT-4 Turbo"). Optional.')
      .addText(text => text.setValue(this.model.label || '').onChange(val => this.model.label = val));
    
    new Setting(contentEl)
      .setName('Provider')
      .addDropdown(drop => {
        for (const provider of this.providers) {
          drop.addOption(provider.value, provider.label);
        }
        drop.setValue(this.model.provider);
        drop.onChange(val => {
          this.model.provider = val;
          const providerMeta = this.providers.find(p => p.value === val);
          if (this.apiKeys[val] && !this.model.apiKey) {
             this.model.apiKey = this.apiKeys[val];
          }
          if (providerMeta) {
            this.model.endpointUrl = providerMeta.defaultEndpoint;
          }
          this.onOpen(); 
        });
      });
    
    new Setting(contentEl)
      .setName('Model ID / Name')
      .setDesc('The exact model identifier as required by the provider (e.g., "gpt-4-turbo-preview", "claude-2", "gemini-pro").')
      .addText(text => text.setValue(this.model.model).onChange(val => this.model.model = val));
    
    const apiKeySetting = new Setting(contentEl)
      .setName('API Key (optional for this model)')
      .setDesc('If blank, the global API key for this provider will be used. Fill this to override for this specific model.');
    apiKeySetting.addText(text => {
      text.inputEl.type = this.isRevealed ? 'text' : 'password';
      this.apiKeyInput = text.inputEl;
      text.setPlaceholder('Provider-level key will be used if blank')
        .setValue(this.model.apiKey || '')
        .onChange(val => this.model.apiKey = val);
    });
    apiKeySetting.addButton(btn => {
      btn.setButtonText(this.isRevealed ? 'Hide' : 'Reveal').onClick(() => {
        this.isRevealed = !this.isRevealed;
        if (this.apiKeyInput) {
          this.apiKeyInput.type = this.isRevealed ? 'text' : 'password';
        }
        btn.setButtonText(this.isRevealed ? 'Hide' : 'Reveal');
      });
    });
    
    new Setting(contentEl)
      .setName('Endpoint URL (optional)')
      .setDesc('If different from the provider\'s default (e.g., for self-hosted or proxy).')
      .addText(text => text.setValue(this.model.endpointUrl || '').onChange(val => this.model.endpointUrl = val));
    
    new Setting(contentEl)
      .setName('Temperature (optional)')
      .setDesc('Controls randomness. Lower for more deterministic, higher for more creative. (e.g. 0.7)')
      .addText(text => text.setValue(this.model.temperature !== undefined ? String(this.model.temperature) : '').onChange(val => {
        const num = parseFloat(val);
        this.model.temperature = !isNaN(num) && num >= 0 && num <=2 ? num : undefined;
      }));

    new Setting(contentEl)
      .setName('Custom LLM Options (JSON, optional)')
      .setDesc('Additional parameters to pass to the LLM, as a JSON string. E.g., {"max_tokens": 1000, "top_p": 0.9}')
      .addTextArea(text => {
          text.setValue(this.model.customOptions ? JSON.stringify(this.model.customOptions, null, 2) : '{}')
              .onChange(val => {
                  try {
                      this.model.customOptions = val ? JSON.parse(val) : {};
                  } catch (e) {
                      new Notice('Invalid JSON for custom options.');
                  }
              });
          text.inputEl.rows = 3;
          text.inputEl.style.fontFamily = 'monospace';
      });

    const btnRow = contentEl.createDiv({ cls: 'modal-button-row' });
    btnRow.createEl('button', { text: 'Confirm', cls: 'mod-cta' }).addEventListener('click', () => {
        if (!this.model.model.trim()) {
            new Notice("Model ID / Name cannot be empty.");
            return;
        }
      this.close();
      this.onSubmit(this.model);
    });
    btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
      this.close();
      this.onSubmit(null);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
} 