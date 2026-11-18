import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const prototype = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-company',
    rollupOptions: {input: {company: path.join(prototype, 'company.html')}},
  },
  plugins: [{
    name: 'company-dependencies',
    async writeBundle(options) {
      const directory = options.dir;
      await fs.copyFile(path.join(prototype, 'public/company-build-info.json'), path.join(directory, 'company-build-info.json'));
      try {
        await fs.cp(path.join(prototype, 'public/company-assets'), path.join(directory, 'company-assets'), {recursive: true});
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  }],
});
