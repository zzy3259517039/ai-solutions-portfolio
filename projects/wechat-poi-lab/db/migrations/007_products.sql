CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  original_price INT UNSIGNED NOT NULL,
  sale_price INT UNSIGNED NOT NULL,
  stock INT UNSIGNED NOT NULL,
  valid_days SMALLINT UNSIGNED NOT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_products_store_status (store_id, status),
  CONSTRAINT fk_products_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT chk_products_prices CHECK (original_price >= sale_price AND sale_price > 0),
  CONSTRAINT chk_products_valid_days CHECK (valid_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
