const db = require('../config/database');
const { AppError } = require('../utils/AppError');

/* ─── POST /api/leave/apply ─────────────────────────────── */
const applyLeave = async (req, res, next) => {
  try {
    const { employee_id } = req.user;
    const { leave_type, from_date, to_date, reason } = req.body;

    if (!leave_type || !from_date || !to_date || !reason)
      throw new AppError('VALIDATION_ERROR', 'leave_type, from_date, to_date, reason required.', 400);

    const from = new Date(from_date);
    const to   = new Date(to_date);
    if (to < from) throw new AppError('VALIDATION_ERROR', 'to_date must be ≥ from_date.', 400);

    const days = Math.floor((to - from) / 86_400_000) + 1;

    // Check leave balance
    const balCol = { casual: 'casual_leave_balance', sick: 'sick_leave_balance', paid: 'paid_leave_balance' }[leave_type];
    if (balCol) {
      const emp = await db.query(`SELECT ${balCol} AS bal FROM employees WHERE employee_id = $1`, [employee_id]);
      if (emp.rows[0].bal < days)
        throw new AppError('INSUFFICIENT_BALANCE',
          `Insufficient ${leave_type} leave balance (${emp.rows[0].bal} days left, ${days} requested).`, 400);
    }

    // Overlap check
    const overlap = await db.query(
      `SELECT id FROM leave_requests
       WHERE employee_id = $1 AND status IN ('pending','approved')
         AND (from_date, to_date) OVERLAPS ($2::date, $3::date)`,
      [employee_id, from_date, to_date]
    );
    if (overlap.rows.length)
      throw new AppError('DATE_CONFLICT', 'A leave request already exists for those dates.', 409);

    const result = await db.query(
      `INSERT INTO leave_requests (employee_id, leave_type, from_date, to_date, days_requested, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, leave_type, from_date, to_date, days, reason]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

/* ─── GET /api/leave/my ─────────────────────────────────── */
const getMyLeaves = async (req, res, next) => {
  try {
    const { employee_id } = req.user;
    const { status, year } = req.query;
    const y = year || new Date().getFullYear();

    let q = `SELECT lr.*, a.name AS reviewed_by_name
             FROM leave_requests lr
             LEFT JOIN admins a ON a.id = lr.reviewed_by
             WHERE lr.employee_id = $1 AND EXTRACT(YEAR FROM lr.from_date) = $2`;
    const params = [employee_id, y];
    if (status) { q += ` AND lr.status = $3`; params.push(status); }
    q += ' ORDER BY lr.submitted_at DESC';

    const rows = await db.query(q, params);
    const emp  = await db.query(
      `SELECT casual_leave_balance, sick_leave_balance, paid_leave_balance
       FROM employees WHERE employee_id = $1`, [employee_id]
    );

    return res.json({ success: true, data: rows.rows, balance: emp.rows[0] });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/admin/leave/:id/review  (admin) ────────── */
const reviewLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;
    const adminId = req.admin.id;

    if (!['approve','reject'].includes(action))
      throw new AppError('VALIDATION_ERROR', 'action must be approve or reject.', 400);
    if (action === 'reject' && !comment)
      throw new AppError('VALIDATION_ERROR', 'Comment required for rejection.', 400);

    const existing = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('NOT_FOUND', 'Leave request not found.', 404);
    if (existing.rows[0].status !== 'pending')
      throw new AppError('CONFLICT', 'This request has already been reviewed.', 409);

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updated   = await db.query(
      `UPDATE leave_requests
       SET status = $1, admin_comment = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [newStatus, comment || null, adminId, id]
    );

    // Deduct leave balance on approval
    if (action === 'approve') {
      const req_row = existing.rows[0];
      const colMap  = { casual: 'casual_leave_balance', sick: 'sick_leave_balance', paid: 'paid_leave_balance' };
      const col     = colMap[req_row.leave_type];
      if (col) {
        await db.query(
          `UPDATE employees SET ${col} = ${col} - $1 WHERE employee_id = $2`,
          [req_row.days_requested, req_row.employee_id]
        );
        // Mark attendance as leave
        await db.query(
          `INSERT INTO attendance (employee_id, date, status)
           SELECT $1, d::date, 'leave'
           FROM generate_series($2::date, $3::date, '1 day'::interval) d
           ON CONFLICT (employee_id, date) DO NOTHING`,
          [req_row.employee_id, req_row.from_date, req_row.to_date]
        );
      }
    }

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) { next(err); }
};

module.exports = { applyLeave, getMyLeaves, reviewLeave };
