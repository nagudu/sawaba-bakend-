"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVIEW_STATUSES = exports.GALLERY_CATEGORIES = exports.PAYMENT_METHODS = exports.PAYMENT_STATUSES = exports.APPOINTMENT_STATUSES = void 0;
exports.APPOINTMENT_STATUSES = [
    'PAYMENT_REQUIRED',
    'PAYMENT_SUBMITTED',
    'PAYMENT_VERIFIED',
    'PAYMENT_REJECTED',
    'READY_FOR_SERVICE',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
];
exports.PAYMENT_STATUSES = [
    'UNPAID',
    'PENDING_VERIFICATION',
    'PAID',
    'REJECTED',
    'REFUNDED',
    'CANCELLED',
];
exports.PAYMENT_METHODS = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE'];
exports.GALLERY_CATEGORIES = [
    'HAIRCUT',
    'FADE',
    'BEARD',
    'STYLING',
    'KIDS',
    'SALON',
];
/** Reviews are stored in a VARCHAR(10) column, not a DB enum, so this is the only guard. */
exports.REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
//# sourceMappingURL=index.js.map