"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodError = void 0;
exports.validate = validate;
const zod_1 = require("zod");
Object.defineProperty(exports, "ZodError", { enumerable: true, get: function () { return zod_1.ZodError; } });
/**
 * Middleware that validates a request part against a Zod schema.
 * Attaches the parsed value back onto the request so the handler
 * only ever receives trusted, normalized data.
 */
function validate(schema, part = 'body') {
    return (req, _res, next) => {
        const result = schema.safeParse(req[part]);
        if (result.success) {
            ;
            req[part] = result.data;
            next();
            return;
        }
        next(result.error);
    };
}
//# sourceMappingURL=validate.js.map