// tools.ts
import { DynamicStructuredTool, Tool } from "@langchain/core/tools";
import { App, TFile,TFolder, FileSystemAdapter, prepareSimpleSearch, TAbstractFile } from "obsidian";
import { z } from "zod";
import * as path from 'path';
// Helpers
const getFile = (app: App, path: string) =>
  app.vault.getAbstractFileByPath(path) as TFile;


// 1. read_file
export const readFileTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
  name: "read_file",
  description: "Read the full markdown contents of a file in the current vault",
  schema: z.object({ path: z.string().describe("Absolute vault‑relative path") }),
  func: async ({ path }) => {
    const file = getFile(app, path);
    if (!file) throw new Error(`File not found: ${path}`);
    return await app.vault.read(file); // Vault.read :contentReference[oaicite:7]{index=7}
  },
});

  // 2. write_file  ── also opens the note in a new tab
  export const upsertNoteTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
    name: "upsert_note",
    description: `
Create or overwrite a note *or* patch a specific heading.
—Provide **heading** to patch; leave it blank to overwrite the whole file.
—**operation** applies only when heading is given ("append" | "prepend" | "replace").
After saving the file is opened for the user.`,
    schema: z.object({
      path: z.string().describe("Vault-relative path, e.g. Projects/Idea.md"),
      content: z.string().describe("Markdown to write or insert"),
      heading: z.string().optional().nullable().describe("Target heading (omit to overwrite whole note)"),
      operation: z
        .enum(["append", "prepend", "replace"])
        .optional()
        .nullable()
        .default("append")
        .describe("How to insert when heading is given"),
      delimiter: z
        .string()
        .optional()
        .nullable()
        .default("::")
        .describe("Heading delimiter when headings are given as 'H1::H2'"),
    }),
    func: async ({ path: p, content, heading, operation, delimiter }) => {
      /* 1. Ensure parent folders exist */
      await app.vault.createFolder(path.dirname(p)).catch(() => {});

      /* 2. If *no heading* ⇒ overwrite/create */
      if (!heading) {
        const file = getFile(app, p);
        if (file) await app.vault.modify(file, content);
        else await app.vault.create(p, content);
      } else {
        /* 3. With heading ⇒ patch that section */
        const file = getFile(app, p);
        if (!file) throw new Error("File not found");

        const md = await app.vault.read(file);
        const lines = md.split("\n");
        const headingParts = heading.split(delimiter);
        const start = lines.findIndex((l) =>
          l.replace(/^#+\s*/, "") === headingParts.at(-1)
        );
        if (start === -1) throw new Error("Heading not found");

        const end =
          lines
            .slice(start + 1)
            .findIndex((l) => l.match(/^#+\s/)) + start + 1 ||
          lines.length;
        const body = lines.slice(start + 1, end);

        if (operation === "replace") body.length = 0;
        if (operation === "prepend") body.unshift(content);
        else body.push(content);

        const patched = [
          ...lines.slice(0, start + 1),
          ...body,
          ...lines.slice(end),
        ].join("\n");
        await app.vault.adapter.write(p, patched);
      }

      /* 4. Show result in a new tab */
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(getFile(app, p), { active: true });

      return heading
        ? `✅ Patched "${heading}" in ${p}`
        : `✅ Wrote ${p}`;
    },
  });
// 3. delete_file
  export const deleteFileTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
      name: "delete_file",
      description:
        "Delete a file permanently from the vault (no recycle bin!). Returns 'deleted'.",
      schema: z.object({ path: z.string() }),
      func: async ({ path: p }) => {
        if (!(await app.vault.adapter.exists(p)))
          throw new Error("File does not exist");
        await app.vault.adapter.remove(p);
        return "deleted";
      },
    });
  
// 4. list_files_by_tag
export const listByTagTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
  name: "list_files_by_tag",
  description: "Return all files that contain a given #tag",
  schema: z.object({ tag: z.string() }),
  func: async ({ tag }) => {
    const results: string[] = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const cache = app.metadataCache.getFileCache(f); // getFileCache :contentReference[oaicite:9]{index=9}
      if (cache?.tags?.some(t => t.tag === `#${tag}`)) results.push(f.path);
    }
    return results;
  },
});

