"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGoogleIdToken = verifyGoogleIdToken;
const google_auth_library_1 = require("google-auth-library");
const env_1 = require("../config/env");
const errors_1 = require("../utils/errors");
/** The two issuers Google uses for ID tokens. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
let cachedClient = null;
let cachedClientId = '';
function getClient() {
    // Re-created when the configured id changes so a restart-free env edit works.
    if (!cachedClient || cachedClientId !== env_1.env.google.clientId) {
        cachedClient = new google_auth_library_1.OAuth2Client(env_1.env.google.clientId);
        cachedClientId = env_1.env.google.clientId;
    }
    return cachedClient;
}
/**
 * Verifies a Google ID token (JWT) issued to OUR client and returns the
 * identity inside it.
 *
 * The token is NEVER trusted because it came from the browser. `verifyIdToken`
 * checks the RS256 signature against Google's published certificates and
 * rejects expired tokens. We then re-assert the audience and issuer ourselves
 * so a token minted for a different client (or a non-Google issuer) can never
 * be replayed against this endpoint.
 */
async function verifyGoogleIdToken(idToken) {
    if (!(0, env_1.isGoogleAuthEnabled)()) {
        throw new errors_1.UnprocessableError('Google sign-in is not configured on this server.');
    }
    let payload;
    try {
        const ticket = await getClient().verifyIdToken({
            idToken,
            audience: env_1.env.google.clientId,
        });
        payload = ticket.getPayload();
    }
    catch {
        // Bad signature, expired, malformed, or minted for another audience.
        throw new errors_1.UnauthorizedError('Google sign-in could not be verified. Please try again or use your phone number.');
    }
    if (!payload?.sub) {
        throw new errors_1.UnauthorizedError('Google sign-in could not be verified. Please try again.');
    }
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.includes(env_1.env.google.clientId)) {
        throw new errors_1.UnauthorizedError('This Google session was issued for a different application.');
    }
    if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) {
        throw new errors_1.UnauthorizedError('This credential was not issued by Google.');
    }
    const email = payload.email?.trim().toLowerCase() || null;
    // Google sends a boolean, but a few older/edge responses have been seen with
    // the string "true". Absent means "not confirmed" — treat as unverified.
    const emailVerifiedClaim = payload.email_verified;
    return {
        sub: payload.sub,
        email,
        emailVerified: emailVerifiedClaim === true || emailVerifiedClaim === 'true',
        name: payload.name?.trim() || null,
        picture: payload.picture?.trim() || null,
    };
}
//# sourceMappingURL=googleAuthService.js.map