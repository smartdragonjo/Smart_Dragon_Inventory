/**
 * =========================================================
 * Smart Dragon Inventory
 * Shared Validation Utilities
 * =========================================================
 *
 * This file provides shared validation helpers for:
 * - Vehicle makes
 * - Vehicle models
 * - Production years
 * - Category names
 * - Fitment values
 *
 * IMPORTANT:
 * Client-side validation is NOT a security boundary.
 *
 * Real protection will later also be enforced by:
 * - Firebase Authentication
 * - Firestore Security Rules
 * - Server-side / trusted validation where required
 */


/**
 * Remove unwanted control characters and normalize spacing.
 */
function normalizePlainText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .normalize("NFKC")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


/**
 * General safe text validation.
 *
 * Allows:
 * - Arabic
 * - English
 * - Numbers
 * - Spaces
 * - Hyphen
 * - Slash
 * - Parentheses
 * - Dot
 * - Plus
 * - Ampersand
 */
function isSafePlainText(value, maxLength = 100) {
    const normalized = normalizePlainText(value);

    if (!normalized) {
        return false;
    }

    if (normalized.length > maxLength) {
        return false;
    }

    const allowedPattern =
        /^[\p{L}\p{N}\s\-_/().+&]+$/u;

    return allowedPattern.test(normalized);
}


/**
 * Validate vehicle manufacturer name.
 */
function validateVehicleMake(value) {
    return isSafePlainText(value, 60);
}


/**
 * Validate vehicle model name.
 */
function validateVehicleModel(value) {
    return isSafePlainText(value, 80);
}


/**
 * Validate a production year.
 *
 * Current accepted range is intentionally broad enough
 * for old and future vehicle records.
 */
function validateVehicleYear(value) {
    const year = Number(value);

    if (!Number.isInteger(year)) {
        return false;
    }

    return year >= 1950 && year <= 2100;
}


/**
 * Validate a year range.
 */
function validateYearRange(yearStart, yearEnd) {
    if (
        !validateVehicleYear(yearStart) ||
        !validateVehicleYear(yearEnd)
    ) {
        return false;
    }

    return Number(yearStart) <= Number(yearEnd);
}


/**
 * Validate category names.
 *
 * Categories will later be created by the owner only.
 */
function validateCategoryName(value) {
    return isSafePlainText(value, 80);
}


/**
 * Validate short fitment values.
 *
 * Examples:
 * - H11
 * - H7
 * - H4
 * - D2S
 * - 9005
 * - 24"
 * - OEM
 * - LED
 */
function validateFitmentValue(value) {
    return isSafePlainText(value, 120);
}


/**
 * Validate a longer note.
 *
 * Notes intentionally support a wider character set,
 * but HTML markup is not accepted.
 */
function validateNote(value) {
    if (typeof value !== "string") {
        return false;
    }

    const normalized = normalizePlainText(value);

    if (normalized.length > 500) {
        return false;
    }

    if (
        normalized.includes("<") ||
        normalized.includes(">")
    ) {
        return false;
    }

    return true;
}


/**
 * =========================================================
 * Future Admin Input Object Validation
 * =========================================================
 */
function validateVehicleRecord(record) {
    if (!record || typeof record !== "object") {
        return {
            valid: false,
            errors: ["بيانات السيارة غير صالحة."]
        };
    }

    const errors = [];


    if (!validateVehicleMake(record.make)) {
        errors.push("اسم الشركة غير صالح.");
    }


    if (!validateVehicleModel(record.model)) {
        errors.push("اسم الموديل غير صالح.");
    }


    if (
        !validateYearRange(
            record.yearStart,
            record.yearEnd
        )
    ) {
        errors.push("نطاق السنوات غير صالح.");
    }


    return {
        valid: errors.length === 0,
        errors
    };
}


/**
 * Public API
 *
 * Other JavaScript files should use these helpers through
 * window.SmartDragonValidation instead of relying on
 * internal implementation details.
 */
window.SmartDragonValidation = Object.freeze({

    normalizePlainText,

    isSafePlainText,

    validateVehicleMake,

    validateVehicleModel,

    validateVehicleYear,

    validateYearRange,

    validateCategoryName,

    validateFitmentValue,

    validateNote,

    validateVehicleRecord
});