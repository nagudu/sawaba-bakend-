import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseCloudinaryUrl(urlStr?: string): { cloudName?: string; apiKey?: string; apiSecret?: string } {
  if (!urlStr || !urlStr.startsWith('cloudinary://')) return {}
  try {
    const url = new URL(urlStr)
    return {
      cloudName: url.hostname || undefined,
      apiKey: decodeURIComponent(url.username) || undefined,
      apiSecret: decodeURIComponent(url.password) || undefined,
    }
  } catch {
    return {}
  }
}

const parsedCloudinary = parseCloudinaryUrl(process.env.CLOUDINARY_URL)

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // `Number(x) || 5001` guards against inherited junk like PORT='' or PORT=0
  // (e.g. exported by a parent shell) silently binding the server to port 0.
  port: Number(process.env.PORT) || 5001,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  // Extra allowed browser origins (comma-separated) — e.g. the deployed
  // frontend plus preview domains. Keep it minimal in production.
  extraClientOrigins: (process.env.EXTRA_CLIENT_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Cloudinary credentials for cloud image uploads (required on Vercel).
  // Supports either individual keys or a single CLOUDINARY_URL connection string.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? parsedCloudinary.cloudName ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? parsedCloudinary.apiKey ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? parsedCloudinary.apiSecret ?? '',
    uploadFolder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'sawaba-salon',
  },
  adminSeed: {
    email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
    password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
    name: process.env.ADMIN_SEED_NAME ?? 'SAWABA Admin',
  },
  // Google Identity Services. Deliberately OPTIONAL: when the client id is
  // missing the server still boots and email/password + phone-OTP login keep
  // working — the "Continue with Google" button is simply not offered.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },
  // SMS delivery for OTPs (Termii-compatible). Deliberately OPTIONAL: when the
  // key or sender id is missing, OTPs fall back to email delivery.
  sms: {
    apiKey: process.env.SMS_API_KEY ?? '',
    senderId: process.env.SMS_SENDER_ID ?? '',
    baseUrl: process.env.SMS_BASE_URL ?? '',
  },
} as const

/** True when Google sign-in is usable end to end. */
export const isGoogleAuthEnabled = (): boolean => env.google.clientId.trim().length > 0