import 'dotenv/config'
import { verifyEmailProvider, isEmailConfigured, activeProvider, getFromAddress } from '../services/mailer'

/**
 * Verifies the SMTP configuration from backend/.env without sending an email.
 * Run: npm run smtp:verify
 */
async function run(): Promise<void> {
  if (!isEmailConfigured()) {
    console.error('[email:verify] no email provider is configured.')
    console.error('[email:verify] set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD in backend/.env')
    process.exitCode = 1
    return
  }

  const provider = activeProvider()
  console.log(`[email:verify] provider=${provider} from=${getFromAddress()}`)
  try {
    await verifyEmailProvider()
    console.log('[email:verify] credentials OK — the server can send email')
  } catch (error) {
    console.error(`[email:verify] failed: ${(error as Error).message}`)
    if (provider === 'resend') {
      console.error('[email:verify] check that RESEND_API_KEY is valid and has send permission')
    } else {
      const err = error as { code?: string }
      if (err.code === 'EAUTH') {
        console.error('[email:verify] authentication rejected — check SMTP_USER / SMTP_PASSWORD (for Gmail use a 16-char App Password, not the account password)')
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
        console.error('[email:verify] could not reach the server — check SMTP_HOST and SMTP_PORT (465 = secure/implicit TLS, 587 = STARTTLS)')
      }
    }
    process.exitCode = 1
  }
}

void run()
