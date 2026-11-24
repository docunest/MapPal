// Issue, list and revoke reading-API devices. The token is printed ONCE; only its SHA-256 is stored.
//   npm run reading:device -- add tablet
//   npm run reading:device -- list
//   npm run reading:device -- revoke tablet
import { newToken, tokenHash, validDeviceName } from "../domains/reading/domain/device";
import { createDevice, listDevices, revokeDevice } from "../domains/reading/infrastructure/repo";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "add") {
    const name = validDeviceName(rest.join(" "));
    if (!name) throw new Error("name: 1 to 40 letters, digits, spaces, . _ -");
    const token = newToken();
    await createDevice(name, tokenHash(token));
    console.log(`Device "${name}" added. Its token (shown once, copy it now):\n\n${token}\n`);
  } else if (cmd === "list") {
    console.table(await listDevices());
  } else if (cmd === "revoke") {
    const name = validDeviceName(rest.join(" "));
    if (!name) throw new Error("name is required");
    console.log(`Revoked ${await revokeDevice(name)} device(s) named "${name}".`);
  } else {
    console.log("Usage: reading:device -- add <name> | list | revoke <name>");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
