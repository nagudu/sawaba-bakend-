import { Router } from 'express'
import { requireBarber } from '../middleware/barberAuth'
import { changeBarberPasswordController, getBarberMeController, loginBarberController } from '../controllers/barberAuthController'
import { validate } from '../middleware/validate'
import { barberChangePasswordSchema, barberLoginSchema } from '../validators/barberAuth'

/** Barber Portal authentication — separate namespace from /admin so tokens never cross. */
export const barberAuthRouter = Router()

barberAuthRouter.post('/login', validate(barberLoginSchema), loginBarberController)
barberAuthRouter.use(requireBarber)
barberAuthRouter.get('/me', getBarberMeController)
barberAuthRouter.post('/change-password', validate(barberChangePasswordSchema), changeBarberPasswordController)