import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { GalleryCategory } from '../types'
import type { Barber } from './Barber'

export class Gallery extends Model<InferAttributes<Gallery>, InferCreationAttributes<Gallery>> {
  declare id: CreationOptional<number>
  declare title: string
  declare image: string
  declare category: CreationOptional<GalleryCategory>
  declare barberId: CreationOptional<number | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare barber?: Barber | null
}

Gallery.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(...[
        'HAIRCUT',
        'FADE',
        'BEARD',
        'STYLING',
        'KIDS',
        'SALON',
      ] as const),
      allowNull: false,
      defaultValue: 'HAIRCUT',
    },
    barberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'gallery',
    indexes: [{ fields: ['category'] }, { fields: ['barber_id'] }],
  },
)