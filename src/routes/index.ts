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
import { adminPaymentsRouter } from './adminPayments'
import { adminPaymentSettingsRouter } from './adminPaymentSettings'
import { barberEarningsRouter, assignmentRouter } from './barberEarnings'
import { commissionRatesRouter } from './commissionRates'
import { barberAuthRouter } from './barberAuth'
import { barberPortalRouter } from './barberPortal'

export const apiRouter = Router()

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
apiRouter.use('/admin/dashboard', dashboardRouter)
apiRouter.use('/admin/customers', customersRouter)
apiRouter.use('/admin/payments', adminPaymentsRouter)
apiRouter.use('/admin/payment-settings', adminPaymentSettingsRouter)
apiRouter.use('/admin/barber-earnings', barberEarningsRouter)
apiRouter.use('/admin/commission-rates', commissionRatesRouter)
// Barber Portal — separate namespace so barber tokens never touch admin APIs.
apiRouter.use('/barber/auth', barberAuthRouter)
apiRouter.use('/barber/portal', barberPortalRouter)
apiRouter.use('/admin/appointments', assignmentRouter)