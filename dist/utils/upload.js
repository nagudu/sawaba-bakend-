"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalUploadUrl = exports.uploadsRoot = exports.galleryUpload = exports.upload = exports.MAX_VIDEO_SIZE_MB = exports.MAX_IMAGE_SIZE_MB = void 0;
exports.credentialsConfigured = credentialsConfigured;
exports.isVercelRuntime = isVercelRuntime;
exports.getUploadDriver = getUploadDriver;
exports.localUploadPath = localUploadPath;
exports.deleteImageFromCloudinary = deleteImageFromCloudinary;
exports.extractCloudinaryPublicId = extractCloudinaryPublicId;
exports.deleteImageByUrl = deleteImageByUrl;
exports.uploadImageToCloudinary = uploadImageToCloudinary;
exports.deleteVideoByUrl = deleteVideoByUrl;
exports.uploadVideoToCloudinary = uploadVideoToCloudinary;
const multer_1 = __importDefault(require("multer"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const cloudinary_1 = require("../config/cloudinary");
const env_1 = require("../config/env");
const errors_1 = require("./errors");
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
// Vercel serverless request body ceiling is 4.5MB; capping upload file size at 4MB prevents 413 Gateway errors
exports.MAX_IMAGE_SIZE_MB = 4;
const ALLOWED_VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-m4v',
    'video/x-matroska',
]);
exports.MAX_VIDEO_SIZE_MB = 50;
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
/**
 * Multer instance for gallery media. Accepts an optional poster/thumbnail on the
 * `image` field (≤4MB, image MIME types) and an optional clip on the `video`
 * field (≤50MB, video MIME types). The byte limit is the video ceiling so large
 * clips pass; the controller enforces the tighter image cap afterwards.
 */
exports.galleryUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: exports.MAX_VIDEO_SIZE_MB * 1024 * 1024, files: 2 },
    fileFilter: (_req, file, cb) => {
        if (file.fieldname === 'video') {
            if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
                return cb(new errors_1.AppError('Only MP4, WEBM, OGG, MOV, M4V and MKV videos are allowed.', 400));
            }
            return cb(null, true);
        }
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new errors_1.AppError('Only JPEG, PNG, WEBP, GIF and AVIF images are allowed.', 400));
        }
        cb(null, true);
    },
});
const PLACEHOLDER_VALUES = new Set([
    'your-cloud-name',
    'your-api-key',
    'your-api-secret',
    'your_cloud_name',
    'your_api_key',
    'your_api_secret',
]);
function credentialsConfigured() {
    if (process.env.CLOUDINARY_URL &&
        process.env.CLOUDINARY_URL.startsWith('cloudinary://') &&
        !process.env.CLOUDINARY_URL.includes('your-api-key') &&
        !process.env.CLOUDINARY_URL.includes('your_api_key')) {
        return true;
    }
    return (Boolean(env_1.env.cloudinary.cloudName) &&
        Boolean(env_1.env.cloudinary.apiKey) &&
        Boolean(env_1.env.cloudinary.apiSecret) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.cloudName) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.apiKey) &&
        !PLACEHOLDER_VALUES.has(env_1.env.cloudinary.apiSecret));
}
/** Detects if the code is executing within a Vercel Serverless environment. */
function isVercelRuntime() {
    return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}
/**
 * Determines whether to upload to Cloudinary or write to local disk.
 * - If UPLOAD_DRIVER is explicitly set ('cloudinary' or 'local'), respect it.
 * - On Vercel, the filesystem is ephemeral and read-only, so Cloudinary is required.
 * - If Cloudinary credentials are configured, prefer Cloudinary.
 * - Otherwise falls back to local disk (offline-first development).
 */
function getUploadDriver() {
    const explicit = process.env.UPLOAD_DRIVER?.trim().toLowerCase();
    if (explicit === 'cloudinary' || explicit === 'local') {
        return explicit;
    }
    if (isVercelRuntime()) {
        return 'cloudinary';
    }
    if (credentialsConfigured()) {
        return 'cloudinary';
    }
    return 'local';
}
// ─── Local disk storage (offline-first default) ───────────────────────────────
// UPLOAD_DRIVER=local writes images into backend/uploads/<folder>/
// and stores web paths like /uploads/<folder>/<file> in the database. The
// backend serves /uploads statically, so everything works with no internet
// and no third-party account. On Vercel (or when Cloudinary is configured),
// Cloudinary is automatically selected.
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
const VIDEO_EXTENSIONS = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/x-matroska': 'mkv',
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
    if (isVercelRuntime()) {
        throw new errors_1.AppError('Local file uploads cannot be persisted on Vercel Serverless. Please configure Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL) in your Vercel Project Settings > Environment Variables.', 503);
    }
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
/** Deletes a stored image when it is a local upload; Cloudinary images use Cloudinary destroy. */
async function deleteImageFromCloudinary(publicId) {
    if (!publicId)
        return;
    if (publicId.startsWith('local:')) {
        deleteLocalImage(publicId);
        return;
    }
    if (credentialsConfigured()) {
        await cloudinary_1.cloudinary.uploader.destroy(publicId).catch(() => undefined);
    }
}
/**
 * Extracts the full Cloudinary public_id from a Cloudinary URL, including folder paths
 * and stripping any transformation segments (e.g. /image/upload/v1234/folder/photo.jpg -> folder/photo).
 */
