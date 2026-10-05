"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Review = exports.REVIEW_STATUSES = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
exports.REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
class Review extends sequelize_1.Model {
}
exports.Review = Review;
Review.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    customerName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    customerPhone: {
        type: sequelize_1.DataTypes.STRING(32),
        allowNull: true,
    },
    customerEmail: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true,
    },
    customerImage: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: true,
    },
    serviceId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    serviceName: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true,
    },
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'barbers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
    },
    rating: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        validate: { min: 1, max: 5 },
    },
    comment: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: { isIn: [exports.REVIEW_STATUSES] },
    },
    isApproved: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'reviews',
    indexes: [
        { fields: ['is_approved'] },
        { fields: ['status'] },
        { fields: ['barber_id'] },
    ],
});
//# sourceMappingURL=Review.js.map