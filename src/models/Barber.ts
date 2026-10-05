import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { Service } from './Service'

export type BarberType = 'INTERNAL' | 'EXTERNAL'
export type CommissionType = 'PERCENTAGE' | 'FIXED'

export class Barber extends Model<InferAttributes<Barber>, InferCreationAttributes<Barber>> {
  declare id: CreationOptional<number>
  declare name: string
  declare slug: string
  declare image: CreationOptional<string | null>
  declare phone: CreationOptional<string | null>
  declare email: CreationOptional<string | null>
  declare specialty: CreationOptional<string | null>
  declare biography: CreationOptional<string | null>
  declare experience: CreationOptional<number>
  declare rating: CreationOptional<number>
  /** Business classification — INTERNAL (works at the studio) or EXTERNAL (covers other areas). Admin-only data. */
  declare barberType: CreationOptional<BarberType>
  /** Coverage area / base location, mainly for EXTERNAL barbers (e.g. "Dutse, Jigawa"). Admin-only. */
  declare location: CreationOptional<string | null>
  /** How commission is computed for this barber. Admin-only. */
  declare commissionType: CreationOptional<CommissionType>
  /** PERCENTAGE: 0-100. FIXED: naira amount per completed appointment. Admin-only. */
  declare commissionValue: CreationOptional<number>
  declare isActive: CreationOptional<boolean>
  /** Whether this barber may sign in to the Barber Portal (`/barber`). */
  declare portalEnabled: CreationOptional<boolean>
  /** bcrypt hash of the barber portal password. Null until admin issues credentials. */
  declare passwordHash: CreationOptional<string | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare services?: Service[]
  declare setServices: (ids: number[]) => Promise<void>
}

Barber.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(160),
      allowNull: false,
      unique: true,
    },
    image: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    specialty: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    biography: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    experience: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: 'Years of experience',
    },
    rating: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: false,
      defaultValue: 0,
    },
    barberType: {
      type: DataTypes.ENUM('INTERNAL', 'EXTERNAL'),
      allowNull: false,
      defaultValue: 'INTERNAL',
      comment: 'INTERNAL = studio barber, EXTERNAL = covers other locations. Admin-only classification.',
    },
    location: {
      type: DataTypes.STRING(150),
      allowNull: true,
      comment: 'Coverage area / base location (e.g. "Dutse, Jigawa"). Admin-only.',
    },
    commissionType: {
      type: DataTypes.ENUM('PERCENTAGE', 'FIXED'),
      allowNull: false,
      defaultValue: 'PERCENTAGE',
    },
    commissionValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'PERCENTAGE: 0-100. FIXED: naira per completed appointment.',
      validate: { min: 0 },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    portalEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Barber may sign in to the Barber Portal.',
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'bcrypt hash — portal login credential (admin-issued).',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'barbers',
    indexes: [{ fields: ['slug'] }, { fields: ['is_active'] }],
  },
)