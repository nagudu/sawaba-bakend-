"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Payment = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class Payment extends sequelize_1.Model {
}
exports.Payment = Payment;
Payment.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    appointmentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
    },
    customerId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    amount: {
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
    paymentDate: {
        type: sequelize_1.DataTypes.DATEONLY,
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
    providerRef: {
        type: sequelize_1.DataTypes.STRING(64),
        allowNull: true,
    },
    note: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM('UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'UNPAID',
    },
    rejectionReason: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    verifiedBy: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    verifiedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    accessToken: {
        type: sequelize_1.DataTypes.STRING(64),
        allowNull: false,
        unique: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'payments',
    indexes: [
        { fields: ['appointment_id'] },
        { fields: ['status'] },
        { fields: ['payment_method'] },
        { fields: ['payment_date'] },
    ],
});
//# sourceMappingURL=Payment.js.map