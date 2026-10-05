"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPOINTMENT_STATUSES = exports.CANCELLED_STATUS = exports.PAID_GATED_STATUSES = exports.CONFIRMED_STATUSES = exports.PENDING_STATUSES = exports.VALID_TRANSITIONS = exports.APPOINTMENT_STATUS_LABELS = exports.AppointmentStatusValue = void 0;
exports.getValidNextStatuses = getValidNextStatuses;
exports.canTransition = canTransition;
const types_1 = require("../types");
Object.defineProperty(exports, "APPOINTMENT_STATUSES", { enumerable: true, get: function () { return types_1.APPOINTMENT_STATUSES; } });
exports.AppointmentStatusValue = {
    PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
    PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
    PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
    PAYMENT_REJECTED: 'PAYMENT_REJECTED',
    READY_FOR_SERVICE: 'READY_FOR_SERVICE',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
};
exports.APPOINTMENT_STATUS_LABELS = {
    PAYMENT_REQUIRED: 'Payment Required',
    PAYMENT_SUBMITTED: 'Payment Submitted',
    PAYMENT_VERIFIED: 'Payment Verified',
    PAYMENT_REJECTED: 'Payment Rejected',
    READY_FOR_SERVICE: 'Ready for Service',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};
exports.VALID_TRANSITIONS = {
    PAYMENT_REQUIRED: [exports.AppointmentStatusValue.PAYMENT_SUBMITTED, exports.AppointmentStatusValue.CANCELLED],
    PAYMENT_SUBMITTED: [
        exports.AppointmentStatusValue.PAYMENT_VERIFIED,
        exports.AppointmentStatusValue.PAYMENT_REJECTED,
        exports.AppointmentStatusValue.CANCELLED,
    ],
    PAYMENT_VERIFIED: [exports.AppointmentStatusValue.READY_FOR_SERVICE, exports.AppointmentStatusValue.CANCELLED],
    PAYMENT_REJECTED: [exports.AppointmentStatusValue.PAYMENT_SUBMITTED, exports.AppointmentStatusValue.CANCELLED],
    READY_FOR_SERVICE: [exports.AppointmentStatusValue.IN_PROGRESS, exports.AppointmentStatusValue.CANCELLED],
    IN_PROGRESS: [exports.AppointmentStatusValue.COMPLETED, exports.AppointmentStatusValue.CANCELLED],
    COMPLETED: [],
    CANCELLED: [],
};
/** Awaiting payment / verification states (billing not yet resolved). */
exports.PENDING_STATUSES = [
    exports.AppointmentStatusValue.PAYMENT_REQUIRED,
    exports.AppointmentStatusValue.PAYMENT_SUBMITTED,
];
/** Booked / confirmed states that count toward an active schedule. */
exports.CONFIRMED_STATUSES = [
    exports.AppointmentStatusValue.PAYMENT_VERIFIED,
    exports.AppointmentStatusValue.READY_FOR_SERVICE,
    exports.AppointmentStatusValue.IN_PROGRESS,
];
/** The only transition that requires an already-verified payment before entering. */
exports.PAID_GATED_STATUSES = [exports.AppointmentStatusValue.READY_FOR_SERVICE];
/** Statuses that prevent an appointment from occupying a slot. */
exports.CANCELLED_STATUS = exports.AppointmentStatusValue.CANCELLED;
function getValidNextStatuses(current) {
    return exports.VALID_TRANSITIONS[current] ?? [];
}
function canTransition(from, to) {
    return exports.VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
//# sourceMappingURL=appointmentStatuses.js.map