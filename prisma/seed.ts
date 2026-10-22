import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Family users for the MVP. Change emails/passwords (or add/remove people)
// as needed, then rerun: npx tsx prisma/seed.ts
const FAMILY_USERS = [
  { email: "1lukas1@gmail.com", name: "Lukas", password: "changeme123" },
];

async function main() {
  for (const u of FAMILY_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash },
    });
    console.log(`Seeded user ${u.email} (password: ${u.password} — change after first login)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
