"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContactHandler = createContactHandler;
exports.listContactHandler = listContactHandler;
exports.getContactHandler = getContactHandler;
exports.markContactReadHandler = markContactReadHandler;
exports.updateContactStatusHandler = updateContactStatusHandler;
exports.replyContactHandler = replyContactHandler;
exports.deleteContactHandler = deleteContactHandler;
const contactService_1 = require("../services/contactService");
const response_1 = require("../utils/response");
async function createContactHandler(req, res, next) {
    try {
        const input = req.body;
        const message = await (0, contactService_1.createContactMessage)(input);
        (0, response_1.successRes)(res, 'Message sent successfully. We will get back to you shortly.', message, 201);
    }
    catch (error) {
        next(error);
    }
}
async function listContactHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, contactService_1.listContactMessages)(query);
        (0, response_1.successRes)(res, 'Contact messages retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getContactHandler(req, res, next) {
    try {
        const message = await (0, contactService_1.getContactThread)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Contact message retrieved.', message, 200);
    }
    catch (error) {
        next(error);
    }
}
async function markContactReadHandler(req, res, next) {
    try {
        const isRead = Boolean(req.body.isRead ?? true);
        const message = await (0, contactService_1.markContactRead)(Number(req.params.id), isRead);
        (0, response_1.successRes)(res, 'Contact message status updated.', message, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateContactStatusHandler(req, res, next) {
    try {
        const { status } = req.body;
        const message = await (0, contactService_1.updateContactStatus)(Number(req.params.id), status);
        (0, response_1.successRes)(res, 'Contact message status updated.', message, 200);
    }
    catch (error) {
        next(error);
    }
}
async function replyContactHandler(req, res, next) {
    try {
        const { message } = req.body;
        const admin = req.admin;
        const result = await (0, contactService_1.sendContactReply)({
            contactMessageId: Number(req.params.id),
            adminId: admin.id,
            adminName: admin.name,
            message,
        });
        (0, response_1.successRes)(res, 'Reply sent successfully.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function deleteContactHandler(req, res, next) {
    try {
        await (0, contactService_1.deleteContactMessage)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Contact message deleted successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=contactController.js.map