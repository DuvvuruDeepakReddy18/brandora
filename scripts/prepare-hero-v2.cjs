// Assemble the standalone public hero without app data or backend credentials.
const fs = require("node:fs");
const path = require("node:path");
const source = path.resolve(__dirname, "..");
const target = path.join(source, ".local", "brandora-hero-v2");
fs.mkdirSync(path.join(target, "app", "components"), { recursive: true });
const write = (file, data) => fs.writeFileSync(path.join(target, file), data);
for (const file of ["case-inspector.ts", "case-landing.css"]) {
  fs.copyFileSync(
    path.join(source, "app", "components", file),
    path.join(target, "app", "components", file),
  );
}
let landing = fs.readFileSync(
  path.join(source, "app", "components", "case-landing.tsx"),
  "utf8",
);
write("app/components/case-landing.tsx", landing);
fs.copyFileSync(
  path.join(source, "app", "layout.tsx"),
  path.join(target, "app", "layout.tsx"),
);
const globals = fs.readFileSync(
  path.join(source, "app", "globals.css"),
  "utf8",
);
const reset = globals.slice(
  0,
  globals.indexOf("input,\nselect,", globals.indexOf("h4 {")) > 0
    ? globals.indexOf("input,\nselect,", globals.indexOf("h4 {"))
    : globals.indexOf("input,\r\nselect,", globals.indexOf("h4 {")),
);
const logoStart = globals.indexOf(".logo {"),
  logoEnd = globals.indexOf(".button {", logoStart);
write("app/globals.css", reset + "\n" + globals.slice(logoStart, logoEnd));
write(
  "app/page.tsx",
  `"use client";
import { LandingPage } from "./components/case-landing";
function Logo() { return <div className="logo"><span className="logo-mark"><i/><i/><i/></span><span>brandora<span className="logo-dot">.</span></span></div>; }
export default function Home() { return <LandingPage standalone logo={<Logo/>} onExplore={()=>{}} demoAvailable={true} busy={false} error="">{null}</LandingPage>; }
`,
);
const dependencies = {};
for (const name of [
  "@fontsource/dm-sans",
  "@fontsource/newsreader",
  "lucide-react",
  "next",
  "react",
  "react-dom",
  "three",
]) {
  dependencies[name] = JSON.parse(
    fs.readFileSync(
      path.join(source, "node_modules", name, "package.json"),
      "utf8",
    ),
  ).version;
}
const devDependencies = {};
for (const name of [
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@types/three",
  "typescript",
]) {
  devDependencies[name] = JSON.parse(
    fs.readFileSync(
      path.join(source, "node_modules", name, "package.json"),
      "utf8",
    ),
  ).version;
}
write(
  "package.json",
  JSON.stringify(
    {
      name: "brandora-hero-v2",
      version: "1.0.0",
      private: true,
      scripts: { build: "next build", dev: "next dev" },
      dependencies,
      devDependencies,
    },
    null,
    2,
  ),
);
write(
  "next.config.ts",
  `import type { NextConfig } from "next";
const config: NextConfig = { output: "export", turbopack: { root: process.env.BRANDORA_HERO_BUILD_ROOT || process.cwd() } };
export default config;
`,
);
fs.copyFileSync(
  path.join(source, "tsconfig.json"),
  path.join(target, "tsconfig.json"),
);
write(
  "vercel.json",
  JSON.stringify(
    {
      framework: "nextjs",
      buildCommand: "npm run build",
      installCommand: "npm install",
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
write(
  ".vercelignore",
  "node_modules\n.next\nout\n.env*\n*.log\n*.tsbuildinfo\n",
);
write(
  "README.md",
  "# Brandora Hero v2\n\nStandalone case-library landing page. The workflow is illustrative and human approval is an on-page example. No backend, authentication, database or AI-provider credentials are deployed.\n\nGenerated from the Brandora case library using scripts/prepare-hero-v2.cjs.\n",
);
console.log(target);
