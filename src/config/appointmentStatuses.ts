import type { AppointmentStatus } from '../types'
import { APPOINTMENT_STATUSES } from '../types'

export const AppointmentStatusValue = {
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  READY_FOR_SERVICE: 'READY_FOR_SERVICE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} satisfies Record<AppointmentStatus, AppointmentStatus>

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PAYMENT_REQUIRED: 'Payment Required',
  PAYMENT_SUBMITTED: 'Payment Submitted',
  PAYMENT_VERIFIED: 'Payment Verified',
  PAYMENT_REJECTED: 'Payment Rejected',
  READY_FOR_SERVICE: 'Ready for Service',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PAYMENT_REQUIRED: [AppointmentStatusValue.PAYMENT_SUBMITTED, AppointmentStatusValue.CANCELLED],
  PAYMENT_SUBMITTED: [
    AppointmentStatusValue.PAYMENT_VERIFIED,
    AppointmentStatusValue.PAYMENT_REJECTED,
    AppointmentStatusValue.CANCELLED,
  ],
  PAYMENT_VERIFIED: [AppointmentStatusValue.READY_FOR_SERVICE, AppointmentStatusValue.CANCELLED],
  PAYMENT_REJECTED: [AppointmentStatusValue.PAYMENT_SUBMITTED, AppointmentStatusValue.CANCELLED],
  READY_FOR_SERVICE: [AppointmentStatusValue.IN_PROGRESS, AppointmentStatusValue.CANCELLED],
  IN_PROGRESS: [AppointmentStatusValue.COMPLETED, AppointmentStatusValue.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
}

/** Awaiting payment / verification states (billing not yet resolved). */
export const PENDING_STATUSES: AppointmentStatus[] = [
  AppointmentStatusValue.PAYMENT_REQUIRED,
  AppointmentStatusValue.PAYMENT_SUBMITTED,
]

/** Booked / confirmed states that count toward an active schedule. */
export const CONFIRMED_STATUSES: AppointmentStatus[] = [
  AppointmentStatusValue.PAYMENT_VERIFIED,
  AppointmentStatusValue.READY_FOR_SERVICE,
  AppointmentStatusValue.IN_PROGRESS,
]

/** The only transition that requires an already-verified payment before entering. */
export const PAID_GATED_STATUSES: AppointmentStatus[] = [AppointmentStatusValue.READY_FOR_SERVICE]

/** Statuses that prevent an appointment from occupying a slot. */
export const CANCELLED_STATUS = AppointmentStatusValue.CANCELLED

export function getValidNextStatuses(current: AppointmentStatus): AppointmentStatus[] {
  return VALID_TRANSITIONS[current] ?? []
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export { APPOINTMENT_STATUSES }