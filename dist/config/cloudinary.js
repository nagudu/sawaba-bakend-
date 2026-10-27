"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const env_1 = require("./env");
if (env_1.env.cloudinary.cloudName && env_1.env.cloudinary.apiKey && env_1.env.cloudinary.apiSecret) {
    cloudinary_1.v2.config({
        cloud_name: env_1.env.cloudinary.cloudName,
        api_key: env_1.env.cloudinary.apiKey,
        api_secret: env_1.env.cloudinary.apiSecret,
        secure: true,
    });
}
else if (process.env.CLOUDINARY_URL) {
    cloudinary_1.v2.config({
        cloudinary_url: process.env.CLOUDINARY_URL,
        secure: true,
    });
}
else {
    cloudinary_1.v2.config({
        secure: true,
    });
}
//# sourceMappingURL=cloudinary.js.map