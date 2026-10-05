"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEarningsHandler = listEarningsHandler;
exports.earningsSummaryHandler = earningsSummaryHandler;
exports.commissionReportHandler = commissionReportHandler;
exports.barberPerformanceHandler = barberPerformanceHandler;
exports.markEarningPaidHandler = markEarningPaidHandler;
exports.assignBarberHandler = assignBarberHandler;
exports.assignmentHistoryHandler = assignmentHistoryHandler;
const commissionService_1 = require("../services/commissionService");
const assignmentService_1 = require("../services/assignmentService");
const response_1 = require("../utils/response");
async function listEarningsHandler(req, res, next) {
    try {
        const result = await (0, commissionService_1.listEarnings)(req.query);
        (0, response_1.successRes)(res, 'Barber earnings retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function earningsSummaryHandler(req, res, next) {
    try {
        const rows = await (0, commissionService_1.getEarningsSummary)(req.query);
        (0, response_1.successRes)(res, 'Barber earnings summary retrieved.', rows, 200);
    }
    catch (error) {
        next(error);
    }
}
async function commissionReportHandler(req, res, next) {
    try {
        const report = await (0, commissionService_1.getCommissionReport)(req.query);
        (0, response_1.successRes)(res, 'Commission report retrieved.', report, 200);
    }
    catch (error) {
        next(error);
    }
}
async function barberPerformanceHandler(req, res, next) {
    try {
        const rows = await (0, commissionService_1.getBarberPerformance)(req.query);
        (0, response_1.successRes)(res, 'Barber performance report retrieved.', rows, 200);
    }
    catch (error) {
        next(error);
    }
}
async function markEarningPaidHandler(req, res, next) {
    try {
        const earning = await (0, commissionService_1.markEarningPaid)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Commission marked as paid.', earning, 200);
    }
    catch (error) {
        next(error);
    }
}
async function assignBarberHandler(req, res, next) {
    try {
        const appointment = await (0, assignmentService_1.assignBarber)(Number(req.params.id), req.body, req.admin?.id ?? null);
        (0, response_1.successRes)(res, 'Barber assignment updated.', appointment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function assignmentHistoryHandler(req, res, next) {
    try {
        const history = await (0, assignmentService_1.getAssignmentHistory)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Assignment history retrieved.', history, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=barberEarningController.js.map