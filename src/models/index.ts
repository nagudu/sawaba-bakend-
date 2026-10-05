import { Admin } from './Admin'
import { Customer } from './Customer'
import { CustomerOtp } from './CustomerOtp'
import { Service } from './Service'
import { Barber } from './Barber'
import { BarberService } from './BarberService'
import { Appointment } from './Appointment'
import { BarberAvailability } from './BarberAvailability'
import { Gallery } from './Gallery'
import { Review, type ReviewStatus } from './Review'
import { ContactMessage } from './ContactMessage'
import { ContactReply } from './ContactReply'
import { Payment } from './Payment'
import { PaymentSetting } from './PaymentSetting'
import { CheckoutSession } from './CheckoutSession'
import { BarberEarning } from './BarberEarning'
import { BarberAssignmentHistory } from './BarberAssignmentHistory'
import { CommissionRateHistory } from './CommissionRateHistory'
import { BarberNotification } from './BarberNotification'

// Barber <-> Service (many-to-many via BarberService)
Barber.belongsToMany(Service, { through: BarberService, as: 'services', foreignKey: 'barberId', otherKey: 'serviceId' })
Service.belongsToMany(Barber, { through: BarberService, as: 'barbers', foreignKey: 'serviceId', otherKey: 'barberId' })

// Customer
Customer.hasMany(Appointment, { as: 'appointments', foreignKey: 'customerId', onDelete: 'SET NULL' })
Customer.hasMany(Payment, { as: 'payments', foreignKey: 'customerId', onDelete: 'SET NULL' })

// Appointment
Appointment.belongsTo(Service, { as: 'service', foreignKey: 'serviceId', onDelete: 'RESTRICT' })
Appointment.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'RESTRICT' })
// Admin-assigned barber (assignment system) — may be null until assigned.
Appointment.belongsTo(Barber, { as: 'assignedBarber', foreignKey: 'assignedBarberId', onDelete: 'SET NULL' })
Appointment.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId', onDelete: 'SET NULL' })
Appointment.hasOne(Payment, { as: 'payment', foreignKey: 'appointmentId', onDelete: 'CASCADE' })
Service.hasMany(Appointment, { foreignKey: 'serviceId' })
Barber.hasMany(Appointment, { foreignKey: 'barberId' })

// Payment
Payment.belongsTo(Appointment, { as: 'appointment', foreignKey: 'appointmentId', onDelete: 'CASCADE' })
Payment.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId', onDelete: 'SET NULL' })

// BarberAvailability
BarberAvailability.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'CASCADE' })
Barber.hasMany(BarberAvailability, { foreignKey: 'barberId' })

// Gallery
Gallery.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'SET NULL' })
Barber.hasMany(Gallery, { foreignKey: 'barberId' })

// Contact messaging
ContactMessage.hasMany(ContactReply, {
  as: 'replies',
  foreignKey: 'contactMessageId',
  onDelete: 'CASCADE',
})
ContactReply.belongsTo(ContactMessage, { as: 'contactMessage', foreignKey: 'contactMessageId', onDelete: 'CASCADE' })
ContactReply.belongsTo(Admin, { as: 'admin', foreignKey: 'adminId', onDelete: 'SET NULL' })

// Checkout sessions (temporary booking sessions — NOT appointments until payment completes)
CheckoutSession.belongsTo(Service, { as: 'service', foreignKey: 'serviceId', onDelete: 'CASCADE' })
CheckoutSession.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'CASCADE' })

// Barber earnings (commission ledger with immutable snapshots)
BarberEarning.belongsTo(Appointment, { as: 'appointment', foreignKey: 'appointmentId', onDelete: 'CASCADE' })
BarberEarning.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'CASCADE' })
Appointment.hasOne(BarberEarning, { as: 'earning', foreignKey: 'appointmentId', onDelete: 'CASCADE' })
Barber.hasMany(BarberEarning, { as: 'earnings', foreignKey: 'barberId', onDelete: 'CASCADE' })

// Barber assignment audit trail
BarberAssignmentHistory.belongsTo(Appointment, { as: 'appointment', foreignKey: 'appointmentId', onDelete: 'CASCADE' })
BarberAssignmentHistory.belongsTo(Barber, { as: 'previousBarber', foreignKey: 'previousBarberId', onDelete: 'SET NULL' })
BarberAssignmentHistory.belongsTo(Barber, { as: 'newBarber', foreignKey: 'newBarberId', onDelete: 'SET NULL' })
BarberAssignmentHistory.belongsTo(Admin, { as: 'changedBy', foreignKey: 'changedByAdminId', onDelete: 'SET NULL' })
Appointment.hasMany(BarberAssignmentHistory, { as: 'assignmentHistory', foreignKey: 'appointmentId', onDelete: 'CASCADE' })

// Commission rate audit (append-only)
CommissionRateHistory.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'CASCADE' })
CommissionRateHistory.belongsTo(Admin, { as: 'changedBy', foreignKey: 'changedByAdminId', onDelete: 'SET NULL' })
Barber.hasMany(CommissionRateHistory, { as: 'commissionHistory', foreignKey: 'barberId', onDelete: 'CASCADE' })

// Barber in-app notifications
BarberNotification.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'CASCADE' })
Barber.hasMany(BarberNotification, { as: 'notifications', foreignKey: 'barberId', onDelete: 'CASCADE' })

// Reviews
Review.belongsTo(Barber, { as: 'barber', foreignKey: 'barberId', onDelete: 'SET NULL' })
Barber.hasMany(Review, { as: 'reviews', foreignKey: 'barberId', onDelete: 'SET NULL' })

export {
  Admin,
  Customer,
  CustomerOtp,
  Service,
  Barber,
  BarberService,
  Appointment,
  BarberAvailability,
  Gallery,
  Review,
  type ReviewStatus,
  ContactMessage,
  ContactReply,
  Payment,
  PaymentSetting,
  CheckoutSession,
  BarberEarning,
  BarberAssignmentHistory,
  CommissionRateHistory,
  BarberNotification,
}