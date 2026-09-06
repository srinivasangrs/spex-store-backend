CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK(price >= 0),
  discount NUMERIC(5,2) NOT NULL DEFAULT 0,
  image TEXT,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(150),
  address TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'COD',
  status VARCHAR(30) NOT NULL DEFAULT 'PLACED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  price NUMERIC(10,2) NOT NULL
);

INSERT INTO products(id,name,category,description,price,discount,image,stock)
VALUES
(1,'SPEX Classic Black','Men','Classic full-frame spectacles with a clean black finish.',999,0,'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=900&q=80',25),
(2,'SPEX Premium Blue','Women','Premium blue full-frame spectacles for a modern look.',1499,0,'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80',20),
(3,'SPEX Metal Pro','Men','Lightweight metal-frame spectacles for everyday comfort.',1999,0,'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=900&q=80',15),
(4,'SPEX Vision Gold','Women','Premium gold-tone frame with an elegant finish.',2499,5,'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=900&q=80',12),
(5,'SPEX Kids Smart','Kids','Comfortable lightweight frames designed for kids.',799,0,'https://images.unsplash.com/photo-1582142306909-195724d33ffc?auto=format&fit=crop&w=900&q=80',30)
ON CONFLICT(id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('products','id'), COALESCE((SELECT MAX(id) FROM products),1), true);