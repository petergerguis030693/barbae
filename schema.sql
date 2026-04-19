CREATE DATABASE IF NOT EXISTS barbae CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barbae;
ALTER DATABASE barbae CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) UNIQUE NULL,
  image_path VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  title VARCHAR(220) NOT NULL,
  slug VARCHAR(220) UNIQUE NULL,
  sku VARCHAR(120) UNIQUE NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  has_color_options TINYINT(1) NOT NULL DEFAULT 0,
  has_size_options TINYINT(1) NOT NULL DEFAULT 0,
  color_stock_json TEXT NULL,
  has_personalization_options TINYINT(1) NOT NULL DEFAULT 0,
  personalization_type ENUM('none','initials','name','date') NOT NULL DEFAULT 'none',
  featured_image VARCHAR(255) NULL,
  is_bestseller TINYINT(1) NOT NULL DEFAULT 0,
  seo_title VARCHAR(255) NULL,
  seo_description VARCHAR(500) NULL,
  seo_text MEDIUMTEXT NULL,
  focus_keyword VARCHAR(190) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seo_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  meta_title VARCHAR(255) NULL,
  meta_description VARCHAR(500) NULL,
  seo_text MEDIUMTEXT NULL,
  focus_keyword VARCHAR(190) NULL,
  og_title VARCHAR(255) NULL,
  og_description VARCHAR(500) NULL,
  canonical_url VARCHAR(500) NULL,
  robots VARCHAR(80) NOT NULL DEFAULT 'index,follow',
  json_ld MEDIUMTEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(50) NULL,
  street VARCHAR(190) NULL,
  postal_code VARCHAR(20) NULL,
  city VARCHAR(120) NULL,
  company_name VARCHAR(190) NULL,
  uid_number VARCHAR(60) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(80) NOT NULL UNIQUE,
  customer_id INT NULL,
  status ENUM('pending','paid','processing','shipped','completed','cancelled') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  type ENUM('percent','fixed') NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  usage_limit INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  invoice_number VARCHAR(80) NOT NULL UNIQUE,
  pdf_path VARCHAR(255) NULL,
  issued_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('sent','failed') NOT NULL,
  provider_message TEXT NULL,
  related_type VARCHAR(50) NULL,
  related_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(120) NOT NULL UNIQUE,
  `value` TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO settings (`key`, `value`) VALUES
('shop_name', 'Mein Onlineshop'),
('support_email', 'support@example.com'),
('currency', 'EUR')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO seo_pages (title, slug, meta_title, meta_description, seo_text, focus_keyword, robots) VALUES
('Startseite', '', 'Onlineshop - Startseite', 'Entdecke Produkte, Angebote und Neuheiten in unserem Shop.', 'SEO Text fuer die Startseite.', 'onlineshop', 'index,follow'),
('Shop', 'shop', 'Produkte online kaufen', 'Alle Produkte in unserem Shop mit schneller Lieferung.', 'SEO Text fuer die Shopseite.', 'produkte online kaufen', 'index,follow'),
('Kategorien', 'kategorien', 'Produktkategorien im Ueberblick', 'Finde Produkte schnell ueber unsere Kategorien.', 'SEO Text fuer die Kategorienseite.', 'produktkategorien', 'index,follow'),
('Produktdetail', 'produkt', 'Produktdetails und Bewertungen', 'Alle Produktinfos, technische Daten und Vorteile im Ueberblick.', 'SEO Text fuer die Produktdetailseite.', 'produktdetails', 'index,follow'),
('Kontakt', 'kontakt', 'Kontakt und Beratung', 'Kontaktiere uns fuer Fragen zu Produkten und Bestellungen.', 'SEO Text fuer die Kontaktseite.', 'kontakt shop', 'index,follow'),
('Ueber uns', 'ueber-uns', 'Ueber unseren Shop', 'Lerne unser Team und unsere Mission kennen.', 'SEO Text fuer die Ueber-uns-Seite.', 'ueber uns', 'index,follow')
ON DUPLICATE KEY UPDATE
meta_title = VALUES(meta_title),
meta_description = VALUES(meta_description),
seo_text = VALUES(seo_text),
focus_keyword = VALUES(focus_keyword),
robots = VALUES(robots);

INSERT INTO customers (first_name, last_name, email, phone, street, postal_code, city, company_name, uid_number) VALUES
('Max', 'Mustermann', 'max@example.com', '+49111111111', 'Musterstrasse 12', '12345', 'Musterstadt', 'Mustermann GmbH', 'ATU12345678'),
('Erika', 'Musterfrau', 'erika@example.com', '+49222222222', 'Beispielweg 7', '54321', 'Beispielstadt', NULL, NULL)
ON DUPLICATE KEY UPDATE
phone = VALUES(phone),
street = VALUES(street),
postal_code = VALUES(postal_code),
city = VALUES(city),
company_name = VALUES(company_name),
uid_number = VALUES(uid_number);

INSERT INTO categories (name, slug) VALUES
('Elektronik', 'elektronik'),
('Zubehör', 'zubehoer')
ON DUPLICATE KEY UPDATE slug = VALUES(slug);

INSERT INTO products (category_id, title, sku, description, price, stock, is_active)
SELECT c.id, 'Demo Produkt', 'SKU-DEMO-1', 'Demo Beschreibung', 49.90, 25, 1 FROM categories c WHERE c.slug = 'elektronik' LIMIT 1
ON DUPLICATE KEY UPDATE price = VALUES(price), stock = VALUES(stock);

INSERT INTO orders (order_number, customer_id, status, total_amount, currency)
SELECT 'ORD-10001', c.id, 'paid', 49.90, 'EUR' FROM customers c WHERE c.email = 'max@example.com' LIMIT 1
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
SELECT o.id, p.id, 1, 49.90, 49.90
FROM orders o
JOIN products p ON p.sku = 'SKU-DEMO-1'
WHERE o.order_number = 'ORD-10001'
LIMIT 1;