// 5. get_active_note
export const getActiveNoteTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
  name: "get_active_note",
  description: "Return path and content of the note currently visible to the user. User can refer to this note in their queries as 'this note','the note' or 'the current note'.",
  schema: z.object({}),
  func: async () => {
    const f = app.workspace.getActiveFile();
    return f ? { content: await app.vault.read(f), path: f.path } : null;
  },
});

// 6. get_vault_path
export const getVaultPathTool = (app: App): DynamicStructuredTool =>
  new DynamicStructuredTool({
    name: "get_vault_path",
    description:
      "Return the absolute filesystem path of the current vault root (desktop only).",
    schema: z.object({}),
    func: async () => {
      const adapter = app.vault.adapter;
      if (adapter instanceof FileSystemAdapter) {
        return adapter.getBasePath();          // desktop → e.g. "C:/Users/Nikola/Documents/Notes"
      }
      throw new Error(
        "Vault path is unavailable on mobile/web (no FileSystemAdapter)."
      );
    },
  }); 

export const simpleSearchTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
    name: "simple_search",
    description: `
Search every Markdown note for a plain-text query.
• Returns at most **max_results** items (default 10).  
• Each item includes the match **score** (lower is better) and a **snippet** of ±context_length characters (default 100).  
Use this to locate candidate notes, then call "read_file" if you need the full content.`,
    schema: z.object({
      query: z.string(),
      max_results: z.number().int().min(1).optional().nullable().default(10),
      context_length: z.number().int().min(1).optional().nullable().default(100),
    }),
    func: async ({ query, max_results, context_length }) => {
      /** 1️⃣  build the search callback once */
      const search = prepareSimpleSearch(query);

      /** 2️⃣  scan all markdown files (cachedRead = zero disk) */
      const results = [];
      for (const file of app.vault.getMarkdownFiles()) {
        const text = await app.vault.cachedRead(file);
        const res = search(text);
        if (!res) continue;

        /* collect context around each *first* match only */
        const [start, end] = res.matches[0];
        const snippet = text.slice(
          Math.max(0, start - context_length),
          end + context_length
        );
        results.push({
          path: file.path,
          score: res.score,
          snippet: snippet.replace(/\n/g, " "),
        });
      }

      /** 3️⃣  return the top-N by score */
      results.sort((a, b) => a.score - b.score);
      return results.slice(0, max_results);
    },
  });

export const getVaultStructureTool = (app: App): DynamicStructuredTool => new DynamicStructuredTool({
    name: "get_vault_structure",
    description: `
Return a tree-outline of files and folders.
• If **root** is omitted, the whole vault is scanned.  
• **max_depth** (default 2) limits how deep we recurse.  
• **max_items** (default 100) caps total lines returned.  
Indentation (└─, ├─) shows hierarchy so the agent can reason about location.`,
    schema: z.object({
      root: z.string().optional().nullable(),
      max_depth: z.number().int().min(1).optional().nullable().default(4),
      max_items: z.number().int().min(1).optional().nullable().default(100),
    }),
    func: async ({ root, max_depth, max_items }) => {
      const rootFolder: TFolder = root
        ? (app.vault.getAbstractFileByPath(root) as TFolder)
        : app.vault.getRoot();
      if (!rootFolder) throw new Error("Root path not found or not folder");

      const lines: string[] = [];
      /** Recursive DFS with guards */
      const walk = (
        node: TAbstractFile,
        depth: number,
        prefix: string = ""
      ) => {
        if (lines.length >= max_items) return;
        const bullet =
          depth === 0
            ? ""
            : depth === 1
            ? "├─ "
            : "│  ".repeat(depth - 1) + "└─ ";
        lines.push(bullet + node.name);
        if (
          node instanceof TFolder &&
          depth < max_depth
        ) {
          node.children.forEach((child) => walk(child, depth + 1));
        }
      };

      walk(rootFolder, 0);
      return lines.join("\n");
    },
  });