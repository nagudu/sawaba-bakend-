"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentSetting = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class PaymentSetting extends sequelize_1.Model {
}
exports.PaymentSetting = PaymentSetting;
PaymentSetting.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    shopName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    shopAddress: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: true,
    },
    shopPhone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: true,
    },
    shopLogo: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    bankName: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: true,
    },
    accountName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
    },
    accountNumber: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: true,
    },
    opayAccountName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
    },
    opayAccountNumber: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: true,
    },
    paymentInstructions: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    enabledPaymentMethods: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: ['OPAY', 'BANK_TRANSFER', 'CASH'],
    },
    minAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    fullPaymentRequired: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    receiptRequired: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'payment_settings',
});
//# sourceMappingURL=PaymentSetting.js.map