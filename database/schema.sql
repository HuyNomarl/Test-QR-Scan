-- ============================================================
-- QR Attendance & Workforce Management System
-- PostgreSQL 15+ Production Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
id SERIAL PRIMARY KEY,
name VARCHAR(100) NOT NULL UNIQUE,
manager_id VARCHAR(20),
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
employee_id VARCHAR(20) PRIMARY KEY,
full_name VARCHAR(150) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
phone VARCHAR(20) UNIQUE NOT NULL,
department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
designation VARCHAR(100),
date_of_joining DATE NOT NULL,
base_salary NUMERIC(12,2) DEFAULT 0,
password_hash VARCHAR(255) NOT NULL,

casual_leave_balance INTEGER DEFAULT 12,
sick_leave_balance INTEGER DEFAULT 10,
paid_leave_balance INTEGER DEFAULT 15,

is_active BOOLEAN DEFAULT TRUE,
profile_photo_url TEXT,

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_email ON employees(email);
CREATE INDEX idx_employee_phone ON employees(phone);
CREATE INDEX idx_employee_dept ON employees(department_id);

-- ============================================================
-- ADMIN USERS
-- ============================================================

CREATE TYPE admin_role AS ENUM ('super_admin','hr_admin','viewer');

CREATE TABLE IF NOT EXISTS admins (
id SERIAL PRIMARY KEY,
name VARCHAR(150) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
password_hash VARCHAR(255) NOT NULL,
role admin_role DEFAULT 'hr_admin',
is_active BOOLEAN DEFAULT TRUE,
last_login_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TYPE attendance_method AS ENUM ('qr','face','manual','offline_sync');
CREATE TYPE attendance_status AS ENUM ('present','absent','leave','holiday','half_day');

CREATE TABLE IF NOT EXISTS attendance (
id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) REFERENCES employees(employee_id) ON DELETE CASCADE,
date DATE NOT NULL,

check_in_time TIMESTAMPTZ,
check_out_time TIMESTAMPTZ,

working_minutes INTEGER DEFAULT 0,
overtime_minutes INTEGER DEFAULT 0,

checkin_lat NUMERIC(10,7),
checkin_lng NUMERIC(10,7),

checkout_lat NUMERIC(10,7),
checkout_lng NUMERIC(10,7),

gps_verified BOOLEAN DEFAULT FALSE,

device_id VARCHAR(255),
ip_address VARCHAR(45),

method attendance_method DEFAULT 'qr',
status attendance_status DEFAULT 'present',

is_late BOOLEAN DEFAULT FALSE,
late_minutes INTEGER DEFAULT 0,

is_offline_record BOOLEAN DEFAULT FALSE,
synced_at TIMESTAMPTZ,

is_manually_edited BOOLEAN DEFAULT FALSE,
edited_by_admin_id INTEGER REFERENCES admins(id),
edit_reason TEXT,

notes TEXT,

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),

UNIQUE(employee_id,date)
);

CREATE INDEX idx_att_emp ON attendance(employee_id);
CREATE INDEX idx_att_date ON attendance(date);

-- ============================================================
-- CUSTOMER LOYALTY PROGRAM
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
id BIGSERIAL PRIMARY KEY,
phone VARCHAR(30) NOT NULL UNIQUE,
full_name VARCHAR(150) NOT NULL,
country VARCHAR(100) NOT NULL,
points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
last_earned_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_last_earned_at ON customers(last_earned_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_point_events (
id BIGSERIAL PRIMARY KEY,
customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
points INTEGER NOT NULL DEFAULT 1,
event_type VARCHAR(30) NOT NULL DEFAULT 'qr_scan',
source_ip VARCHAR(45),
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_events_customer ON loyalty_point_events(customer_id, created_at DESC);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================

CREATE TYPE leave_type AS ENUM ('casual','sick','paid','other');
CREATE TYPE leave_status AS ENUM ('pending','approved','rejected','cancelled');

CREATE TABLE IF NOT EXISTS leave_requests (

id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) REFERENCES employees(employee_id) ON DELETE CASCADE,

leave_type leave_type,
from_date DATE,
to_date DATE,

days_requested INTEGER,

reason TEXT,

status leave_status DEFAULT 'pending',

admin_comment TEXT,
reviewed_by INTEGER REFERENCES admins(id),
reviewed_at TIMESTAMPTZ,

submitted_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),

CHECK (to_date >= from_date)
);

