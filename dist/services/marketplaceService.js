"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLineCommission = calculateLineCommission;
exports.getMarketplaceSettings = getMarketplaceSettings;
exports.resolveCommissionRule = resolveCommissionRule;
exports.computeLineCommission = computeLineCommission;
exports.naira = naira;
exports.assertMarketplaceOpen = assertMarketplaceOpen;
exports.requireVendorRegistrationOpen = requireVendorRegistrationOpen;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const round2 = (value) => Math.round(value * 100) / 100;
function calculateLineCommission(rule, lineTotal) {
    const amount = Math.max(0, lineTotal);
    let commission = 0;
    if (rule.type === 'PERCENTAGE') {
        const pct = Math.min(Math.max(rule.rate, 0), 100);
        commission = round2((amount * pct) / 100);
    }
    else {
        // Fixed ₦ fee per order line — clamped so it can never exceed the line.
        commission = Math.min(Math.max(rule.rate, 0), amount);
    }
    return { commissionAmount: commission, vendorNet: round2(amount - commission) };
}
/** The marketplace settings singleton (id = 1), created with defaults on first use. */
async function getMarketplaceSettings(tx = database_1.prisma) {
    return tx.marketplaceSetting.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
    });
}
/**
 * Resolves the single applicable commission rule for one order line.
 * Priority: vendor override → category override → marketplace default.
 */
async function resolveCommissionRule(input, tx = database_1.prisma) {
    if (input.vendorCommissionRate !== null && input.vendorCommissionRate !== undefined) {
        return { type: 'PERCENTAGE', rate: Number(input.vendorCommissionRate) };
    }
    if (input.categoryCommissionRate !== null && input.categoryCommissionRate !== undefined) {
        return { type: 'PERCENTAGE', rate: Number(input.categoryCommissionRate) };
    }
    const settings = await getMarketplaceSettings(tx);
    return { type: settings.commissionType, rate: Number(settings.defaultCommissionRate) };
}
/** Full breakdown for one line — resolves the rule and applies it. */
async function computeLineCommission(input, tx = database_1.prisma) {
    const rule = await resolveCommissionRule(input, tx);
    const { commissionAmount, vendorNet } = calculateLineCommission(rule, input.lineTotal);
    return {
        commissionType: rule.type,
        commissionRate: rule.rate,
        commissionAmount,
        vendorNet,
    };
}
/** Human-readable money for notifications (₦10,000.00 style). */
function naira(amount) {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function assertMarketplaceOpen() {
    // Placeholder hook for maintenance windows; settings row gates registration.
}
async function requireVendorRegistrationOpen() {
    const settings = await getMarketplaceSettings();
    if (!settings.vendorRegistrationOpen) {
        throw new errors_1.UnprocessableError('Vendor registration is currently closed. Please check back later.');
    }
}
//# sourceMappingURL=marketplaceService.js.map