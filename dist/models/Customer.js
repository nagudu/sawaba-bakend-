"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Customer = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class Customer extends sequelize_1.Model {
}
exports.Customer = Customer;
Customer.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    fullName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
    },
    email: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
    },
    customerCode: {
        type: sequelize_1.DataTypes.STRING(12),
        allowNull: true,
        unique: true,
    },
    passwordHash: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    preferredBarberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    favoriteServiceId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    avatarUrl: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    googleSub: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    phoneVerified: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    reminderOptIn: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    isActive: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    lastLoginAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'customers',
    indexes: [
        { fields: ['phone'] },
        { fields: ['email'] },
        { unique: true, fields: ['google_sub'] },
    ],
});
//# sourceMappingURL=Customer.js.map