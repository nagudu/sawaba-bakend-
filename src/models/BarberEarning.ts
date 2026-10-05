import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { Appointment } from './Appointment'
import type { Barber, BarberType, CommissionType } from './Barber'

export type EarningStatus = 'PENDING' | 'EARNED' | 'PAID' | 'CANCELLED'

/**
 * Barber commission earning — created when a booking is finalized, with an
 * IMMUTABLE snapshot of the commission terms that applied at booking time.
 * Later changes to the barber's commission config never rewrite history
 * (requirement #9): the snapshots below are the source of truth for payouts.
 *
 * Lifecycle:
 *   PENDING   → booking exists, service not yet completed/paid
 *   EARNED    → payment confirmed AND appointment completed
 *   PAID      → admin has settled the payout (markPaid)
 *   CANCELLED → appointment cancelled (commission never becomes EARNED)
 */
export class BarberEarning extends Model<
  InferAttributes<BarberEarning>,
  InferCreationAttributes<BarberEarning>
> {
  declare id: CreationOptional<number>
  declare appointmentId: number
  declare barberId: number
  /** Classification at booking time (history must not shift when the barber's type changes). */
  declare barberTypeSnapshot: BarberType
  declare commissionType: CommissionType
  /** Snapshot of the rate: percentage (0-100) or fixed naira amount. */
  declare commissionRateSnapshot: number
  /** Actual service amount this commission was computed from (naira). */
  declare serviceAmount: number
  /** Computed barber commission (naira) — backend-calculated, never client-supplied. */
  declare commissionAmount: number
  /** serviceAmount - commissionAmount (naira). */
  declare studioAmount: number
  declare status: CreationOptional<EarningStatus>
  declare earnedAt: CreationOptional<Date | null>
  declare paidAt: CreationOptional<Date | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare appointment?: Appointment
  declare barber?: Barber
}

BarberEarning.init(
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
    barberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    barberTypeSnapshot: {
      type: DataTypes.ENUM('INTERNAL', 'EXTERNAL'),
      allowNull: false,
    },
    commissionType: {
      type: DataTypes.ENUM('PERCENTAGE', 'FIXED'),
      allowNull: false,
    },
    commissionRateSnapshot: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    serviceAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    commissionAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    studioAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'EARNED', 'PAID', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    earnedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'barber_earnings',
    indexes: [
      { fields: ['barber_id', 'status'] },
      { fields: ['appointment_id'] },
      { fields: ['status'] },
    ],
  },
)
