/**
 * OpenPaint 前端路由
 *
 * Web 预览站点首页为产品推荐说明页（Landing），点击 CTA 后进入 /app 体验
 * 交互演示。桌面端（Tauri）直接重定向到 /app，不展示落地页。
 */

import { createRouter, createWebHashHistory } from 'vue-router';
import { isTauri } from '@api/runtime';
import LandingView from '@/views/LandingView.vue';
import AppView from '@/views/AppView.vue';

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: LandingView,
    meta: { public: true },
  },
  {
    path: '/app',
    name: 'App',
    component: AppView,
  },
  {
    // 404 兜底：未匹配的路径一律回到营销首页，避免白屏。
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  // 桌面端用户已安装应用，直接进入编辑器，跳过营销页。
  if (isTauri() && to.path === '/') {
    return { path: '/app' };
  }
});

export default router;
