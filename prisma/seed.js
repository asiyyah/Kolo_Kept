const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const DEMO_EMAIL = "demo@kolo-kept.test";
const DEMO_PASSWORD = "TestUser123!";
const DEMO_NAME = "Demo User";
const BCRYPT_SALT_ROUNDS = 14;

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_SALT_ROUNDS);

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { email: DEMO_EMAIL },
      data: {
        name: DEMO_NAME,
        passwordHash,
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
    console.log(`Updated existing demo user: ${DEMO_EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        name: DEMO_NAME,
        email: DEMO_EMAIL,
        passwordHash,
      },
    });
    console.log(`Created demo user: ${DEMO_EMAIL}`);
  }

  console.log("\nUse these credentials to log in:");
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Failed to seed demo user:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
