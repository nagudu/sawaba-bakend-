"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Barber = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class Barber extends sequelize_1.Model {
}
exports.Barber = Barber;
Barber.init({
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
    image: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(32),
        allowNull: true,
    },
    email: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    specialty: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    biography: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    experience: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: 'Years of experience',
    },
    rating: {
        type: sequelize_1.DataTypes.DECIMAL(2, 1),
        allowNull: false,
        defaultValue: 0,
    },
    barberType: {
        type: sequelize_1.DataTypes.ENUM('INTERNAL', 'EXTERNAL'),
        allowNull: false,
        defaultValue: 'INTERNAL',
        comment: 'INTERNAL = studio barber, EXTERNAL = covers other locations. Admin-only classification.',
    },
    location: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
        comment: 'Coverage area / base location (e.g. "Dutse, Jigawa"). Admin-only.',
    },
    commissionType: {
        type: sequelize_1.DataTypes.ENUM('PERCENTAGE', 'FIXED'),
        allowNull: false,
        defaultValue: 'PERCENTAGE',
    },
    commissionValue: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'PERCENTAGE: 0-100. FIXED: naira per completed appointment.',
        validate: { min: 0 },
    },
    isActive: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    portalEnabled: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Barber may sign in to the Barber Portal.',
    },
    passwordHash: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
        comment: 'bcrypt hash — portal login credential (admin-issued).',
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'barbers',
    indexes: [{ fields: ['slug'] }, { fields: ['is_active'] }],
});
//# sourceMappingURL=Barber.js.map