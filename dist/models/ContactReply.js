"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactReply = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class ContactReply extends sequelize_1.Model {
}
exports.ContactReply = ContactReply;
ContactReply.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    contactMessageId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'contact_messages', key: 'id' },
        onDelete: 'CASCADE',
    },
    adminId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'admins', key: 'id' },
        onDelete: 'SET NULL',
    },
    adminName: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: true,
    },
    recipientEmail: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
    },
    subject: {
        type: sequelize_1.DataTypes.STRING(250),
        allowNull: false,
    },
    message: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    providerMessageId: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    sentAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'contact_replies',
    indexes: [{ fields: ['contact_message_id'] }],
});
//# sourceMappingURL=ContactReply.js.map