"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarberService = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class BarberService extends sequelize_1.Model {
}
exports.BarberService = BarberService;
BarberService.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    serviceId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barber_services',
    indexes: [{ unique: true, fields: ['barber_id', 'service_id'] }],
});
//# sourceMappingURL=BarberService.js.map