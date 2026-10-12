ALTER TABLE vouchers ADD COLUMN voucher_no CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, ADD UNIQUE KEY uq_vouchers_no (voucher_no);
