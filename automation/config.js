import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
    sawa9ly: {
        loginUrl:
            process.env.SAWA9LY_LOGIN_URL ||
            "https://sawa9ly.app/login",

        dashboardUrl:
            process.env.SAWA9LY_DASHBOARD_URL ||
            "https://sawa9ly.app/dashboard",

        email: process.env.SAWA9LY_EMAIL || "",
        password: process.env.SAWA9LY_PASSWORD || ""
    },

    automation: {
        scrapeLimit: Number(process.env.SCRAPE_LIMIT || 20),

        headless:
            String(process.env.HEADLESS || "false").toLowerCase() === "true",

        dryRun:
            String(process.env.DRY_RUN || "true").toLowerCase() === "true"
    },

    pricing: {
        defaultMargin: Number(
            process.env.DEFAULT_MARGIN || 1000
        ),

        minMargin: Number(
            process.env.MIN_MARGIN || 300
        ),

        maxMargin: Number(
            process.env.MAX_MARGIN || 5000
        )
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

    if (!config.sawa9ly.email) {
        errors.push("SAWA9LY_EMAIL is missing");
    }

    if (!config.sawa9ly.password) {
        errors.push("SAWA9LY_PASSWORD is missing");
    }

    if (errors.length > 0) {
        console.error("\n❌ Configuration errors:\n");

        for (const error of errors) {
            console.error(`- ${error}`);
        }

        console.error(
            "\nأنشئ ملف automation/.env وضع بيانات حساب سوقلي داخله."
        );

        process.exit(1);
    }
              }
