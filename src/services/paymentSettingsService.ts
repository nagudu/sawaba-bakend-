import { prisma } from '../config/database'
import type { PaymentSetting } from '@prisma/client'
import type { UpdatePaymentSettingsInput } from '../validators/paymentSettings'
import type { PaymentMethod } from '../types'
import { UnprocessableError } from '../utils/errors'

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
  enabledPaymentMethods: ['ONLINE', 'OPAY', 'BANK_TRANSFER', 'CASH'] as PaymentMethod[],
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

/** Methods the marketplace can offer. ONLINE = Paystack. */
export const SHOP_PAYMENT_METHODS = ['ONLINE', 'OPAY', 'BANK_TRANSFER', 'CASH'] as const
export type ShopPaymentMethod = (typeof SHOP_PAYMENT_METHODS)[number]

export interface ShopPaymentOption {
  method: ShopPaymentMethod
  label: string
  enabled: boolean
  available: boolean
  /** Why an enabled method cannot be used yet (missing details/credentials). */
  reason: string | null
}

export interface ShopPaymentOptions {
  methods: ShopPaymentOption[]
  instructions: string | null
  shopName: string
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  opayAccountName: string | null
  opayAccountNumber: string | null
  paystackEnabled: boolean
}

const METHOD_LABELS: Record<ShopPaymentMethod, string> = {
  ONLINE: 'Card, bank or USSD (Paystack)',
  OPAY: 'OPay transfer',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Pay on delivery',
}

export function isPaystackEnabled(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY?.trim())
}

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim()
}

/**
 * A method is offerable only when the admin enabled it AND every detail the
 * customer would need actually exists. This is what stops checkout advertising
 * an account number that was never configured.
 */
export function resolveShopPaymentMethods(setting: PaymentSetting): ShopPaymentOption[] {
  const enabled = parseEnabledPaymentMethods(setting.enabledPaymentMethods)
  return SHOP_PAYMENT_METHODS.map((method) => {
    const isEnabled = enabled.includes(method)
    let reason: string | null = null
    if (!isEnabled) {
      reason = 'The studio is not accepting this payment method right now.'
    } else if (method === 'ONLINE' && !isPaystackEnabled()) {
      reason = 'Card payments are not configured yet.'
    } else if (method === 'OPAY' && (isBlank(setting.opayAccountName) || isBlank(setting.opayAccountNumber))) {
      reason = 'OPay details are not configured yet.'
    } else if (
      method === 'BANK_TRANSFER' &&
      (isBlank(setting.bankName) || isBlank(setting.accountName) || isBlank(setting.accountNumber))
    ) {
      reason = 'Bank account details are not configured yet.'
    }
    return {
      method,
      label: METHOD_LABELS[method],
      enabled: isEnabled,
      available: isEnabled && reason === null,
      reason,
    }
  })
}

export async function getShopPaymentOptions(): Promise<ShopPaymentOptions> {
  const setting = await getPaymentSettingsRecord()
  return {
    methods: resolveShopPaymentMethods(setting),
    instructions: setting.paymentInstructions,
    shopName: setting.shopName,
    bankName: setting.bankName,
    accountName: setting.accountName,
    accountNumber: setting.accountNumber,
    opayAccountName: setting.opayAccountName,
    opayAccountNumber: setting.opayAccountNumber,
    paystackEnabled: isPaystackEnabled(),
  }
}

/** Server-side gate: checkout can never use a method the studio disabled. */
export async function assertShopPaymentMethodAllowed(method: string): Promise<void> {
  const setting = await getPaymentSettingsRecord()
  const option = resolveShopPaymentMethods(setting).find((candidate) => candidate.method === method)
  if (!option || !option.available) {
    throw new UnprocessableError(
      option?.reason ?? 'That payment method is unavailable. Please choose another one.',
    )
  }
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