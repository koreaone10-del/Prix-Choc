import { spawn } from "child_process";

import {
    config
} from "./config.js";

function runCommand(
    command,
    args
) {
    return new Promise(
        (resolve, reject) => {
            console.log(
                `\n▶ Running: ${command} ${args.join(" ")}`
            );

            const child =
                spawn(
                    command,
                    args,
                    {
                        stdio: "inherit",
                        shell: false
                    }
                );

            child.on(
                "error",
                reject
            );

            child.on(
                "close",
                code => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(
                            new Error(
                                `${command} exited with code ${code}`
                            )
                        );
                    }
                }
            );
        }
    );
}

console.log("\n======================================");
console.log("       PRIX CHOC AUTO SYNC");
console.log("======================================\n");

console.log(
    `🧪 DRY_RUN = ${config.automation.dryRun}`
);

console.log(
    `📦 LIMIT = ${config.automation.scrapeLimit}`
);

await runCommand(
    process.platform === "win32"
        ? "node.exe"
        : "node",
    ["scraper.js"]
);

if (
    config.automation.dryRun
) {
    console.log(
        "\n🛑 DRY_RUN=true"
    );

    console.log(
        "لم يتم تعديل products.js."
    );

    console.log(
        "راجع output/products.raw.json أولاً."
    );
} else {
    await runCommand(
        process.platform === "win32"
            ? "node.exe"
            : "node",
        ["generator.js"]
    );
}

console.log("\n======================================");
console.log("          SYNC FINISHED");
console.log("======================================\n");
