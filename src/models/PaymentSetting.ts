import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { PaymentMethod } from '../types'

export class PaymentSetting extends Model<
  InferAttributes<PaymentSetting>,
  InferCreationAttributes<PaymentSetting>
> {
  declare id: CreationOptional<number>
  declare shopName: string
  declare shopAddress: CreationOptional<string | null>
  declare shopPhone: CreationOptional<string | null>
  declare shopLogo: CreationOptional<string | null>
  declare bankName: CreationOptional<string | null>
  declare accountName: CreationOptional<string | null>
  declare accountNumber: CreationOptional<string | null>
  declare opayAccountName: CreationOptional<string | null>
  declare opayAccountNumber: CreationOptional<string | null>
  declare paymentInstructions: CreationOptional<string | null>
  declare enabledPaymentMethods: CreationOptional<PaymentMethod[]>
  declare minAmount: CreationOptional<number>
  declare fullPaymentRequired: CreationOptional<boolean>
  declare receiptRequired: CreationOptional<boolean>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

PaymentSetting.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    shopName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    shopAddress: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    shopPhone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    shopLogo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    bankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    accountName: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    accountNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    opayAccountName: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    opayAccountNumber: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    paymentInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enabledPaymentMethods: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['OPAY', 'BANK_TRANSFER', 'CASH'],
    },
    minAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    fullPaymentRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    receiptRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'payment_settings',
  },
)