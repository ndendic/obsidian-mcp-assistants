import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv[2] === "production";
const watch = !prod && process.argv[2] === "watch";

// List of Node.js built-ins that need to be marked as external
const nodeBuiltins = [
  "async_hooks",
  "stream",
  "process",
  "path",
  "fs",
  "os",
  "util",
  "events",
  "http",
  "https",
  "crypto",
  "url",
  "child_process",
  "buffer",
  "assert"
];

// Add the node: prefix to each built-in module
const nodeBuiltinsWithPrefix = nodeBuiltins.map(lib => `node:${lib}`);

const buildMain = async () => {
  try {
    const ctx = await esbuild.context({
      banner: {
        js: banner,
      },
      entryPoints: ["src/main.ts"],
      bundle: true,
      external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtins,
        ...nodeBuiltins,
        ...nodeBuiltinsWithPrefix
      ],
      format: "cjs",
      target: "es2018",
      platform: "node",
      logLevel: "info",
      sourcemap: prod ? false : "inline",
      treeShaking: true,
      outfile: "main.js",
    });
    
    if (watch) {
      await ctx.watch();
      console.log("👀 Watching main for changes...");
    } else {
      await ctx.rebuild();
      await ctx.dispose();
      console.log("✅ Main build complete");
    }
  } catch (err) {
    console.error("❌ Error building main:", err);
    process.exit(1);
  }
};

// Run builds
(async () => {
  if (watch) {
    // In watch mode, run the main builder and keep watching
    console.log("🔄 Starting watch mode...");
    await buildMain();
  } else {
    // In normal mode, run build once
    try {
      await buildMain();
    } catch (err) {
      // Error is caught and logged within buildMain, process exits there.
    }
  }
})(); 