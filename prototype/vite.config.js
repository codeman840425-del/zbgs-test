import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        recordConsumer: fileURLToPath(new URL("./record-consumer.html", import.meta.url)),
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        foundation: fileURLToPath(
          new URL("./foundation.html", import.meta.url),
        ),
      },
    },
  },
});
