import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize'
import { sequelize } from '../config/database'
import type { Barber } from './Barber'
import type { Service } from './Service'

/**
 * Temporary booking checkout session (NOT an appointment).
 *
 * A session is created when the customer reaches the payment step with a
 * chosen payment method. It holds the booking details but creates NO
 * Appointment and NO Payment records — those are only written, atomically,
 * once the required payment condition is satisfied:
 *
 *   CASH / BANK_TRANSFER / OPAY → finalizeCheckout() converts the session
 *   ONLINE                      → only after Paystack's server-verified success
 *                                 (verifyCheckoutPaystack / webhook)
 *
 * Abandoned sessions simply stay OPEN/EXPIRED forever and never appear in any
 * dashboard — there is genuinely nothing to show. Converted sessions keep a
 * pointer (convertedAppointmentId) for idempotent callback handling.
 */
export class CheckoutSession extends Model<
  InferAttributes<CheckoutSession>,
  InferCreationAttributes<CheckoutSession>
> {
  declare id: CreationOptional<number>
  declare sessionToken: string
  declare customerName: string
  declare customerPhone: string
  declare customerEmail: CreationOptional<string | null>
  /** Customer's stated location/area — admin assignment context, never auto-assigns. */
  declare customerLocation: CreationOptional<string | null>
  declare serviceId: number
  declare barberId: number
  declare appointmentDate: string
  declare appointmentTime: string
  declare notes: CreationOptional<string | null>
  declare totalAmount: number
  /** Payment method chosen at checkout — CASH, BANK_TRANSFER, OPAY or ONLINE. */
  declare paymentMethod: CreationOptional<'OPAY' | 'BANK_TRANSFER' | 'CASH' | 'OTHER' | 'ONLINE' | null>
  /** Optional transfer reference the customer typed (BANK_TRANSFER/OPAY). */
  declare transactionReference: CreationOptional<string | null>
  /** OPEN → selectable | AWAITING_PAYMENT → Paystack txn started | CONVERTED | EXPIRED */
  declare status: CreationOptional<'OPEN' | 'AWAITING_PAYMENT' | 'CONVERTED' | 'EXPIRED'>
  declare paystackReference: CreationOptional<string | null>
  declare convertedAppointmentId: CreationOptional<number | null>
  declare receiptUrl: CreationOptional<string | null>
  declare receiptPublicId: CreationOptional<string | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare service?: Service
  declare barber?: Barber
}

CheckoutSession.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    sessionToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    customerName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    customerEmail: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    customerLocation: {
      type: DataTypes.STRING(150),
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
    appointmentDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    appointmentTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totalAmount: {
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
    status: {
      type: DataTypes.ENUM('OPEN', 'AWAITING_PAYMENT', 'CONVERTED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'OPEN',
    },
    paystackReference: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    convertedAppointmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
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
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'checkout_sessions',
    updatedAt: 'updatedAt',
    indexes: [
      { fields: ['status'] },
      { fields: ['appointment_date'] },
      { fields: ['paystack_reference'] },
    ],
  },
)
