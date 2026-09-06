import { spawn } from "child_process";
import { config } from "./config.js";

function run(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n▶ ${command} ${args.join(" ")}`);

        const child = spawn(command, args, {
            stdio: "inherit",
            shell: false
        });

        child.on("error", reject);

        child.on("close", code => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `${command} exited with code ${code}`
                    )
                );
            }
        });
    });
}

console.log("======================================");
console.log(" PRIX CHOC FULL AUTO SYNC");
console.log("======================================");
console.log(`DRY_RUN = ${config.automation.dryRun}`);
console.log(`LIMIT   = ${config.automation.scrapeLimit}`);
console.log(
    `WORKERS = ${config.automation.scrapeConcurrency}`
);

await run(
    process.platform === "win32"
        ? "node.exe"
        : "node",
    ["scraper.js"]
);

if (!config.automation.dryRun) {
    await run(
        process.platform === "win32"
            ? "node.exe"
            : "node",
        ["generator.js"]
    );
} else {
    console.log(
        "\n🛑 DRY_RUN=true: products.js لم يتم تعديله."
    );
}
