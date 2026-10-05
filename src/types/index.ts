export type Role = 'ADMIN' | 'BARBER'

export type AppointmentStatus =
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  | 'READY_FOR_SERVICE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'REJECTED'
  | 'REFUNDED'
  | 'CANCELLED'

export type PaymentMethod = 'OPAY' | 'BANK_TRANSFER' | 'CASH' | 'OTHER' | 'ONLINE'

export type GalleryCategory =
  | 'HAIRCUT'
  | 'FADE'
  | 'BEARD'
  | 'STYLING'
  | 'KIDS'
  | 'SALON'

export type JSendResponse<T> =
  | { success: true; message: string; data: T }
  | { success: false; message: string }

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  perPage: number
}

export interface PaginationQuery {
  page?: number
  perPage?: number
}

export interface AuthedRequest {
  admin: { id: number; email: string; name: string }
}

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PAYMENT_REQUIRED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_VERIFIED',
  'PAYMENT_REJECTED',
  'READY_FOR_SERVICE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'UNPAID',
  'PENDING_VERIFICATION',
  'PAID',
  'REJECTED',
  'REFUNDED',
  'CANCELLED',
]

export const PAYMENT_METHODS: PaymentMethod[] = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE']

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  'HAIRCUT',
  'FADE',
  'BEARD',
  'STYLING',
  'KIDS',
  'SALON',
]