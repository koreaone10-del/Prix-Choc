import { config } from "./config.js";

export function roundPrice(price) {
    return Math.round(price);
}

export function calculateMargin(basePrice) {
    const price = Number(basePrice);

    if (!Number.isFinite(price) || price <= 0) {
        return 0;
    }

    let margin =
        config.pricing.defaultMargin;

    if (
        margin <
        config.pricing.minMargin
    ) {
        margin =
            config.pricing.minMargin;
    }

    if (
        margin >
        config.pricing.maxMargin
    ) {
        margin =
            config.pricing.maxMargin;
    }

    return roundPrice(margin);
}

export function calculateSellingPrice(basePrice) {
    const price = Number(basePrice);

    if (!Number.isFinite(price) || price <= 0) {
        return 0;
    }

    const margin =
        calculateMargin(price);

    return roundPrice(
        price + margin
    );
}

export function calculateProfit(
    basePrice,
    sellingPrice
) {
    const base = Number(basePrice);
    const selling = Number(sellingPrice);

    if (
        !Number.isFinite(base) ||
        !Number.isFinite(selling)
    ) {
        return 0;
    }

    return roundPrice(
        selling - base
    );
}
