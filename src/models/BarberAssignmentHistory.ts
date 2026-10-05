import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { Appointment } from './Appointment'
import type { Barber } from './Barber'
import type { Admin } from './Admin'

/**
 * Immutable audit trail of barber assignments (requirement #21): every
 * admin assignment, reassignment or removal appends a row. Accountability
 * data — never exposed publicly, never edited once written.
 */
export class BarberAssignmentHistory extends Model<
  InferAttributes<BarberAssignmentHistory>,
  InferCreationAttributes<BarberAssignmentHistory>
> {
  declare id: CreationOptional<number>
  declare appointmentId: number
  /** Barber BEFORE the change (null when the booking had none recorded). */
  declare previousBarberId: CreationOptional<number | null>
  /** Barber AFTER the change (null when the assignment was removed). */
  declare newBarberId: CreationOptional<number | null>
  declare action: 'ASSIGNED' | 'REASSIGNED' | 'REMOVED'
  declare reason: CreationOptional<string | null>
  declare changedByAdminId: CreationOptional<number | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare appointment?: Appointment
  declare previousBarber?: Barber
  declare newBarber?: Barber
  declare changedBy?: Admin
}

BarberAssignmentHistory.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    previousBarberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    newBarberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM('ASSIGNED', 'REASSIGNED', 'REMOVED'),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    changedByAdminId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'barber_assignment_history',
    indexes: [{ fields: ['appointment_id'] }],
    // Append-only audit trail: rows must never be silently updated.
    updatedAt: false,
  },
)
