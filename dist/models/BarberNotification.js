"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarberNotification = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * In-app notification pushed to a barber when something needs their attention:
 * a new assignment, their appointment moved to another barber, a completed
 * appointment earning commission, or a system notice.
 */
class BarberNotification extends sequelize_1.Model {
}
exports.BarberNotification = BarberNotification;
BarberNotification.init({
    id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    barberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: false, references: { model: 'barbers', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: sequelize_1.DataTypes.ENUM('ASSIGNMENT', 'EARNING', 'APPOINTMENT', 'SYSTEM'), allowNull: false, defaultValue: 'SYSTEM' },
    title: { type: sequelize_1.DataTypes.STRING(160), allowNull: false },
    message: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    readAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barber_notifications',
    indexes: [{ fields: ['barber_id'] }, { fields: ['read_at'] }],
});
exports.default = BarberNotification;
//# sourceMappingURL=BarberNotification.js.map