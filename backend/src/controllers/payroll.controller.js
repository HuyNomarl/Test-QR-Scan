const db      = require('../config/database');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Parser }  = require('json2csv');
const { AppError } = require('../utils/AppError');

/* ─── POST /api/payroll/generate ────────────────────────── */
const generatePayroll = async (req, res, next) => {
  try {
    const { month, year, employee_id } = req.body;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    // Calculate working days in month (excluding weekends + public holidays)
    const holidays = await db.query(
      `SELECT date FROM public_holidays
       WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
      [month, year]
    );
    const holidaySet = new Set(holidays.rows.map(h => h.date.toISOString().split('T')[0]));

    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays   = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt  = new Date(year, month - 1, d);
      const iso = dt.toISOString().split('T')[0];
      const dow = dt.getDay();
      if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) workingDays++;
    }

    // Fetch employees
    const empFilter = employee_id ? 'AND e.employee_id = $3' : '';
    const params    = employee_id ? [month, year, employee_id] : [month, year];
    const emps      = await db.query(
      `SELECT e.employee_id, e.full_name, e.base_salary
       FROM employees e WHERE e.is_active = TRUE ${empFilter}`,
      params
    );

    const results = [];
    const LATE_DEDUCTION_RATE = 0.5; // % of daily salary per late day

    for (const emp of emps.rows) {
      // Attendance summary for month
      const att = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present_days,
           COUNT(*) FILTER (WHERE status = 'absent')  AS absent_days,
           COUNT(*) FILTER (WHERE status = 'leave')   AS leave_days,
           COUNT(*) FILTER (WHERE is_late = TRUE)     AS late_days,
           COALESCE(SUM(overtime_minutes), 0)         AS total_overtime_min
         FROM attendance
         WHERE employee_id = $1
           AND EXTRACT(MONTH FROM date) = $2
           AND EXTRACT(YEAR  FROM date) = $3`,
        [emp.employee_id, month, year]
      );

      const a             = att.rows[0];
      const presentDays   = parseInt(a.present_days)  || 0;
      const absentDays    = parseInt(a.absent_days)   || 0;
      const leaveDays     = parseInt(a.leave_days)    || 0;
      const lateDays      = parseInt(a.late_days)     || 0;
      const overtimeMin   = parseInt(a.total_overtime_min) || 0;

      const dailyRate     = parseFloat(emp.base_salary) / workingDays;
      const lateDeduction = lateDays * dailyRate * LATE_DEDUCTION_RATE;
      const absentDeduct  = absentDays * dailyRate;
      const overtimeBonus = (overtimeMin / 60) * (dailyRate / 8) * 1.5; // 1.5x hourly rate

      const grossSalary   = parseFloat(emp.base_salary);
      const netSalary     = Math.max(0, grossSalary - lateDeduction - absentDeduct + overtimeBonus);

      // Upsert payroll record
      const rec = await db.query(
        `INSERT INTO payroll_records
           (employee_id, month, year, base_salary, working_days, present_days,
            absent_days, leave_days, late_deduction, overtime_bonus, gross_salary,
            net_salary, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (employee_id, month, year) DO UPDATE SET
           present_days = $6, absent_days = $7, leave_days = $8,
           late_deduction = $9, overtime_bonus = $10,
           gross_salary = $11, net_salary = $12,
           generated_by = $13, generated_at = NOW()
         RETURNING *`,
        [
          emp.employee_id, month, year, grossSalary, workingDays,
          presentDays, absentDays, leaveDays,
          lateDeduction.toFixed(2), overtimeBonus.toFixed(2),
          grossSalary.toFixed(2), netSalary.toFixed(2),
          req.admin.id,
        ]
      );

      results.push({
        ...rec.rows[0],
        employee_name: emp.full_name,
        late_days: lateDays,
        overtime_hours: (overtimeMin / 60).toFixed(1),
      });
    }

    return res.json({
      success: true,
      message: `Payroll generated for ${results.length} employee(s).`,
      data: { month, year, working_days: workingDays, records: results },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/report ────────────────────────────── */
const getPayrollReport = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const rows = await db.query(
      `SELECT pr.*, e.full_name, d.name AS department
       FROM payroll_records pr
       JOIN employees e ON e.employee_id = pr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE pr.month = $1 AND pr.year = $2
       ORDER BY e.full_name`,
      [month, year]
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/export ────────────────────────────── */
const exportPayroll = async (req, res, next) => {
  try {
    const { month, year, format: fmt = 'excel' } = req.query;
    if (!month || !year) throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const rows = await db.query(
      `SELECT pr.*, e.full_name, d.name AS department
       FROM payroll_records pr
       JOIN employees e ON e.employee_id = pr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE pr.month = $1 AND pr.year = $2
       ORDER BY e.full_name`,
      [month, year]
    );

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const filename  = `payroll-${monthName}-${year}`;

    const data = rows.rows.map(r => ({
      'Employee ID':      r.employee_id,
      'Name':             r.full_name,
      'Department':       r.department,
      'Base Salary':      r.base_salary,
      'Working Days':     r.working_days,
      'Present Days':     r.present_days,
      'Absent Days':      r.absent_days,
      'Leave Days':       r.leave_days,
      'Late Deduction':   r.late_deduction,
      'Overtime Bonus':   r.overtime_bonus,
      'Gross Salary':     r.gross_salary,
      'Net Salary':       r.net_salary,
      'Status':           r.status,
    }));

    // ── CSV ─────────────────────────────────────────────────
    if (fmt === 'csv') {
      const parser = new Parser();
      const csv    = parser.parse(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // ── PDF ─────────────────────────────────────────────────
    if (fmt === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);

      // Header
      doc.fillColor('#2E7D32').fontSize(18).text('Manikstu Agro', { align: 'center' });
      doc.fillColor('#333').fontSize(13).text(`Payroll Report — ${monthName} ${year}`, { align: 'center' });
      doc.moveDown();

      // Summary row
      const total = rows.rows.reduce((s, r) => s + parseFloat(r.net_salary), 0);
      doc.fontSize(11).text(`Total Employees: ${rows.rows.length}   |   Total Net Payroll: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, { align: 'center' });
      doc.moveDown();

      // Table header
      const cols = ['ID', 'Name', 'Dept', 'Base', 'Present', 'Absent', 'Late Ded.', 'OT Bonus', 'Net Salary'];
      const widths = [60, 110, 80, 65, 50, 50, 65, 65, 75];
      let x = 40, y = doc.y;
      doc.fillColor('#2E7D32').rect(x, y, widths.reduce((a,b)=>a+b,0), 20).fill();
      doc.fillColor('#fff').fontSize(9);
      cols.forEach((col, i) => {
        doc.text(col, x + 3, y + 5, { width: widths[i] - 6, align: 'left' });
        x += widths[i];
      });
      y += 20;

      // Rows
      rows.rows.forEach((r, idx) => {
        x = 40;
        if (idx % 2 === 0) doc.fillColor('#f9f9f9').rect(40, y, widths.reduce((a,b)=>a+b,0), 18).fill();
        doc.fillColor('#333').fontSize(8);
        const vals = [
          r.employee_id, r.full_name, r.department || '',
          `₹${parseFloat(r.base_salary).toLocaleString('en-IN')}`,
          r.present_days, r.absent_days,
          `₹${parseFloat(r.late_deduction).toFixed(0)}`,
          `₹${parseFloat(r.overtime_bonus).toFixed(0)}`,
          `₹${parseFloat(r.net_salary).toLocaleString('en-IN')}`,
        ];
        vals.forEach((val, i) => {
          doc.text(String(val), x + 3, y + 4, { width: widths[i] - 6, align: 'left' });
          x += widths[i];
        });
        y += 18;
        if (y > 530) { doc.addPage({ layout: 'landscape' }); y = 40; }
      });

      doc.end();
      return;
    }

    // ── Excel (default) ─────────────────────────────────────
    const wb  = new ExcelJS.Workbook();
    const ws  = wb.addWorksheet(`${monthName} ${year}`);

    ws.columns = Object.keys(data[0] || {}).map(key => ({ header: key, key, width: 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };

    data.forEach(row => ws.addRow(row));

    // Currency format for money columns
    ['Base Salary','Late Deduction','Overtime Bonus','Gross Salary','Net Salary'].forEach(col => {
      const c = ws.getColumn(col);
      c.numFmt = '₹#,##0.00';
    });

    // Totals row
    const lastRow = ws.lastRow.number + 1;
    ws.addRow({
      'Employee ID': 'TOTAL',
      'Net Salary': { formula: `SUM(M2:M${lastRow-1})` },
    });
    ws.getRow(lastRow).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

module.exports = { generatePayroll, getPayrollReport, exportPayroll };
