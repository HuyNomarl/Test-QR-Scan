const db = require('../config/database');
const { AppError } = require('../utils/AppError');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[\s().-]/g, '');
}

// POST /api/loyalty/earn
// A QR code opens the public form; each submitted scan earns one point.
const earnPoint = async (req, res, next) => {
  let client;
  try {
    const phone = normalizePhone(req.body.phone);
    const fullName = String(req.body.full_name || '').trim();
    const country = String(req.body.country || '').trim();

    if (!phone || phone.length < 6)
      throw new AppError('VALIDATION_ERROR', 'Vui lòng nhập số điện thoại hợp lệ.', 400);
    if (!fullName)
      throw new AppError('VALIDATION_ERROR', 'Vui lòng nhập họ và tên.', 400);
    if (!country)
      throw new AppError('VALIDATION_ERROR', 'Vui lòng chọn quốc gia.', 400);

    // The unique phone constraint and this UPSERT make concurrent scans safe.
    client = await db.pool.connect();
    await client.query('BEGIN');
    const customer = await client.query(
      `INSERT INTO customers (phone, full_name, country, points, last_earned_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (phone) DO UPDATE
       SET points = customers.points + 1,
           full_name = EXCLUDED.full_name,
           country = EXCLUDED.country,
           last_earned_at = NOW(),
           updated_at = NOW()
       RETURNING id, phone, full_name, country, points, created_at, last_earned_at,
                 (xmax = 0) AS is_new_customer`,
      [phone, fullName, country]
    );

    const record = customer.rows[0];
    await client.query(
      `INSERT INTO loyalty_point_events (customer_id, points, event_type, source_ip)
       VALUES ($1, 1, 'qr_scan', $2)`,
      [record.id, req.ip || req.headers['x-forwarded-for'] || null]
    );
    await client.query('COMMIT');

    return res.status(record.is_new_customer ? 201 : 200).json({
      success: true,
      message: record.is_new_customer
        ? 'Chào mừng bạn! Bạn đã nhận được 1 điểm đầu tiên.'
        : 'Bạn đã nhận thêm 1 điểm.',
      data: {
        customer: {
          phone: record.phone,
          full_name: record.full_name,
          country: record.country,
          points: record.points,
        },
        is_new_customer: record.is_new_customer,
        points_earned: 1,
      },
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client?.release(); }
};

const getCustomers = async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;
    const term = `%${search.trim()}%`;

    const [customers, total] = await Promise.all([
      db.query(
        `SELECT c.id, c.phone, c.full_name, c.country, c.points, c.created_at, c.last_earned_at,
                COUNT(e.id)::INTEGER AS scan_count
         FROM customers c
         LEFT JOIN loyalty_point_events e ON e.customer_id = c.id
         WHERE c.full_name ILIKE $1 OR c.phone ILIKE $1 OR c.country ILIKE $1
         GROUP BY c.id
         ORDER BY c.last_earned_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [term, safeLimit, offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM customers
         WHERE full_name ILIKE $1 OR phone ILIKE $1 OR country ILIKE $1`, [term]
      ),
    ]);

    return res.json({
      success: true,
      data: customers.rows,
      pagination: { page: safePage, limit: safeLimit, total: Number(total.rows[0].count) },
    });
  } catch (err) { next(err); }
};

module.exports = { earnPoint, getCustomers };
