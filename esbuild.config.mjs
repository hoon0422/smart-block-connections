import esbuild from "esbuild";
import fs from "fs";

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
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
  ],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: false,
  treeShaking: true,
  logLevel: "info",
});

if (isWatch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();

  // Copy manifest.json and styles.css to dist
  fs.mkdirSync("dist", { recursive: true });
  fs.copyFileSync("manifest.json", "dist/manifest.json");
  if (fs.existsSync("styles.css")) {
    fs.copyFileSync("styles.css", "dist/styles.css");
  }
}
