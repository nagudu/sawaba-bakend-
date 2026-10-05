import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'

export class Customer extends Model<InferAttributes<Customer>, InferCreationAttributes<Customer>> {
  declare id: CreationOptional<number>
  declare fullName: string
  declare phone: string
  declare email: CreationOptional<string | null>
  declare customerCode: CreationOptional<string | null>
  declare passwordHash: CreationOptional<string | null>
  declare preferredBarberId: CreationOptional<number | null>
  declare favoriteServiceId: CreationOptional<number | null>
  declare avatarUrl: CreationOptional<string | null>
  /** Google's stable per-account user id (the `sub` claim). Null = not linked. */
  declare googleSub: CreationOptional<string | null>
  /** False for accounts created by Google, which have no phone number yet. */
  declare phoneVerified: CreationOptional<boolean>
  declare reminderOptIn: CreationOptional<boolean>
  declare isActive: CreationOptional<boolean>
  declare lastLoginAt: CreationOptional<Date | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

Customer.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    fullName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    customerCode: {
      type: DataTypes.STRING(12),
      allowNull: true,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    preferredBarberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    favoriteServiceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    googleSub: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phoneVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    reminderOptIn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customers',
    indexes: [
      { fields: ['phone'] },
      { fields: ['email'] },
      { unique: true, fields: ['google_sub'] },
    ],
  },
)