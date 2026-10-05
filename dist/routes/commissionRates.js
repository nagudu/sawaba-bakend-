"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commissionRatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const commissionRate_1 = require("../validators/commissionRate");
const commissionRateController_1 = require("../controllers/commissionRateController");
exports.commissionRatesRouter = (0, express_1.Router)();
exports.commissionRatesRouter.get('/', auth_1.requireAdmin, (0, validate_1.validate)(commissionRate_1.commissionRateListSchema, 'query'), commissionRateController_1.listCommissionRatesHandler);
exports.commissionRatesRouter.get('/:barberId/history', auth_1.requireAdmin, (0, validate_1.validate)(commissionRate_1.commissionRateHistorySchema, 'query'), commissionRateController_1.getCommissionHistoryHandler);
exports.commissionRatesRouter.put('/:barberId', auth_1.requireAdmin, (0, validate_1.validate)(commissionRate_1.commissionRateUpdateSchema, 'body'), commissionRateController_1.updateCommissionRateHandler);
//# sourceMappingURL=commissionRates.js.map