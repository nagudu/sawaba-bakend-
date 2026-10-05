import { OAuth2Client } from 'google-auth-library'
import { env, isGoogleAuthEnabled } from '../config/env'
import { UnauthorizedError, UnprocessableError } from '../utils/errors'

/** The two issuers Google uses for ID tokens. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** Trusted identity extracted from a *verified* Google ID token. */
export interface GoogleIdentity {
  /** Google's stable, per-account user id. This is the only value we trust as an identifier. */
  sub: string
  email: string | null
  emailVerified: boolean
  name: string | null
  picture: string | null
}

let cachedClient: OAuth2Client | null = null
let cachedClientId = ''

function getClient(): OAuth2Client {
  // Re-created when the configured id changes so a restart-free env edit works.
  if (!cachedClient || cachedClientId !== env.google.clientId) {
    cachedClient = new OAuth2Client(env.google.clientId)
    cachedClientId = env.google.clientId
  }
  return cachedClient
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
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!isGoogleAuthEnabled()) {
    throw new UnprocessableError('Google sign-in is not configured on this server.')
  }

  let payload
  try {
    const ticket = await getClient().verifyIdToken({
      idToken,
      audience: env.google.clientId,
    })
    payload = ticket.getPayload()
  } catch {
    // Bad signature, expired, malformed, or minted for another audience.
    throw new UnauthorizedError(
      'Google sign-in could not be verified. Please try again or use your phone number.',
    )
  }

  if (!payload?.sub) {
    throw new UnauthorizedError('Google sign-in could not be verified. Please try again.')
  }

  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audience.includes(env.google.clientId)) {
    throw new UnauthorizedError('This Google session was issued for a different application.')
  }
  if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new UnauthorizedError('This credential was not issued by Google.')
  }

  const email = payload.email?.trim().toLowerCase() || null

  // Google sends a boolean, but a few older/edge responses have been seen with
  // the string "true". Absent means "not confirmed" — treat as unverified.
  const emailVerifiedClaim = payload.email_verified as boolean | string | undefined

  return {
    sub: payload.sub,
    email,
    emailVerified: emailVerifiedClaim === true || emailVerifiedClaim === 'true',
    name: payload.name?.trim() || null,
    picture: payload.picture?.trim() || null,
  }
}
