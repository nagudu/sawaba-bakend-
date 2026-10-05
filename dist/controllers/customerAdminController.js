"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listHandler = listHandler;
exports.detailHandler = detailHandler;
exports.updateHandler = updateHandler;
exports.remindHandler = remindHandler;
const customerService_1 = require("../services/customerService");
const customerAdminService_1 = require("../services/customerAdminService");
const response_1 = require("../utils/response");
async function listHandler(req, res, next) {
    try {
        const result = await (0, customerService_1.listCustomers)({
            search: typeof req.query.search === 'string' ? req.query.search : undefined,
            page: Number(req.query.page) || undefined,
            perPage: Number(req.query.perPage) || undefined,
            includeInactive: req.query.includeInactive === 'true',
        });
        (0, response_1.successRes)(res, 'Customers retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function detailHandler(req, res, next) {
    try {
        const detail = await (0, customerAdminService_1.getCustomerDetail)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Customer retrieved.', detail, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateHandler(req, res, next) {
    try {
        const patch = req.body;
        const customer = await (0, customerAdminService_1.adminUpdateCustomer)(Number(req.params.id), patch);
        (0, response_1.successRes)(res, 'Customer updated.', { customer: { id: customer.id } }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function remindHandler(req, res, next) {
    try {
        const dryRun = req.query.dryRun === 'true';
        const result = await (0, customerAdminService_1.sendDueReminders)({ dryRun });
        (0, response_1.successRes)(res, dryRun ? 'Reminder preview.' : 'Reminders sent.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=customerAdminController.js.map