import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<number>
  declare customerName: string
  declare customerPhone: CreationOptional<string | null>
  declare customerEmail: CreationOptional<string | null>
  declare customerImage: CreationOptional<string | null>
  declare serviceId: CreationOptional<number | null>
  declare serviceName: CreationOptional<string | null>
  declare barberId: CreationOptional<number | null>
  declare rating: number
  declare comment: string
  declare status: CreationOptional<ReviewStatus>
  declare isApproved: CreationOptional<boolean>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

Review.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    customerName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    customerPhone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    customerImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    serviceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    serviceName: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    barberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'barbers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    rating: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'PENDING',
      validate: { isIn: [REVIEW_STATUSES] },
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'reviews',
    indexes: [
      { fields: ['is_approved'] },
      { fields: ['status'] },
      { fields: ['barber_id'] },
    ],
  },
)