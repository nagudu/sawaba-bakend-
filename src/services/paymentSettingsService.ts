import { PaymentSetting } from '../models'
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
    // Online payments exist only when the gateway secret key is configured server-side.
    onlinePaymentEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
  }
}

export async function getPaymentSettingsRecord(): Promise<PaymentSetting> {
  const [settings] = await PaymentSetting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, ...DEFAULT_SETTINGS },
  })
  return settings
}

export async function getPublicPaymentSettings(): Promise<PaymentSettingsPublic> {
  const settings = await getPaymentSettingsRecord()
  return serializePaymentSetting(settings)
}

export async function updatePaymentSettings(
  input: UpdatePaymentSettingsInput,
): Promise<PaymentSettingsPublic> {
  const settings = await getPaymentSettingsRecord()
  await settings.update(input)
  return serializePaymentSetting(settings)
}