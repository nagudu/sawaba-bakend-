"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentSettingsAdminHandler = getPaymentSettingsAdminHandler;
exports.updatePaymentSettingsHandler = updatePaymentSettingsHandler;
const paymentSettingsService_1 = require("../services/paymentSettingsService");
const response_1 = require("../utils/response");
async function getPaymentSettingsAdminHandler(_req, res, next) {
    try {
        const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
        (0, response_1.successRes)(res, 'Payment settings retrieved.', (0, paymentSettingsService_1.serializePaymentSetting)(settings), 200);
    }
    catch (error) {
        next(error);
    }
}
async function updatePaymentSettingsHandler(req, res, next) {
    try {
        const input = req.body;
        const settings = await (0, paymentSettingsService_1.updatePaymentSettings)(input);
        (0, response_1.successRes)(res, 'Payment settings updated successfully.', settings, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=paymentSettingsController.js.map