-- ============================================================
-- FACE RECOGNITION
-- ============================================================

CREATE TABLE IF NOT EXISTS face_embeddings (
id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) UNIQUE
REFERENCES employees(employee_id) ON DELETE CASCADE,

embedding JSONB NOT NULL,

model_version VARCHAR(50) DEFAULT 'face-api-v1',

is_active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYROLL
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_records (

id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20)
REFERENCES employees(employee_id) ON DELETE CASCADE,

month INTEGER CHECK (month BETWEEN 1 AND 12),
year INTEGER,

base_salary NUMERIC(12,2),

working_days INTEGER DEFAULT 0,
present_days INTEGER DEFAULT 0,
absent_days INTEGER DEFAULT 0,
leave_days INTEGER DEFAULT 0,

late_deduction NUMERIC(12,2) DEFAULT 0,
overtime_bonus NUMERIC(12,2) DEFAULT 0,

other_deductions NUMERIC(12,2) DEFAULT 0,
other_allowances NUMERIC(12,2) DEFAULT 0,

gross_salary NUMERIC(12,2),
net_salary NUMERIC(12,2),

status VARCHAR(20) DEFAULT 'draft',

generated_by INTEGER REFERENCES admins(id),

generated_at TIMESTAMPTZ DEFAULT NOW(),

finalized_at TIMESTAMPTZ,

notes TEXT,

UNIQUE(employee_id,month,year)
);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
key VARCHAR(100) PRIMARY KEY,
value TEXT,
description TEXT,
updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings VALUES
('company_name','QR Attendance System','System name'),
('office_lat','22.5726','Office latitude'),
('office_lng','88.3639','Office longitude'),
('gps_radius_meters','100','Allowed GPS radius'),
('face_confidence','0.85','Face confidence threshold'),
('late_threshold','09:30','Late time threshold'),
('working_hours_per_day','8','Standard working hours');

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emp_update
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_att_update
BEFORE UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customer_update
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CALCULATE WORKING MINUTES
-- ============================================================

CREATE OR REPLACE FUNCTION calc_working_minutes()
RETURNS TRIGGER AS $$
BEGIN

IF NEW.check_out_time IS NOT NULL
AND NEW.check_in_time IS NOT NULL THEN

NEW.working_minutes =
FLOOR(EXTRACT(EPOCH FROM
(NEW.check_out_time - NEW.check_in_time))/60);

NEW.overtime_minutes =
GREATEST(0,NEW.working_minutes - 480);

END IF;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_minutes
BEFORE INSERT OR UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION calc_working_minutes();

-- ============================================================
-- DEMO DATA
-- ============================================================

INSERT INTO departments(name) VALUES
('Management'),
('Operations'),
('Finance'),
('HR'),
('IT')
ON CONFLICT DO NOTHING;

INSERT INTO admins(name,email,password_hash,role)
VALUES
(
'System Admin',
'[admin@company.com](mailto:admin@company.com)',
'$2b$12$LCv3c1yqBwWhxkd0LHAkCOYZ6TtxMQJqHn8/LewYpFQN5nw6Y5mBy',
'super_admin'
)
ON CONFLICT DO NOTHING;

INSERT INTO employees(
employee_id,
full_name,
email,
phone,
department_id,
designation,
date_of_joining,
base_salary,
password_hash
)
VALUES
(
'MKA-001',
'Rahul Sharma',
'[rahul@company.com](mailto:rahul@company.com)',
'9876543210',
1,
'Manager',
'2024-01-01',
45000,
'$2b$12$LCv3c1yqBwWhxkd0LHAkCOYZ6TtxMQJqHn8/LewYpFQN5nw6Y5mBy'
),
(
'MKA-002',
'Priya Singh',
'[priya@company.com](mailto:priya@company.com)',
'9876543211',
2,
'Field Officer',
'2024-02-01',
35000,
'$2b$12$LCv3c1yqBwWhxkd0LHAkCOYZ6TtxMQJqHn8/LewYpFQN5nw6Y5mBy'
)
ON CONFLICT DO NOTHING;
