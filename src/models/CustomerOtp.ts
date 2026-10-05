import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'

/**
 * Short-lived hashed OTP codes for customer phone verification (login and
 * registration). Only the hash is stored — a database leak never yields
 * usable codes. Attempt counts are enforced by the auth service.
 */
export class CustomerOtp extends Model<
  InferAttributes<CustomerOtp>,
  InferCreationAttributes<CustomerOtp>
> {
  declare id: CreationOptional<number>
  declare phone: string
  declare purpose: 'LOGIN' | 'REGISTER'
  declare codeHash: string
  declare attempts: CreationOptional<number>
  declare consumedAt: CreationOptional<Date | null>
  declare expiresAt: Date
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

CustomerOtp.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    purpose: {
      type: DataTypes.ENUM('LOGIN', 'REGISTER'),
      allowNull: false,
    },
    codeHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customer_otps',
    indexes: [{ fields: ['phone', 'purpose'] }],
  },
)
