const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/database');
const { AppError } = require('../utils/AppError');

// ─── POST /api/auth/login  (employee) ────────────────────────
const employeeLogin = async (req, res, next) => {
  try {
    const { identifier, password } = req.body; // identifier = employee_id, email, or phone
    if (!identifier || !password)
      throw new AppError('VALIDATION_ERROR', 'identifier and password are required.', 400);

    const result = await db.query(
      `SELECT * FROM employees
       WHERE (employee_id = $1 OR email = $1 OR phone = $1) AND is_active = TRUE`,
      [identifier]
    );
    if (!result.rows.length)
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    const emp = result.rows[0];
    const ok  = await bcrypt.compare(password, emp.password_hash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    const token = jwt.sign(
      { employee_id: emp.employee_id, name: emp.full_name, type: 'employee' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash, ...safe } = emp;
    return res.json({ success: true, token, employee: safe });
  } catch (err) { next(err); }
};

// ─── POST /api/auth/admin/login ───────────────────────────────
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      throw new AppError('VALIDATION_ERROR', 'email and password are required.', 400);

    const result = await db.query(
      'SELECT * FROM admins WHERE email = $1 AND is_active = TRUE', [email]
    );
    if (!result.rows.length)
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    const admin = result.rows[0];
    if (!await bcrypt.compare(password, admin.password_hash))
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    await db.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);

    const token = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, role: admin.role, type: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '8h' }
    );

    const { password_hash, ...safe } = admin;
    return res.json({ success: true, token, admin: safe });
  } catch (err) { next(err); }
};

// ─── POST /api/auth/register  (admin creates employee) ───────
const registerEmployee = async (req, res, next) => {
  try {
    const {
      employee_id, full_name, email, phone,
      department_id, designation, date_of_joining,
      base_salary, password,
    } = req.body;

    const required = [employee_id, full_name, email, phone, date_of_joining, password];
    if (required.some(v => !v))
      throw new AppError('VALIDATION_ERROR', 'Missing required fields.', 400);

    const hash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO employees
         (employee_id, full_name, email, phone, department_id, designation,
          date_of_joining, base_salary, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING employee_id, full_name, email, phone, department_id, designation,
                 date_of_joining, base_salary, is_active, created_at`,
      [employee_id, full_name, email, phone,
       department_id || null, designation || null, date_of_joining,
       base_salary || 0, hash]
    );

    return res.status(201).json({ success: true, employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return next(new AppError('DUPLICATE', 'Employee ID, email, or phone already exists.', 409));
    next(err);
  }
};

module.exports = { employeeLogin, adminLogin, registerEmployee };
