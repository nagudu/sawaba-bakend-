"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalUploadUrl = exports.uploadsRoot = exports.upload = exports.MAX_IMAGE_SIZE_MB = void 0;
exports.localUploadPath = localUploadPath;
exports.deleteImageFromCloudinary = deleteImageFromCloudinary;
exports.deleteImageByUrl = deleteImageByUrl;
exports.uploadImageToCloudinary = uploadImageToCloudinary;
const multer_1 = __importDefault(require("multer"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const cloudinary_1 = require("../config/cloudinary");
const env_1 = require("../config/env");
const errors_1 = require("./errors");
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
exports.MAX_IMAGE_SIZE_MB = 5;
exports.upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: exports.MAX_IMAGE_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new errors_1.AppError('Only JPEG, PNG, WEBP, GIF and AVIF images are allowed.', 400));
        }
        cb(null, true);
    },
});
const PLACEHOLDER_VALUES = new Set(['your-cloud-name', 'your-api-key', 'your-api-secret']);
function credentialsConfigured() {
    return (Boolean(env_1.env.cloudinary.cloudName) &&
        Boolean(env_1.env.cloudinary.apiKey) &&
        Boolean(env_1.env.cloudinary.apiSecret) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.cloudName) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.apiKey) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.apiSecret));
}
// ─── Local disk storage (offline-first default) ───────────────────────────────
// UPLOAD_DRIVER=local (default) writes images into backend/uploads/<folder>/
// and stores web paths like /uploads/<folder>/<file> in the database. The
// backend serves /uploads statically, so everything works with no internet
// and no third-party account. UPLOAD_DRIVER=cloudinary keeps the legacy
// behavior for cloud deployments.
// CommonJS build: resolve from this compiled file (dist/utils/upload.js → backend/uploads)
exports.uploadsRoot = process.env.UPLOADS_DIR
    ? node_path_1.default.resolve(process.env.UPLOADS_DIR)
    : node_path_1.default.resolve(__dirname, '../../uploads');
const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
};
const isLocalUploadUrl = (url) => url.startsWith('/uploads/');
exports.isLocalUploadUrl = isLocalUploadUrl;
/** Absolute filesystem path for a stored local upload URL (null for external URLs). */
function localUploadPath(url) {
    if (!(0, exports.isLocalUploadUrl)(url))
        return null;
    const rel = node_path_1.default.normalize(url.replace('/uploads/', '')).replace(/^(\.\.[/\\])+/, '');
    return node_path_1.default.join(exports.uploadsRoot, rel);
}
function saveLocalImage(buffer, folder, mimetype) {
    const sub = node_path_1.default.basename(folder || 'misc');
    const dir = node_path_1.default.join(exports.uploadsRoot, sub);
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    const ext = EXTENSIONS[mimetype] ?? 'jpg';
    const name = `${Date.now().toString(36)}-${node_crypto_1.default.randomBytes(8).toString('hex')}.${ext}`;
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, name), buffer);
    return { url: `/uploads/${sub}/${name}`, publicId: `local:${sub}/${name}` };
}
function deleteLocalImage(publicId) {
    // publicId format: "local:<subdir>/<filename>"
    if (!publicId.startsWith('local:'))
        return;
    const rel = node_path_1.default.normalize(publicId.slice('local:'.length)).replace(/^(\.\.[/\\])+/, '');
    const target = node_path_1.default.join(exports.uploadsRoot, rel);
    if (target.startsWith(exports.uploadsRoot) && node_fs_1.default.existsSync(target)) {
        node_fs_1.default.unlinkSync(target);
    }
}
/** Deletes a stored image when it is a local upload; Cloudinary images keep their legacy cleanup. */
async function deleteImageFromCloudinary(publicId) {
    if (!publicId)
        return;
    if (publicId.startsWith('local:')) {
        deleteLocalImage(publicId);
        return;
    }
    await cloudinary_1.cloudinary.uploader.destroy(publicId).catch(() => undefined);
}
/** Deletes an image given only its stored URL — works for /uploads paths and cloud URLs. */
async function deleteImageByUrl(url) {
    if (!url)
        return;
    if ((0, exports.isLocalUploadUrl)(url)) {
        const target = localUploadPath(url);
        if (target && target.startsWith(exports.uploadsRoot) && node_fs_1.default.existsSync(target)) {
            node_fs_1.default.unlinkSync(target);
        }
        return;
    }
    if (url.includes('cloudinary')) {
        // Legacy cloud URLs: derive the public id from the path.
        try {
            const parsed = new URL(url);
            const file = parsed.pathname.split('/').pop() ?? '';
            const id = file.split('.')[0];
            if (id)
                await cloudinary_1.cloudinary.uploader.destroy(id).catch(() => undefined);
        }
        catch {
            // ignore malformed URLs
        }
    }
}
async function uploadImageToCloudinary(buffer, folder, mimetype = 'image/jpeg') {
    const driver = (process.env.UPLOAD_DRIVER ?? 'local').toLowerCase();
    if (driver === 'cloudinary') {
        if (!credentialsConfigured()) {
            throw new errors_1.AppError('Image upload is not configured. Add your real Cloudinary API key and secret to backend/.env, or paste an image URL instead of uploading a file.', 503);
        }
        const id = node_crypto_1.default.randomBytes(12).toString('hex');
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.cloudinary.uploader.upload_stream({
                folder: folder ?? env_1.env.cloudinary.uploadFolder,
                public_id: id,
                resource_type: 'image',
                transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
            }, (error, uploadResult) => {
                if (error)
                    reject(error);
                else if (uploadResult)
                    resolve(uploadResult);
                else
                    reject(new Error('Cloudinary returned no result'));
            });
            stream.end(buffer);
        });
        return { url: result.secure_url, publicId: result.public_id };
    }
    // Default: local disk — works fully offline.
    return saveLocalImage(buffer, folder ?? 'misc', mimetype);
}
//# sourceMappingURL=upload.js.map