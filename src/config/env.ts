import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

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
  // Optional: only needed when UPLOAD_DRIVER=cloudinary. The default local
  // disk driver works offline with no third-party account at all.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
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
} as const

/** True when Google sign-in is usable end to end. */
export const isGoogleAuthEnabled = (): boolean => env.google.clientId.trim().length > 0