function extractCloudinaryPublicId(url, resourceType = 'image') {
    try {
        const parsed = new URL(url);
        const marker = `/${resourceType}/upload/`;
        const idx = parsed.pathname.indexOf(marker);
        if (idx === -1)
            return null;
        const sub = parsed.pathname.slice(idx + marker.length);
        const parts = sub.split('/');
        let startIdx = 0;
        while (startIdx < parts.length) {
            const part = parts[startIdx];
            if (/^v\d+$/.test(part)) {
                startIdx++;
                break;
            }
            if (part.includes(',') || /^[a-z]_[a-z0-9_-]+$/i.test(part)) {
                startIdx++;
                continue;
            }
            break;
        }
        const publicPathWithExt = parts.slice(startIdx).join('/');
        if (!publicPathWithExt)
            return null;
        const dotIdx = publicPathWithExt.lastIndexOf('.');
        return dotIdx !== -1 ? publicPathWithExt.slice(0, dotIdx) : publicPathWithExt;
    }
    catch {
        return null;
    }
}
/** Deletes an image given only its stored URL — works for /uploads paths and Cloudinary URLs. */
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
    if (url.includes('cloudinary') && credentialsConfigured()) {
        const publicId = extractCloudinaryPublicId(url);
        if (publicId) {
            await cloudinary_1.cloudinary.uploader.destroy(publicId).catch(() => undefined);
        }
    }
}
async function uploadImageToCloudinary(buffer, folder, mimetype = 'image/jpeg') {
    const driver = getUploadDriver();
    if (driver === 'cloudinary') {
        if (!credentialsConfigured()) {
            const isVercel = isVercelRuntime();
            const errorMsg = isVercel
                ? 'Image upload is not configured. Since this backend runs on Vercel Serverless, persistent image storage requires Cloudinary. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) to your Vercel Project Settings > Environment Variables.'
                : 'Image upload is not configured. Add your real Cloudinary credentials to backend/.env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL), or set UPLOAD_DRIVER=local for offline local storage.';
            throw new errors_1.AppError(errorMsg, 503);
        }
        const id = node_crypto_1.default.randomBytes(12).toString('hex');
        const targetFolder = folder ?? env_1.env.cloudinary.uploadFolder;
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.cloudinary.uploader.upload_stream({
                folder: targetFolder,
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
// ─── Video uploads ────────────────────────────────────────────────────────────
function saveLocalVideo(buffer, folder, mimetype) {
    if (isVercelRuntime()) {
        throw new errors_1.AppError('Local video uploads cannot be persisted on Vercel Serverless. Please configure Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL) in your Vercel Project Settings > Environment Variables.', 503);
    }
    const ext = VIDEO_EXTENSIONS[mimetype] ?? 'mp4';
    const dir = node_path_1.default.join(exports.uploadsRoot, folder);
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${node_crypto_1.default.randomBytes(8).toString('hex')}.${ext}`;
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, name), buffer);
    return { url: `/uploads/${folder}/${name}`, publicId: `local:${folder}/${name}`, thumbnailUrl: null };
}
/** Deletes a stored video given only its stored URL — works for /uploads paths and Cloudinary URLs. */
async function deleteVideoByUrl(url) {
    if (!url)
        return;
    if ((0, exports.isLocalUploadUrl)(url)) {
        const target = localUploadPath(url);
        if (target && target.startsWith(exports.uploadsRoot) && node_fs_1.default.existsSync(target)) {
            node_fs_1.default.unlinkSync(target);
        }
        return;
    }
    if (url.includes('cloudinary') && credentialsConfigured()) {
        const publicId = extractCloudinaryPublicId(url, 'video');
        if (publicId) {
            await cloudinary_1.cloudinary.uploader.destroy(publicId, { resource_type: 'video' }).catch(() => undefined);
        }
    }
}
async function uploadVideoToCloudinary(buffer, folder, mimetype = 'video/mp4') {
    const driver = getUploadDriver();
    const targetFolder = folder ?? env_1.env.cloudinary.uploadFolder;
    if (driver === 'cloudinary') {
        if (!credentialsConfigured()) {
            const isVercel = isVercelRuntime();
            const errorMsg = isVercel
                ? 'Video upload is not configured. Since this backend runs on Vercel Serverless, persistent video storage requires Cloudinary. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) to your Vercel Project Settings > Environment Variables.'
                : 'Video upload is not configured. Add your real Cloudinary credentials to backend/.env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL), or set UPLOAD_DRIVER=local for offline local storage.';
            throw new errors_1.AppError(errorMsg, 503);
        }
        const id = node_crypto_1.default.randomBytes(12).toString('hex');
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.cloudinary.uploader.upload_stream({
                folder: targetFolder,
                public_id: id,
                resource_type: 'video',
                transformation: [{ width: 1280, crop: 'limit', quality: 'auto' }],
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
        // Cloudinary renders a JPG from the first frame when the video URL extension is swapped.
        const poster = result.secure_url.replace(/\.[a-z0-9]+$/i, '.jpg');
        return { url: result.secure_url, publicId: result.public_id, thumbnailUrl: poster };
    }
    // Default: local disk — works fully offline.
    return saveLocalVideo(buffer, folder ?? 'gallery/videos', mimetype);
}
//# sourceMappingURL=upload.js.map