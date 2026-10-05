import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import { APPOINTMENT_STATUSES, type AppointmentStatus } from '../types'
import type { Service } from './Service'
import type { Barber } from './Barber'
import type { Customer } from './Customer'
import type { Payment } from './Payment'

const STATUS_VALUES = [...APPOINTMENT_STATUSES] as [string, ...string[]]

export class Appointment extends Model<
  InferAttributes<Appointment>,
  InferCreationAttributes<Appointment>
> {
  declare id: CreationOptional<number>
  declare referenceCode: CreationOptional<string | null>
  declare customerId: CreationOptional<number | null>
  declare customerName: string
  declare customerPhone: string
  declare customerEmail: CreationOptional<string | null>
  /** Customer's stated location/area at booking (e.g. "Dutse, Jigawa"). Optional context for admin assignment. */
  declare customerLocation: CreationOptional<string | null>
  declare serviceId: number
  declare barberId: number
  /** Barber actually assigned by admin (defaults to the booked barber). Admin-managed. */
  declare assignedBarberId: CreationOptional<number | null>
  declare assignedAt: CreationOptional<Date | null>
  declare assignedBy: CreationOptional<number | null>
  declare appointmentDate: string
  declare appointmentTime: string
  declare totalAmount: number
  declare notes: CreationOptional<string | null>
  declare status: CreationOptional<AppointmentStatus>
  declare serviceStartedAt: CreationOptional<Date | null>
  declare completedAt: CreationOptional<Date | null>
  declare cancelledAt: CreationOptional<Date | null>
  declare cancellationReason: CreationOptional<string | null>
  declare cancelledBy: CreationOptional<number | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare service?: Service
  declare barber?: Barber
  declare customer?: Customer
  declare payment?: Payment
}

Appointment.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    referenceCode: {
      type: DataTypes.STRING(30),
      allowNull: true,
      unique: true,
    },
    customerName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    customerPhone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    customerLocation: {
      type: DataTypes.STRING(150),
      allowNull: true,
      comment: 'Customer-stated location/area at booking. Helps admin pick the right barber — never auto-assigns.',
    },
    customerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    serviceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    barberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    assignedBarberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'Admin-assigned barber. Falls back to barberId when null.',
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    assignedBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    appointmentDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    appointmentTime: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    serviceStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...STATUS_VALUES),
      allowNull: false,
      defaultValue: 'PAYMENT_REQUIRED',
      validate: {
        isIn: [STATUS_VALUES],
      },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'appointments',
    indexes: [
      { fields: ['appointment_date', 'appointment_time'] },
      { fields: ['barber_id', 'appointment_date'] },
      { fields: ['status'] },
    ],
  },
)