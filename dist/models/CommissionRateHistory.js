"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionRateHistory = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * Append-only audit of every commission-rate change for a barber.
 * Earnings themselves rely on the immutable `commissionRateSnapshot` on each
 * `BarberEarning`, so changing a rate NEVER rewrites history — but the admin
 * Commission Rates screen needs this trail to show who changed what and when.
 */
class CommissionRateHistory extends sequelize_1.Model {
}
exports.CommissionRateHistory = CommissionRateHistory;
CommissionRateHistory.init({
    id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    barberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: false, references: { model: 'barbers', key: 'id' }, onDelete: 'CASCADE' },
    commissionType: { type: sequelize_1.DataTypes.ENUM('PERCENTAGE', 'FIXED'), allowNull: false },
    commissionValue: { type: sequelize_1.DataTypes.DECIMAL(10, 2), allowNull: false },
    effectiveFrom: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
    changedByAdminId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'admins', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'commission_rate_history',
    indexes: [{ fields: ['barber_id'] }, { fields: ['effective_from'] }],
});
exports.default = CommissionRateHistory;
//# sourceMappingURL=CommissionRateHistory.js.map