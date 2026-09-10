const db = require('../config/database');
const bcrypt = require('bcrypt');
const { AppError } = require('../utils/AppError');

/* ─── GET /api/admin/dashboard ──────────────────────────── */
const getDashboard = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [total, todayRecs, pending, deptStats, trendRaw] = await Promise.all([
      db.query('SELECT COUNT(*) FROM employees WHERE is_active = TRUE'),
      db.query(
        `SELECT
           e.employee_id, e.full_name, d.name AS department,
           a.check_in_time, a.check_out_time, a.status, a.is_late, a.method, a.working_minutes
         FROM employees e
         LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date = $1
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.is_active = TRUE
         ORDER BY a.check_in_time ASC NULLS LAST`, [today]
      ),
      db.query("SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'"),
      db.query(
        `SELECT d.name, COUNT(e.employee_id) AS total,
           SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = TRUE
         LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date = $1
         GROUP BY d.name ORDER BY d.name`, [today]
      ),
      db.query(
        `SELECT date, COUNT(*) FILTER (WHERE status='present') AS present,
                COUNT(*) FILTER (WHERE status='absent')  AS absent,
                COUNT(*) FILTER (WHERE status='leave')   AS on_leave
         FROM attendance
         WHERE date >= NOW() - INTERVAL '30 days'
         GROUP BY date ORDER BY date`
      ),
    ]);

    const records       = todayRecs.rows;
    const totalCount    = parseInt(total.rows[0].count);
    const present       = records.filter(r => r.check_in_time && r.status !== 'leave').length;
    const onLeave       = records.filter(r => r.status === 'leave').length;
    const absent        = totalCount - present - onLeave;
    const late          = records.filter(r => r.is_late).length;

    return res.json({
      success: true,
      data: {
        summary: { total: totalCount, present, absent, on_leave: onLeave, late, pending_leaves: parseInt(pending.rows[0].count) },
        today_records: records,
        department_stats: deptStats.rows,
        attendance_trend: trendRaw.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/admin/reports ─────────────────────────────── */
const getReports = async (req, res, next) => {
  try {
    const { from, to, department, employee_id } = req.query;
    if (!from || !to) throw new AppError('VALIDATION_ERROR', 'from and to required.', 400);

    const params = [from, to];
    let deptJoin = '';
    let filters  = '';
    if (department) { params.push(department); filters += ` AND d.name = $${params.length}`; }
    if (employee_id){ params.push(employee_id);filters += ` AND e.employee_id = $${params.length}`; }

    const rows = await db.query(
      `SELECT e.employee_id, e.full_name, d.name AS department,
              a.date, a.check_in_time, a.check_out_time,
              a.working_minutes, a.status, a.is_late, a.method
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date BETWEEN $1 AND $2
       WHERE e.is_active = TRUE ${filters}
       ORDER BY e.employee_id, a.date`,
      params
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── POST /api/admin/employee/add ──────────────────────── */
const addEmployee = async (req, res, next) => {
  try {
    const {
      employee_id, full_name, email, phone,
      department_id, designation, date_of_joining, base_salary, password,
    } = req.body;

    const required = [employee_id, full_name, email, phone, date_of_joining, password];
    if (required.some(v => !v))
      throw new AppError('VALIDATION_ERROR', 'Missing required fields.', 400);

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO employees (employee_id, full_name, email, phone, department_id, designation, date_of_joining, base_salary, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING employee_id, full_name, email, phone, department_id, designation, date_of_joining, base_salary, is_active`,
      [employee_id, full_name, email, phone, department_id || null, designation || null, date_of_joining, base_salary || 0, hash]
    );
    return res.status(201).json({ success: true, employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return next(new AppError('DUPLICATE', 'Employee ID, email, or phone already exists.', 409));
    next(err);
  }
};

/* ─── GET /api/admin/employees ───────────────────────────── */
const getEmployees = async (req, res, next) => {
  try {
    const { search, department, active = 'true', page = 1, limit = 50 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (active !== 'all') { params.push(active === 'true'); where += ` AND e.is_active = $${params.length}`; }
    if (department) { params.push(department); where += ` AND d.name = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.full_name ILIKE $${params.length} OR e.employee_id ILIKE $${params.length} OR e.email ILIKE $${params.length})`;
    }
    const offset = (parseInt(page)-1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const rows = await db.query(
      `SELECT e.employee_id, e.full_name, e.email, e.phone, d.name AS department,
              e.designation, e.date_of_joining, e.base_salary, e.is_active,
              e.casual_leave_balance, e.sick_leave_balance, e.paid_leave_balance
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id
       ${where}
       ORDER BY e.full_name LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/admin/employee/:id/deactivate ───────────── */
const deactivateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE employees SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [id]);
    return res.json({ success: true, message: 'Employee deactivated.' });
  } catch (err) { next(err); }
};

/* ─── GET /api/admin/leave ───────────────────────────────── */
const getAllLeaves = async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const rows = await db.query(
      `SELECT lr.*, e.full_name, d.name AS department
       FROM leave_requests lr
       JOIN employees e ON e.employee_id = lr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE lr.status = $1
       ORDER BY lr.submitted_at ASC`, [status]
    );
    return res.json({ success: true, data: rows.rows, total: rows.rows.length });
  } catch (err) { next(err); }
};

module.exports = { getDashboard, getReports, addEmployee, getEmployees, deactivateEmployee, getAllLeaves };
