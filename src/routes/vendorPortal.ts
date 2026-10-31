import { Router } from 'express'
import {
  vendorChangePasswordHandler,
  vendorCreateProductHandler,
  vendorDashboardHandler,
  vendorDeleteProductHandler,
  vendorEarningsHandler,
  vendorListOrdersHandler,
  vendorListProductsHandler,
  vendorLoginHandler,
  vendorMeHandler,
  vendorNotificationsHandler,
  vendorReadNotificationHandler,
  vendorRegisterHandler,
  vendorRequestPayoutHandler,
  vendorToggleProductHandler,
  vendorUpdateOrderItemHandler,
  vendorUpdateProductHandler,
  vendorUpdateProfileHandler,
} from '../controllers/vendorController'
import { requireVendor } from '../middleware/vendorAuth'
import { validate } from '../middleware/validate'
import { customerAuthLimiter, submitLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'
import {
  vendorChangePasswordSchema,
  vendorItemParamsSchema,
  vendorItemUpdateSchema,
  vendorLoginSchema,
  vendorPayoutRequestSchema,
  vendorProductIdParamsSchema,
  vendorProfileUpdateSchema,
  vendorRegisterSchema,
} from '../validators/shop'

export const vendorPortalRouter = Router()

// ─── Public auth ─────────────────────────────────────────────────────────────
vendorPortalRouter.post('/register', customerAuthLimiter, validate(vendorRegisterSchema), vendorRegisterHandler)
vendorPortalRouter.post('/login', customerAuthLimiter, validate(vendorLoginSchema), vendorLoginHandler)

// Everything below requires a valid VENDOR token.
vendorPortalRouter.use(requireVendor)

vendorPortalRouter.get('/me', vendorMeHandler)
vendorPortalRouter.patch('/me', validate(vendorProfileUpdateSchema), vendorUpdateProfileHandler)
vendorPortalRouter.post('/change-password', validate(vendorChangePasswordSchema), vendorChangePasswordHandler)

// Dashboard
vendorPortalRouter.get('/dashboard', vendorDashboardHandler)
vendorPortalRouter.get('/notifications', vendorNotificationsHandler)
vendorPortalRouter.post('/notifications/:id/read', vendorReadNotificationHandler)

// Products
vendorPortalRouter.get('/products', vendorListProductsHandler)
vendorPortalRouter.post('/products', submitLimiter, upload.array('images', 8), vendorCreateProductHandler)
vendorPortalRouter.put('/products/:id', upload.array('images', 8), validate(vendorProductIdParamsSchema, 'params'), vendorUpdateProductHandler)
vendorPortalRouter.patch('/products/:id/active', validate(vendorProductIdParamsSchema, 'params'), vendorToggleProductHandler)
vendorPortalRouter.delete('/products/:id', validate(vendorProductIdParamsSchema, 'params'), vendorDeleteProductHandler)

// Orders (vendor's slice of multi-vendor orders)
vendorPortalRouter.get('/orders', vendorListOrdersHandler)
vendorPortalRouter.patch(
  '/orders/items/:itemId',
  validate(vendorItemParamsSchema, 'params'),
  validate(vendorItemUpdateSchema),
  vendorUpdateOrderItemHandler,
)

// Earnings + payouts
vendorPortalRouter.get('/earnings', vendorEarningsHandler)
vendorPortalRouter.post('/payouts', validate(vendorPayoutRequestSchema), vendorRequestPayoutHandler)
