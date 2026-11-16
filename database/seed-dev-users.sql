-- DEVELOPMENT ONLY. Creates well-known accounts that share one password.
-- Never loaded by setup-xampp.sh when NODE_ENV=production; the API also refuses
-- to start in production while any account uses this password hash.
USE regbroker;
-- bcrypt hash for ChangeMe123!
SET @pw = '$2b$12$XsMWKqcR3Q9W1YVCzJdyeOoPDMWAJyTf3sGGnjCxtlQeWVmrwjKX6';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'مدیر سامانه','admin@regbroker.local','09120000001',@pw,'active' FROM roles WHERE code='admin';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'کارشناس ثبتی','expert@regbroker.local','09120000002',@pw,'active' FROM roles WHERE code='registry_expert';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'کارشناس نقشه‌برداری','surveyor@regbroker.local','09120000003',@pw,'active' FROM roles WHERE code='surveyor';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'پشتیبان سامانه','support@regbroker.local','09120000004',@pw,'active' FROM roles WHERE code='support';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'مسئول مالی','finance@regbroker.local','09120000005',@pw,'active' FROM roles WHERE code='finance';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'مدیر عملیات','operations@regbroker.local','09120000006',@pw,'active' FROM roles WHERE code='operations_manager';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'مسئول تطبیق','compliance@regbroker.local','09120000007',@pw,'active' FROM roles WHERE code='compliance';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'مسئول فنی','technical@regbroker.local','09120000008',@pw,'active' FROM roles WHERE code='technical';
INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) SELECT id,'ناظر سازمان ثبت','observer@regbroker.local','09120000009',@pw,'active' FROM roles WHERE code='observer';

INSERT INTO announcements (title,body,category,created_by)
SELECT 'فعال‌سازی آزمایشی سامانه','سامانه در محیط توسعه محلی فعال است. ارائه خدمات واقعی منوط به دریافت مجوز و دسترسی رسمی سازمان ثبت خواهد بود.','general',id FROM users WHERE email='admin@regbroker.local';

