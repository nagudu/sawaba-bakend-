import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'

export class ContactReply extends Model<
  InferAttributes<ContactReply>,
  InferCreationAttributes<ContactReply>
> {
  declare id: CreationOptional<number>
  declare contactMessageId: number
  declare adminId: CreationOptional<number | null>
  declare adminName: CreationOptional<string | null>
  declare recipientEmail: string
  declare subject: string
  declare message: string
  declare status: CreationOptional<'PENDING' | 'SENT' | 'FAILED'>
  declare providerMessageId: CreationOptional<string | null>
  declare sentAt: CreationOptional<Date | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

ContactReply.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    contactMessageId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'contact_messages', key: 'id' },
      onDelete: 'CASCADE',
    },
    adminId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'admins', key: 'id' },
      onDelete: 'SET NULL',
    },
    adminName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    recipientEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true },
    },
    subject: {
      type: DataTypes.STRING(250),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    providerMessageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'contact_replies',
    indexes: [{ fields: ['contact_message_id'] }],
  },
)
