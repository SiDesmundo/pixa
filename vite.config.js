import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { npcAiPlugin } from "./server/npcAiPlugin.js";

export default defineConfig({
  plugins: [react(), npcAiPlugin()],
});
