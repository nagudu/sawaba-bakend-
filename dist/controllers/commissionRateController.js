"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommissionRatesHandler = listCommissionRatesHandler;
exports.getCommissionHistoryHandler = getCommissionHistoryHandler;
exports.updateCommissionRateHandler = updateCommissionRateHandler;
const commissionRateService_1 = require("../services/commissionRateService");
const response_1 = require("../utils/response");
async function listCommissionRatesHandler(req, res, next) {
    try {
        const result = await (0, commissionRateService_1.listCommissionRates)(req.query);
        (0, response_1.successRes)(res, 'Commission rates fetched.', result);
    }
    catch (error) {
        next(error);
    }
}
async function getCommissionHistoryHandler(req, res, next) {
    try {
        const barberId = Number(req.params.barberId);
        const result = await (0, commissionRateService_1.getCommissionRateHistory)(barberId, req.query);
        (0, response_1.successRes)(res, 'Commission rate history fetched.', result);
    }
    catch (error) {
        next(error);
    }
}
async function updateCommissionRateHandler(req, res, next) {
    try {
        const barberId = Number(req.params.barberId);
        const adminId = req.admin.id;
        const result = await (0, commissionRateService_1.updateCommissionRate)(barberId, adminId, req.body);
        (0, response_1.successRes)(res, 'Commission rate updated.', result);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=commissionRateController.js.map