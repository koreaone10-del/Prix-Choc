import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
    sawa9ly: {
        loginUrl:
            process.env.SAWA9LY_LOGIN_URL ||
            "https://affiliate.sawa9ly.pro/",
        dashboardUrl:
            process.env.SAWA9LY_DASHBOARD_URL ||
            "https://affiliate.sawa9ly.pro/store",
        email: process.env.SAWA9LY_EMAIL || "",
        password: process.env.SAWA9LY_PASSWORD || ""
    },

    automation: {
        scrapeLimit: Number(process.env.SCRAPE_LIMIT || 2094),
        scrapeConcurrency: Math.max(
            1,
            Number(process.env.SCRAPE_CONCURRENCY || 8)
        ),
        headless:
            String(process.env.HEADLESS || "true").toLowerCase() === "true",
        dryRun:
            String(process.env.DRY_RUN || "false").toLowerCase() === "true",
        missingConfirmationRuns: Math.max(
            1,
            Number(process.env.MISSING_CONFIRMATION_RUNS || 2)
        )
    },

    pricing: {
        defaultMargin: Number(process.env.DEFAULT_MARGIN || 1000),
        minMargin: Number(process.env.MIN_MARGIN || 300),
        maxMargin: Number(process.env.MAX_MARGIN || 5000)
    },

    paths: {
        productsFile: path.resolve(
            __dirname,
            process.env.PRODUCTS_FILE || "../products.js"
        ),
        outputDir: path.resolve(
            __dirname,
            process.env.OUTPUT_DIR || "./output"
        )
    }
};

export function validateConfig() {
    const errors = [];

    if (!config.sawa9ly.email) errors.push("SAWA9LY_EMAIL is missing");
    if (!config.sawa9ly.password) errors.push("SAWA9LY_PASSWORD is missing");

    if (errors.length) {
        console.error("\n❌ Configuration errors:\n");
        for (const error of errors) console.error(`- ${error}`);
        console.error(
            "\nضع SAWA9LY_EMAIL و SAWA9LY_PASSWORD في GitHub Secrets."
        );
        process.exit(1);
    }
}
