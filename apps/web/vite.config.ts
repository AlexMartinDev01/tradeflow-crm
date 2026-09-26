import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins:[vue()],
  base:process.env.VITE_BASE_PATH||'/',
  server:{port:5173},
  build:{
    rollupOptions:{
      output:{
        manualChunks(id){
          if(!id.includes('node_modules'))return;
          if(id.includes('/echarts/')||id.includes('/zrender/'))return 'vendor-echarts';
          if(id.includes('/element-plus/')||id.includes('/@element-plus/'))return 'vendor-element-plus';
          if(id.includes('/vue/')||id.includes('/@vue/')||id.includes('/vue-router/')||id.includes('/pinia/'))return 'vendor-vue';
          if(id.includes('/axios/'))return 'vendor-http';
        }
      }
    }
  }
});
