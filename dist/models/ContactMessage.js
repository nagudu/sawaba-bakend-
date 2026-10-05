"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactMessage = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class ContactMessage extends sequelize_1.Model {
}
exports.ContactMessage = ContactMessage;
ContactMessage.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: true,
    },
    email: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
    },
    subject: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: true,
    },
    message: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    isRead: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM('NEW', 'READ', 'REPLIED', 'ARCHIVED'),
        allowNull: false,
        defaultValue: 'NEW',
    },
    repliedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    archivedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'contact_messages',
    indexes: [{ fields: ['is_read'] }],
});
//# sourceMappingURL=ContactMessage.js.map