"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarberEarning = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * Barber commission earning — created when a booking is finalized, with an
 * IMMUTABLE snapshot of the commission terms that applied at booking time.
 * Later changes to the barber's commission config never rewrite history
 * (requirement #9): the snapshots below are the source of truth for payouts.
 *
 * Lifecycle:
 *   PENDING   → booking exists, service not yet completed/paid
 *   EARNED    → payment confirmed AND appointment completed
 *   PAID      → admin has settled the payout (markPaid)
 *   CANCELLED → appointment cancelled (commission never becomes EARNED)
 */
class BarberEarning extends sequelize_1.Model {
}
exports.BarberEarning = BarberEarning;
BarberEarning.init({
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
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    barberTypeSnapshot: {
        type: sequelize_1.DataTypes.ENUM('INTERNAL', 'EXTERNAL'),
        allowNull: false,
    },
    commissionType: {
        type: sequelize_1.DataTypes.ENUM('PERCENTAGE', 'FIXED'),
        allowNull: false,
    },
    commissionRateSnapshot: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    serviceAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    commissionAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    studioAmount: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM('PENDING', 'EARNED', 'PAID', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    earnedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    paidAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barber_earnings',
    indexes: [
        { fields: ['barber_id', 'status'] },
        { fields: ['appointment_id'] },
        { fields: ['status'] },
    ],
});
//# sourceMappingURL=BarberEarning.js.map