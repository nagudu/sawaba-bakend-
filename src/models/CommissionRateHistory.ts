import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize'
import { sequelize } from '../config/database'
import type { Barber } from './Barber'
import type { Admin } from './Admin'

/**
 * Append-only audit of every commission-rate change for a barber.
 * Earnings themselves rely on the immutable `commissionRateSnapshot` on each
 * `BarberEarning`, so changing a rate NEVER rewrites history — but the admin
 * Commission Rates screen needs this trail to show who changed what and when.
 */
export class CommissionRateHistory extends Model<
  InferAttributes<CommissionRateHistory>,
  InferCreationAttributes<CommissionRateHistory>
> {
  declare id: CreationOptional<number>
  declare barberId: ForeignKey<Barber['id']>
  declare commissionType: 'PERCENTAGE' | 'FIXED'
  declare commissionValue: number
  declare effectiveFrom: Date
  declare changedByAdminId: ForeignKey<Admin['id']> | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

CommissionRateHistory.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    barberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, references: { model: 'barbers', key: 'id' }, onDelete: 'CASCADE' },
    commissionType: { type: DataTypes.ENUM('PERCENTAGE', 'FIXED'), allowNull: false },
    commissionValue: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    effectiveFrom: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    changedByAdminId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'admins', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'commission_rate_history',
    indexes: [{ fields: ['barber_id'] }, { fields: ['effective_from'] }],
  },
)

export default CommissionRateHistory