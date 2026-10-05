"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mailer_1 = require("../services/mailer");
/**
 * Verifies the SMTP configuration from backend/.env without sending an email.
 * Run: npm run smtp:verify
 */
async function run() {
    if (!(0, mailer_1.isEmailConfigured)()) {
        console.error('[email:verify] no email provider is configured.');
        console.error('[email:verify] set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD in backend/.env');
        process.exitCode = 1;
        return;
    }
    const provider = (0, mailer_1.activeProvider)();
    console.log(`[email:verify] provider=${provider} from=${(0, mailer_1.getFromAddress)()}`);
    try {
        await (0, mailer_1.verifyEmailProvider)();
        console.log('[email:verify] credentials OK — the server can send email');
    }
    catch (error) {
        console.error(`[email:verify] failed: ${error.message}`);
        if (provider === 'resend') {
            console.error('[email:verify] check that RESEND_API_KEY is valid and has send permission');
        }
        else {
            const err = error;
            if (err.code === 'EAUTH') {
                console.error('[email:verify] authentication rejected — check SMTP_USER / SMTP_PASSWORD (for Gmail use a 16-char App Password, not the account password)');
            }
            else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
                console.error('[email:verify] could not reach the server — check SMTP_HOST and SMTP_PORT (465 = secure/implicit TLS, 587 = STARTTLS)');
            }
        }
        process.exitCode = 1;
    }
}
void run();
//# sourceMappingURL=verifySmtp.js.map