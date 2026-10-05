"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnabledPaymentMethods = parseEnabledPaymentMethods;
exports.serializePaymentSetting = serializePaymentSetting;
exports.getPaymentSettingsRecord = getPaymentSettingsRecord;
exports.getPublicPaymentSettings = getPublicPaymentSettings;
exports.updatePaymentSettings = updatePaymentSettings;
const models_1 = require("../models");
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
        // Online payments exist only when the gateway secret key is configured server-side.
        onlinePaymentEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
    };
}
async function getPaymentSettingsRecord() {
    const [settings] = await models_1.PaymentSetting.findOrCreate({
        where: { id: 1 },
        defaults: { id: 1, ...DEFAULT_SETTINGS },
    });
    return settings;
}
async function getPublicPaymentSettings() {
    const settings = await getPaymentSettingsRecord();
    return serializePaymentSetting(settings);
}
async function updatePaymentSettings(input) {
    const settings = await getPaymentSettingsRecord();
    await settings.update(input);
    return serializePaymentSetting(settings);
}
//# sourceMappingURL=paymentSettingsService.js.map