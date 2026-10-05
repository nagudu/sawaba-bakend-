"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarberAvailability = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class BarberAvailability extends sequelize_1.Model {
}
exports.BarberAvailability = BarberAvailability;
BarberAvailability.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    dayOfWeek: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        comment: '0 = Sunday, 6 = Saturday (JavaScript getDay convention)',
        validate: { min: 0, max: 6 },
    },
    startTime: {
        type: sequelize_1.DataTypes.STRING(8),
        allowNull: false,
        comment: 'Format HH:mm',
    },
    endTime: {
        type: sequelize_1.DataTypes.STRING(8),
        allowNull: false,
        comment: 'Format HH:mm',
    },
    isAvailable: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barber_availability',
    indexes: [{ unique: true, fields: ['barber_id', 'day_of_week'] }],
});
//# sourceMappingURL=BarberAvailability.js.map