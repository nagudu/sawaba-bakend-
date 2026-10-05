"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarberAssignmentHistory = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
/**
 * Immutable audit trail of barber assignments (requirement #21): every
 * admin assignment, reassignment or removal appends a row. Accountability
 * data — never exposed publicly, never edited once written.
 */
class BarberAssignmentHistory extends sequelize_1.Model {
}
exports.BarberAssignmentHistory = BarberAssignmentHistory;
BarberAssignmentHistory.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    appointmentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    previousBarberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    newBarberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    action: {
        type: sequelize_1.DataTypes.ENUM('ASSIGNED', 'REASSIGNED', 'REMOVED'),
        allowNull: false,
    },
    reason: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: true,
    },
    changedByAdminId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barber_assignment_history',
    indexes: [{ fields: ['appointment_id'] }],
    // Append-only audit trail: rows must never be silently updated.
    updatedAt: false,
});
//# sourceMappingURL=BarberAssignmentHistory.js.map