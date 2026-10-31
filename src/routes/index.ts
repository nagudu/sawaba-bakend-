import { Router } from 'express'
import { authRouter } from './auth'
import { servicesRouter } from './services'
import { barbersRouter } from './barbers'
import { appointmentsRouter } from './appointments'
import { availabilityRouter } from './availability'
import { galleryRouter } from './gallery'
import { reviewsRouter } from './reviews'
import { contactRouter } from './contact'
import { dashboardRouter } from './dashboard'
import { customersRouter } from './customers'
import { customerAuthRouter } from './customerAuth'
import { customerMeRouter } from './customerMe'
import { paymentsRouter } from './payments'
import { paystackRouter } from './paystack'
import { checkoutRouter } from './checkout'
import { bookingsRouter } from './bookings'
import { adminPaymentsRouter } from './adminPayments'
import { adminPaymentSettingsRouter } from './adminPaymentSettings'
import { barberEarningsRouter, assignmentRouter } from './barberEarnings'
import { commissionRatesRouter } from './commissionRates'
import { barberAuthRouter } from './barberAuth'
import { barberPortalRouter } from './barberPortal'
import { adminRemindersRouter, cronRouter } from './reminders'
import { adminQrRouter, barberQrRouter } from './qr'
import { shopRouter } from './shop'
import { vendorPortalRouter } from './vendorPortal'
import { marketplaceAdminRouter } from './marketplaceAdmin'

export const apiRouter = Router()

apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to SAWABA Grooming Studio API',
    status: 'online',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health',
  })
})

apiRouter.use('/auth', authRouter)
apiRouter.use('/services', servicesRouter)
apiRouter.use('/barbers', barbersRouter)
apiRouter.use('/appointments', appointmentsRouter)
apiRouter.use('/availability', availabilityRouter)
apiRouter.use('/gallery', galleryRouter)
apiRouter.use('/reviews', reviewsRouter)
apiRouter.use('/contact', contactRouter)
apiRouter.use('/account', customerAuthRouter)
apiRouter.use('/account', customerMeRouter)
// Paystack sub-router MUST be mounted before paymentsRouter:
// paymentsRouter has POST /:token/... patterns that would otherwise
// swallow /payments/paystack/* paths with token="paystack".
apiRouter.use('/payments/paystack', paystackRouter)
apiRouter.use('/payments', paymentsRouter)
apiRouter.use('/checkout', checkoutRouter)
apiRouter.use('/bookings', bookingsRouter)
// Marketplace — public shop, vendor portal, admin management.
apiRouter.use('/shop', shopRouter)
apiRouter.use('/vendor', vendorPortalRouter)
apiRouter.use('/admin/marketplace', marketplaceAdminRouter)
apiRouter.use('/admin/qr', adminQrRouter)
apiRouter.use('/admin/dashboard', dashboardRouter)
apiRouter.use('/admin/customers', customersRouter)
apiRouter.use('/admin/payments', adminPaymentsRouter)
apiRouter.use('/admin/payment-settings', adminPaymentSettingsRouter)
apiRouter.use('/admin/barber-earnings', barberEarningsRouter)
apiRouter.use('/admin/commission-rates', commissionRatesRouter)
// Barber Portal — separate namespace so barber tokens never touch admin APIs.
apiRouter.use('/barber/auth', barberAuthRouter)
// QR scanner sub-router mounted before the portal so its /qr paths are matched.
apiRouter.use('/barber/portal/qr', barberQrRouter)
apiRouter.use('/barber/portal', barberPortalRouter)
// Automatic appointment reminders — scheduler endpoint (CRON_SECRET) plus an
// admin-only manual trigger. Mounted before /admin/appointments so the manual
// route is never shadowed by its /:id patterns.
apiRouter.use('/cron', cronRouter)
apiRouter.use('/admin/appointments/reminders', adminRemindersRouter)
apiRouter.use('/admin/appointments', assignmentRouter)