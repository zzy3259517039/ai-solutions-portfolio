CREATE TABLE IF NOT EXISTS voucher_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  voucher_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  admin_session_id BIGINT UNSIGNED NOT NULL,
  action ENUM('USE', 'REVERSE') NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_verifications_voucher (voucher_id, created_at),
  CONSTRAINT fk_verifications_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
  CONSTRAINT fk_verifications_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_verifications_admin_session FOREIGN KEY (admin_session_id) REFERENCES admin_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
