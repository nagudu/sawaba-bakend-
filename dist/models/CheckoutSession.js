"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutSession = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * Temporary booking checkout session (NOT an appointment).
 *
 * A session is created when the customer reaches the payment step with a
 * chosen payment method. It holds the booking details but creates NO
 * Appointment and NO Payment records — those are only written, atomically,
 * once the required payment condition is satisfied:
 *
 *   CASH / BANK_TRANSFER / OPAY → finalizeCheckout() converts the session
 *   ONLINE                      → only after Paystack's server-verified success
 *                                 (verifyCheckoutPaystack / webhook)
 *
 * Abandoned sessions simply stay OPEN/EXPIRED forever and never appear in any
 * dashboard — there is genuinely nothing to show. Converted sessions keep a
 * pointer (convertedAppointmentId) for idempotent callback handling.
 */
class CheckoutSession extends sequelize_1.Model {
}
exports.CheckoutSession = CheckoutSession;
CheckoutSession.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    sessionToken: {
        type: sequelize_1.DataTypes.STRING(64),
        allowNull: false,
        unique: true,
    },
    customerName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    customerPhone: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
    },
    customerEmail: {
        type: sequelize_1.DataTypes.STRING(191),
        allowNull: true,
    },
    customerLocation: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
    },
    serviceId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    appointmentDate: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    appointmentTime: {
        type: sequelize_1.DataTypes.STRING(5),
        allowNull: false,
    },
    notes: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    totalAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    paymentMethod: {
        type: sequelize_1.DataTypes.ENUM('OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE'),
        allowNull: true,
    },
    transactionReference: {
        type: sequelize_1.DataTypes.STRING(191),
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM('OPEN', 'AWAITING_PAYMENT', 'CONVERTED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'OPEN',
    },
    paystackReference: {
        type: sequelize_1.DataTypes.STRING(191),
        allowNull: true,
    },
    convertedAppointmentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    receiptUrl: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    receiptPublicId: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'checkout_sessions',
    updatedAt: 'updatedAt',
    indexes: [
        { fields: ['status'] },
        { fields: ['appointment_date'] },
        { fields: ['paystack_reference'] },
    ],
});
//# sourceMappingURL=CheckoutSession.js.map