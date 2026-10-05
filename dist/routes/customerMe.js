"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerMeRouter = void 0;
const express_1 = require("express");
const customerMeController_1 = require("../controllers/customerMeController");
const customerAuth_1 = require("../middleware/customerAuth");
const validate_1 = require("../middleware/validate");
const customerAuth_2 = require("../validators/customerAuth");
const zod_1 = require("zod");
exports.customerMeRouter = (0, express_1.Router)();
exports.customerMeRouter.get('/summary', customerAuth_1.requireCustomer, customerMeController_1.summaryHandler);
exports.customerMeRouter.get('/appointments', customerAuth_1.requireCustomer, customerMeController_1.appointmentsHandler);
exports.customerMeRouter.get('/appointments/:id', customerAuth_1.requireCustomer, (0, validate_1.validate)(zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() }), 'params'), customerMeController_1.appointmentByIdHandler);
exports.customerMeRouter.get('/payments', customerAuth_1.requireCustomer, customerMeController_1.paymentsHandler);
exports.customerMeRouter.post('/appointments/:id/cancel', customerAuth_1.requireCustomer, (0, validate_1.validate)(zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() }), 'params'), (0, validate_1.validate)(customerAuth_2.customerCancelSchema), customerMeController_1.cancelHandler);
//# sourceMappingURL=customerMe.js.map