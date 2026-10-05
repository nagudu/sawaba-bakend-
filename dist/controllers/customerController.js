"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCustomersHandler = listCustomersHandler;
const customerService_1 = require("../services/customerService");
const response_1 = require("../utils/response");
async function listCustomersHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, customerService_1.listCustomers)(query);
        (0, response_1.successRes)(res, 'Customers retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=customerController.js.map