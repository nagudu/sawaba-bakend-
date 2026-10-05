import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { PaymentMethod, PaymentStatus } from '../types'
import type { Appointment } from './Appointment'
import type { Customer } from './Customer'

export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  declare id: CreationOptional<number>
  declare appointmentId: number
  declare customerId: CreationOptional<number | null>
  declare amount: number
  declare paymentMethod: CreationOptional<PaymentMethod | null>
  declare transactionReference: CreationOptional<string | null>
  declare paymentDate: CreationOptional<string | null>
  declare receiptUrl: CreationOptional<string | null>
  declare receiptPublicId: CreationOptional<string | null>
  declare providerRef: CreationOptional<string | null>
  declare note: CreationOptional<string | null>
  declare status: CreationOptional<PaymentStatus>
  declare rejectionReason: CreationOptional<string | null>
  declare verifiedBy: CreationOptional<number | null>
  declare verifiedAt: CreationOptional<Date | null>
  declare accessToken: string
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare appointment?: Appointment
  declare customer?: Customer
}

Payment.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
    },
    customerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    paymentMethod: {
      type: DataTypes.ENUM('OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE'),
      allowNull: true,
    },
    transactionReference: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    paymentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    receiptUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    receiptPublicId: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    providerRef: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'UNPAID',
        'PENDING_VERIFICATION',
        'PAID',
        'REJECTED',
        'REFUNDED',
        'CANCELLED',
      ),
      allowNull: false,
      defaultValue: 'UNPAID',
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    verifiedBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    accessToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'payments',
    indexes: [
      { fields: ['appointment_id'] },
      { fields: ['status'] },
      { fields: ['payment_method'] },
      { fields: ['payment_date'] },
    ],
  },
)