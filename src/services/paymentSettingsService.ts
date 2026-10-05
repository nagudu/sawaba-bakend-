import { prisma } from '../config/database'
import type { PaymentSetting } from '@prisma/client'
import type { UpdatePaymentSettingsInput } from '../validators/paymentSettings'
import type { PaymentMethod } from '../types'

const DEFAULT_SETTINGS = {
  shopName: 'SAWABA Grooming Studio',
  shopAddress: 'Unguwa Uku, Sabuwar Abuja, Kano, Nigeria',
  shopPhone: '+234 706 928 8456',
  shopLogo: null,
  bankName: 'GTBank',
  accountName: 'SAWABA Grooming Studio',
  accountNumber: '0123456789',
  opayAccountName: 'SAWABA Grooming Studio',
  opayAccountNumber: '8023456789',
  paymentInstructions:
    'Transfer the exact service amount and upload your payment receipt. Kindly use your appointment ID as the transfer reference where possible.',
  enabledPaymentMethods: ['OPAY', 'BANK_TRANSFER', 'CASH'] as PaymentMethod[],
  minAmount: 0,
  fullPaymentRequired: true,
  receiptRequired: true,
}

export interface PaymentSettingsPublic {
  shopName: string
  shopAddress: string | null
  shopPhone: string | null
  shopLogo: string | null
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  opayAccountName: string | null
  opayAccountNumber: string | null
  paymentInstructions: string | null
  enabledPaymentMethods: string[]
  minAmount: number
  fullPaymentRequired: boolean
  receiptRequired: boolean
  onlinePaymentEnabled: boolean
}

export function parseEnabledPaymentMethods(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function serializePaymentSetting(setting: PaymentSetting): PaymentSettingsPublic {
  return {
    shopName: setting.shopName,
    shopAddress: setting.shopAddress,
    shopPhone: setting.shopPhone,
    shopLogo: setting.shopLogo,
    bankName: setting.bankName,
    accountName: setting.accountName,
    accountNumber: setting.accountNumber,
    opayAccountName: setting.opayAccountName,
    opayAccountNumber: setting.opayAccountNumber,
    paymentInstructions: setting.paymentInstructions,
    enabledPaymentMethods: parseEnabledPaymentMethods(setting.enabledPaymentMethods),
    minAmount: Number(setting.minAmount),
    fullPaymentRequired: setting.fullPaymentRequired,
    receiptRequired: setting.receiptRequired,
    onlinePaymentEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
  }
}

export async function getPaymentSettingsRecord(): Promise<PaymentSetting> {
  const existing = await prisma.paymentSetting.findUnique({ where: { id: 1 } })
  if (existing) return existing

  return prisma.paymentSetting.create({
    data: {
      id: 1,
      ...DEFAULT_SETTINGS,
    },
  })
}

export async function getPublicPaymentSettings(): Promise<PaymentSettingsPublic> {
  const settings = await getPaymentSettingsRecord()
  return serializePaymentSetting(settings)
}

export async function updatePaymentSettings(
  input: UpdatePaymentSettingsInput,
): Promise<PaymentSettingsPublic> {
  await getPaymentSettingsRecord() // ensures record exists
  const updated = await prisma.paymentSetting.update({
    where: { id: 1 },
    data: {
      ...(input.shopName !== undefined ? { shopName: input.shopName } : {}),
      ...(input.shopAddress !== undefined ? { shopAddress: input.shopAddress } : {}),
      ...(input.shopPhone !== undefined ? { shopPhone: input.shopPhone } : {}),
      ...(input.shopLogo !== undefined ? { shopLogo: input.shopLogo } : {}),
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
      ...(input.opayAccountName !== undefined ? { opayAccountName: input.opayAccountName } : {}),
      ...(input.opayAccountNumber !== undefined ? { opayAccountNumber: input.opayAccountNumber } : {}),
      ...(input.paymentInstructions !== undefined ? { paymentInstructions: input.paymentInstructions } : {}),
      ...(input.enabledPaymentMethods !== undefined ? { enabledPaymentMethods: input.enabledPaymentMethods } : {}),
      ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
      ...(input.fullPaymentRequired !== undefined ? { fullPaymentRequired: input.fullPaymentRequired } : {}),
      ...(input.receiptRequired !== undefined ? { receiptRequired: input.receiptRequired } : {}),
    },
  })
  return serializePaymentSetting(updated)
}