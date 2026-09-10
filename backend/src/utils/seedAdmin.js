const bcrypt = require("bcryptjs");
const db = require("../config/database");

async function seedAdmin() {
  try {
    const result = await db.query(
      "SELECT * FROM admins WHERE email=$1",
      ["admin@company.com"]
    );

    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash("Admin@1234", 12);

      await db.query(
        `INSERT INTO admins (name,email,password_hash,role)
         VALUES ($1,$2,$3,$4)`,
        ["System Admin", "admin@company.com", hashedPassword, "super_admin"]
      );

      console.log("✅ Default admin created");
      console.log("Email: admin@company.com");
      console.log("Password: Admin@1234");
    } else {
      console.log("ℹ️ Admin already exists");
    }
  } catch (error) {
    console.error("Admin seed error:", error.message);
  }
}

module.exports = seedAdmin;
