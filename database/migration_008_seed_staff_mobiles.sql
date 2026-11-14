USE regbroker;

-- Back-office accounts are reachable through the same phone-first login form.
UPDATE users SET mobile='09120000001' WHERE email='admin@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000002' WHERE email='expert@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000003' WHERE email='surveyor@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000004' WHERE email='support@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000005' WHERE email='finance@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000006' WHERE email='operations@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000007' WHERE email='compliance@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000008' WHERE email='technical@regbroker.local' AND mobile IS NULL;
UPDATE users SET mobile='09120000009' WHERE email='observer@regbroker.local' AND mobile IS NULL;
