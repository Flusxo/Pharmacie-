-- 002: great-circle distance in km (haversine). Idempotent.
CREATE OR REPLACE FUNCTION haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
$$;

-- A pharmacy that may be proposed to patients: verified, active, not paused, not deleted.
CREATE OR REPLACE VIEW eligible_pharmacies AS
  SELECT p.*
    FROM pharmacies p
    JOIN users u ON u.id = p.user_id
   WHERE p.verified AND NOT p.paused AND u.status = 'active' AND u.deleted_at IS NULL;
