import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize'
import { sequelize } from '../config/database'
import type { Barber } from './Barber'

export type BarberNotificationType = 'ASSIGNMENT' | 'EARNING' | 'APPOINTMENT' | 'SYSTEM'

/**
 * In-app notification pushed to a barber when something needs their attention:
 * a new assignment, their appointment moved to another barber, a completed
 * appointment earning commission, or a system notice.
 */
export class BarberNotification extends Model<
  InferAttributes<BarberNotification>,
  InferCreationAttributes<BarberNotification>
> {
  declare id: CreationOptional<number>
  declare barberId: ForeignKey<Barber['id']>
  declare type: BarberNotificationType
  declare title: string
  declare message: string
  declare readAt: CreationOptional<Date | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

BarberNotification.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    barberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, references: { model: 'barbers', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.ENUM('ASSIGNMENT', 'EARNING', 'APPOINTMENT', 'SYSTEM'), allowNull: false, defaultValue: 'SYSTEM' },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'barber_notifications',
    indexes: [{ fields: ['barber_id'] }, { fields: ['read_at'] }],
  },
)

export default BarberNotification