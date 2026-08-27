// 浏览器端空 stub：替代 source-map-js/lib/source-map-generator.js。
//
// css-tree / postcss 会在生成 CSS 时调用 SourceMapGenerator.addMapping(...)，
// 用于把 AST 节点映射回源码位置。我们这套产线不需要 CSS 源码映射（CanvasKit
// / OpenPencil 才是主路径），这里提供一个完整形态的 no-op 占位，避免
// 因为模块路径（lib/source-map-generator.js）绕过 Vite 的 esbuild 预构建
// 优化、试图以 ESM named import 加载 CommonJS 文件而挂掉整个模块图。

export class SourceMapGenerator {
  constructor(_file) {}
  addMapping() {}
  setSourceContent() {}
  toString() { return ''; }
  toJSON() { return { version: 3, sources: [], names: [], mappings: '' }; }
  toUrl() { return ''; }
  applySourceMap() { return new SourceMapGenerator(); }
}
