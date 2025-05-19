import 'obsidian';

export interface Message {
  id: string;
  role: string;
  content: string | any;
  isLoading?: boolean;
  timestamp?: number;
  agentId?: string;
  isToolCall?: boolean;
  toolCallId?: string;
  isRenderedOnce?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  lastUpdated: number;
  messages: Message[];
  lastUsedAgentId?: string;
}

declare module 'obsidian' {
  interface ObsidianHTMLElement extends HTMLElement {
    empty(): void;
    addClass(className: string): void;
    createDiv(className?: string): ObsidianHTMLElement;
    createDiv(options: any): ObsidianHTMLElement;
    createEl(tagName: string, options?: any): ObsidianHTMLElement;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    innerHTML: string;
  }
  
  // Extend the HTMLElement interface for type compatibility
  interface HTMLElement {
    empty(): void;
    addClass(className: string): void;
    createDiv(className?: string): ObsidianHTMLElement;
    createDiv(options: any): ObsidianHTMLElement;
    createEl(tagName: string, options?: any): ObsidianHTMLElement;
  }
  
  // Add Menu class definition
  class Menu {
    constructor();
    addItem(callback: (item: MenuItem) => any): this;
    addSeparator(): this;
    showAtPosition(position: { x: number; y: number }): this;
    hide(): this;
  }
  
  interface MenuItem {
    setTitle(title: string): this;
    setIcon(icon: string): this;
    onClick(callback: () => any): this;
  }
  
  // Add MarkdownRenderer class definition
  class MarkdownRenderer {
    static renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: any): void;
  }
} 