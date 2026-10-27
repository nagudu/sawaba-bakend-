"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnabledPaymentMethods = parseEnabledPaymentMethods;
exports.serializePaymentSetting = serializePaymentSetting;
exports.getPaymentSettingsRecord = getPaymentSettingsRecord;
exports.getPublicPaymentSettings = getPublicPaymentSettings;
exports.updatePaymentSettings = updatePaymentSettings;
const database_1 = require("../config/database");
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
    paymentInstructions: 'Transfer the exact service amount and upload your payment receipt. Kindly use your appointment ID as the transfer reference where possible.',
    enabledPaymentMethods: ['OPAY', 'BANK_TRANSFER', 'CASH'],
    minAmount: 0,
    fullPaymentRequired: true,
    receiptRequired: true,
};
function parseEnabledPaymentMethods(value) {
    if (Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function serializePaymentSetting(setting) {
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
    };
}
async function getPaymentSettingsRecord() {
    const existing = await database_1.prisma.paymentSetting.findUnique({ where: { id: 1 } });
    if (existing)
        return existing;
    return database_1.prisma.paymentSetting.create({
        data: {
            id: 1,
            ...DEFAULT_SETTINGS,
        },
    });
}
async function getPublicPaymentSettings() {
    const settings = await getPaymentSettingsRecord();
    return serializePaymentSetting(settings);
}
async function updatePaymentSettings(input) {
    await getPaymentSettingsRecord(); // ensures record exists
    const updated = await database_1.prisma.paymentSetting.update({
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
    });
    return serializePaymentSetting(updated);
}
//# sourceMappingURL=paymentSettingsService.js.map