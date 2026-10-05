"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAssetPath = seedAssetPath;
exports.copySeedAsset = copySeedAsset;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const upload_1 = require("./upload");
/**
 * Seed/demo images live in the repository (backend/seed-assets) so the app
 * never depends on Unsplash or any online host. This helper copies them into
 * the local uploads directory (stable filenames = idempotent) and returns the
 * web path stored in the database, e.g. /uploads/services/fade.jpg.
 */
// CommonJS build: __dirname = dist/utils (or src/utils under tsx) — assets sit two levels up.
const seedAssetsDir = node_path_1.default.resolve(__dirname, '../../seed-assets');
function seedAssetPath(filename) {
    return `/uploads/seed/${filename}`;
}
function copySeedAsset(filename) {
    const source = node_path_1.default.join(seedAssetsDir, filename);
    if (!node_fs_1.default.existsSync(source)) {
        console.warn(`[db:seed] missing seed asset: ${filename} (image will 404 until restored)`);
        return seedAssetPath(filename);
    }
    const dir = node_path_1.default.join(upload_1.uploadsRoot, 'seed');
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    const target = node_path_1.default.join(dir, filename);
    if (!node_fs_1.default.existsSync(target) || node_fs_1.default.statSync(target).size !== node_fs_1.default.statSync(source).size) {
        node_fs_1.default.copyFileSync(source, target);
    }
    return seedAssetPath(filename);
}
//# sourceMappingURL=seedAssets.js.map