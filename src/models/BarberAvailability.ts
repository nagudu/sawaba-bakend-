import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { Barber } from './Barber'

export class BarberAvailability extends Model<
  InferAttributes<BarberAvailability>,
  InferCreationAttributes<BarberAvailability>
> {
  declare id: CreationOptional<number>
  declare barberId: number
  declare dayOfWeek: number
  declare startTime: string
  declare endTime: string
  declare isAvailable: CreationOptional<boolean>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare barber?: Barber
}

BarberAvailability.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    barberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    dayOfWeek: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      comment: '0 = Sunday, 6 = Saturday (JavaScript getDay convention)',
      validate: { min: 0, max: 6 },
    },
    startTime: {
      type: DataTypes.STRING(8),
      allowNull: false,
      comment: 'Format HH:mm',
    },
    endTime: {
      type: DataTypes.STRING(8),
      allowNull: false,
      comment: 'Format HH:mm',
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'barber_availability',
    indexes: [{ unique: true, fields: ['barber_id', 'day_of_week'] }],
  },
)