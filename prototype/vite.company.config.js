import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
export default defineConfig({publicDir:false,build:{outDir:'dist-company',rollupOptions:{input:{company:fileURLToPath(new URL('./company.html',import.meta.url))}}},plugins:[{name:'company-dependencies',async closeBundle(){
  const root=fileURLToPath(new URL('.',import.meta.url));
  await fs.copyFile(`${root}/public/company-build-info.json`,`${root}/dist-company/company-build-info.json`);
  try{await fs.cp(`${root}/public/company-assets`,`${root}/dist-company/company-assets`,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
}}]});
