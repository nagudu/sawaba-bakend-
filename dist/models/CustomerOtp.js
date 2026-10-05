"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerOtp = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * Short-lived hashed OTP codes for customer phone verification (login and
 * registration). Only the hash is stored — a database leak never yields
 * usable codes. Attempt counts are enforced by the auth service.
 */
class CustomerOtp extends sequelize_1.Model {
}
exports.CustomerOtp = CustomerOtp;
CustomerOtp.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
    },
    purpose: {
        type: sequelize_1.DataTypes.ENUM('LOGIN', 'REGISTER'),
        allowNull: false,
    },
    codeHash: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
    },
    attempts: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    consumedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    expiresAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'customer_otps',
    indexes: [{ fields: ['phone', 'purpose'] }],
});
//# sourceMappingURL=CustomerOtp.js.map