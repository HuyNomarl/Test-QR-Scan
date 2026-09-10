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
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start();
