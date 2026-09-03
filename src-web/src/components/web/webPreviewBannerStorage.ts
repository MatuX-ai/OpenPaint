/**
 * WebPreviewBanner 持久化常量。
 *
 * 单独抽到模块，避免在 Vue `<script setup>` 中触发
 * "ES module exports are not allowed" 编译错误。
 */

export const STORAGE_KEY = 'openpaint.web-preview-banner.dismissed.v1';
