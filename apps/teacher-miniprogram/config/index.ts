import { defineConfig } from '@tarojs/cli';
import { resolve } from 'node:path';

const apiOrigin = process.env.TARO_APP_API_ORIGIN || 'http://127.0.0.1:3000/api/v1';
const socketOrigin = process.env.TARO_APP_SOCKET_ORIGIN || apiOrigin.replace(/\/api\/v1\/?$/, '');

export default defineConfig(async () => ({
  projectName: 'teacher-miniprogram',
  date: '2026-10-08',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-framework-react'],
  framework: 'react',
  env: {
    TARO_APP_API_ORIGIN: JSON.stringify(apiOrigin),
    TARO_APP_SOCKET_ORIGIN: JSON.stringify(socketOrigin),
  },
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  mini: {
    webpackChain(chain) {
      chain.resolve.alias.set('@', resolve(process.cwd(), 'src'));
    },
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
  h5: { publicPath: '/', staticDirectory: 'static' },
}));
