CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  year TEXT,
  km TEXT,
  power TEXT,
  range_km TEXT,
  drive TEXT,
  color TEXT,
  price_eur REAL,
  purchase_price_eur REAL,
  status TEXT DEFAULT 'available',
  description TEXT,
  source_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment (
  car_id TEXT NOT NULL,
  item TEXT NOT NULL,
  FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE
);
