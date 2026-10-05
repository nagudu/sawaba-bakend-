"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardHandler = dashboardHandler;
const dashboardService_1 = require("../services/dashboardService");
const response_1 = require("../utils/response");
async function dashboardHandler(_req, res, next) {
    try {
        const data = await (0, dashboardService_1.getDashboardData)();
        (0, response_1.successRes)(res, 'Dashboard data retrieved.', data, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=dashboardController.js.map