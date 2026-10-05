"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gallery = void 0;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
class Gallery extends sequelize_1.Model {
}
exports.Gallery = Gallery;
Gallery.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    title: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false,
    },
    image: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
    },
    category: {
        type: sequelize_1.DataTypes.ENUM(...[
            'HAIRCUT',
            'FADE',
            'BEARD',
            'STYLING',
            'KIDS',
            'SALON',
        ]),
        allowNull: false,
        defaultValue: 'HAIRCUT',
    },
    barberId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: database_1.sequelize,
    tableName: 'gallery',
    indexes: [{ fields: ['category'] }, { fields: ['barber_id'] }],
});
//# sourceMappingURL=Gallery.js.map