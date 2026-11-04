// Bundles the action and the CLI into dist/, dependencies included (their licence comments kept).
// dist/ is committed: the action runs from it. CI checks it matches the sources.
import { build } from "esbuild";

await build({
  entryPoints: { action: "src/action.ts", cli: "src/cli.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  legalComments: "eof",
  // Bundled CommonJS dependencies may call require().
  banner: {
    js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
});
