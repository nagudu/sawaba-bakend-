"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barberAuthRouter = void 0;
const express_1 = require("express");
const barberAuth_1 = require("../middleware/barberAuth");
const barberAuthController_1 = require("../controllers/barberAuthController");
const validate_1 = require("../middleware/validate");
const barberAuth_2 = require("../validators/barberAuth");
/** Barber Portal authentication — separate namespace from /admin so tokens never cross. */
exports.barberAuthRouter = (0, express_1.Router)();
exports.barberAuthRouter.post('/login', (0, validate_1.validate)(barberAuth_2.barberLoginSchema), barberAuthController_1.loginBarberController);
exports.barberAuthRouter.use(barberAuth_1.requireBarber);
exports.barberAuthRouter.get('/me', barberAuthController_1.getBarberMeController);
exports.barberAuthRouter.post('/change-password', (0, validate_1.validate)(barberAuth_2.barberChangePasswordSchema), barberAuthController_1.changeBarberPasswordController);
//# sourceMappingURL=barberAuth.js.map