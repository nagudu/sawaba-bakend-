"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailabilityHandler = getAvailabilityHandler;
const availabilityService_1 = require("../services/availabilityService");
const response_1 = require("../utils/response");
const models_1 = require("../models");
async function getAvailabilityHandler(req, res, next) {
    try {
        const barberId = Number(req.query.barberId);
        const date = String(req.query.date);
        const durationOverride = Number(req.query.duration) || undefined;
        let duration = durationOverride;
        if (!duration && req.query.serviceId) {
            const service = await models_1.Service.findByPk(Number(req.query.serviceId));
            if (service)
                duration = service.duration;
        }
        if (!duration)
            duration = 30;
        const slots = await (0, availabilityService_1.getAvailableTimeSlots)(barberId, date, duration);
        (0, response_1.successRes)(res, 'Available time slots retrieved.', {
            barberId,
            date,
            duration,
            slots,
        }, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=availabilityController.js.map