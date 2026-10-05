"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class Service extends sequelize_1.Model {
}
exports.Service = Service;
Service.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    slug: {
        type: sequelize_1.DataTypes.STRING(160),
        allowNull: false,
        unique: true,
    },
    description: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    price: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: 0 },
    },
    duration: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Duration in minutes',
    },
    image: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    category: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'HAIRCUTS',
    },
    isActive: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'services',
    indexes: [{ fields: ['slug'] }, { fields: ['category'] }, { fields: ['is_active'] }],
});
//# sourceMappingURL=Service.js.map