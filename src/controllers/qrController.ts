import type { NextFunction, Request, Response } from 'express'
import {
  adminRegenerateQr,
  checkInAppointment,
  checkInAppointmentAsAdmin,
  getCustomerAppointmentQr,
  getPublicBookingQr,
  getQrActivityStats,
  listAppointmentQrHistory,
  listQrActivity,
  revokeQrByAdmin,
  validateQrScan,
  validateQrScanAsAdmin,
  type ScanContext,
} from '../services/qrService'
import { successRes } from '../utils/response'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>

const handle =
  (run: (req: Request) => Promise<{ message: string; data?: unknown; status?: number }>): Handler =>
  async (req, res, next) => {
    try {
      const { message, data, status = 200 } = await run(req)
      successRes(res, message, data, status)
    } catch (error) {
      next(error)
    }
  }

function scanMeta(req: Request, source: ScanContext['source'] = 'QR'): ScanContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    source,
  }
}

// ─── Barber scanner ───────────────────────────────────────────────────────────

export const validateQrHandler: Handler = handle(async (req) => {
  const { token, reference } = req.body as { token?: string; reference?: string }
  const result = await validateQrScan(
    req.barber!.id,
    { token: token ?? null, reference: reference ?? null },
    scanMeta(req, token ? 'QR' : 'MANUAL'),
  )
  return { message: result.message, data: { result } }
})

export const checkInQrHandler: Handler = handle(async (req) => {
  const { appointmentId, token } = req.body as { appointmentId: number; token?: string }
  const result = await checkInAppointment(
    req.barber!.id,
    appointmentId,
    { token: token ?? null },
    scanMeta(req, 'MANUAL'),
  )
  return { message: result.message, data: { result } }
})

// ─── Customer ─────────────────────────────────────────────────────────────────

export const getCustomerAppointmentQrHandler: Handler = handle(async (req) => ({
  message: 'Booking QR code fetched.',
  data: await getCustomerAppointmentQr(req.customer!.id, Number(req.params.id)),
}))

// ─── Public (guest) ───────────────────────────────────────────────────────────

export const getPublicBookingQrHandler: Handler = handle(async (req) => {
  const { reference, phone } = req.body as { reference: string; phone: string }
  return {
    message: 'Booking QR code fetched.',
    data: await getPublicBookingQr({ reference, phone }),
  }
})

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminValidateQrHandler: Handler = handle(async (req) => {
  const { token, reference } = req.body as { token?: string; reference?: string }
  const result = await validateQrScanAsAdmin(
    req.admin!.id,
    { token: token ?? null, reference: reference ?? null },
    scanMeta(req, token ? 'QR' : 'MANUAL'),
  )
  return { message: result.message, data: { result } }
})

export const adminCheckInQrHandler: Handler = handle(async (req) => {
  const { appointmentId, token } = req.body as { appointmentId: number; token?: string }
  const result = await checkInAppointmentAsAdmin(
    req.admin!.id,
    appointmentId,
    { token: token ?? null },
    scanMeta(req, 'MANUAL'),
  )
  return { message: result.message, data: { result } }
})

export const appointmentQrHistoryHandler: Handler = handle(async (req) => ({
  message: 'Check-in history fetched.',
  data: await listAppointmentQrHistory(Number(req.params.id)),
}))

export const listQrActivityHandler: Handler = handle(async (req) => {
  const [activity, stats] = await Promise.all([
    listQrActivity(req.query as never),
    getQrActivityStats(),
  ])
  return { message: 'QR scan activity fetched.', data: { ...activity, stats } }
})

export const regenerateQrHandler: Handler = handle(async (req) => {
  const { appointmentId } = req.body as { appointmentId: number }
  const data = await adminRegenerateQr(appointmentId, req.admin!.id, scanMeta(req, 'ADMIN'))
  return { message: 'New QR code generated. The previous code no longer works.', data }
})

export const revokeQrHandler: Handler = handle(async (req) => {
  const { appointmentId } = req.body as { appointmentId: number }
  await revokeQrByAdmin(appointmentId, req.admin!.id, scanMeta(req, 'ADMIN'))
  return { message: 'QR code revoked.', data: { appointmentId } }
})
