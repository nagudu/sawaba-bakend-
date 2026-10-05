"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Appointment = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const types_1 = require("../types");
const STATUS_VALUES = [...types_1.APPOINTMENT_STATUSES];
class Appointment extends sequelize_1.Model {
}
exports.Appointment = Appointment;
Appointment.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    referenceCode: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: true,
        unique: true,
    },
    customerName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    customerPhone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
    },
    customerEmail: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
    },
    customerLocation: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
        comment: 'Customer-stated location/area at booking. Helps admin pick the right barber — never auto-assigns.',
    },
    customerId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
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
    assignedBarberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'Admin-assigned barber. Falls back to barberId when null.',
    },
    assignedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    assignedBy: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    appointmentDate: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    appointmentTime: {
        type: sequelize_1.DataTypes.STRING(8),
        allowNull: false,
    },
    totalAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    notes: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    serviceStartedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    completedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    cancelledAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    cancellationReason: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    cancelledBy: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM(...STATUS_VALUES),
        allowNull: false,
        defaultValue: 'PAYMENT_REQUIRED',
        validate: {
            isIn: [STATUS_VALUES],
        },
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'appointments',
    indexes: [
        { fields: ['appointment_date', 'appointment_time'] },
        { fields: ['barber_id', 'appointment_date'] },
        { fields: ['status'] },
    ],
});
//# sourceMappingURL=Appointment.js.map