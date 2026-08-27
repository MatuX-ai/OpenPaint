/**
 * Browser shim for Node.js built-ins that `@open-pencil/core` and
 * `canvaskit-wasm` reference in code paths that are guarded by
 * `if (IS_BROWSER)` / `typeof process === 'object'`.
 *
 * In a Tauri webview these code paths never execute at runtime, but Vite
 * still statically resolves the import specifiers during the production
 * build. Aliasing them to an empty default export lets the build complete
 * without dragging Node builtins into the client bundle.
 */
const stub = {};
export default stub;
export const readFile = stub;
export const writeFile = stub;
export const mkdir = stub;
export const stat = stub;
export const existsSync = stub;
export const readFileSync = stub;
export const writeFileSync = stub;
export const resolve = stub;
export const dirname = stub;
export const basename = stub;
export const extname = stub;
export const join = stub;
export const sep = '/';
export const fileURLToPath = stub;
export const pathToFileURL = stub;
export const URL = globalThis.URL;