require("dotenv").config();
const app = require("./app");
const db = require("./config/database");
const seedAdmin = require("./utils/seedAdmin");

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await db.query("SELECT NOW()");
    console.log("✅ Database connected");

    // AUTO CREATE ADMIN
    await seedAdmin();
  } catch (err) {
    console.error("❌ Database connection failed");
    console.error("name:", err.name);
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("stack:", err.stack);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
  console.log(
    "DATABASE_HOST:",
    process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).hostname
      : "MISSING",
  );
  console.log(
    "DATABASE_PORT:",
    process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).port
      : "MISSING",
  );
}

start();
