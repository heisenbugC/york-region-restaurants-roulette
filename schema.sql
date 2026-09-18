DROP TABLE IF EXISTS restaurants;

CREATE TABLE restaurants (
    id TEXT PRIMARY KEY,               
    name TEXT NOT NULL,
    address TEXT,
    rating REAL,
    municipality TEXT,
    google_maps_uri TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_municipality ON restaurants(municipality);