/**
 * GPS Location Verification Service
 * Uses the Haversine formula to calculate distance between two coordinates.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Calculate distance in metres between two GPS coordinates.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the given coordinates are within the office GPS radius.
 */
function isWithinOffice(lat, lng) {
  const officeLat    = parseFloat(process.env.OFFICE_LATITUDE  || '22.5726');
  const officeLng    = parseFloat(process.env.OFFICE_LONGITUDE || '88.3639');
  const radiusMeters = parseFloat(process.env.OFFICE_RADIUS    || '100');
  const distance     = haversineDistance(lat, lng, officeLat, officeLng);
  return { allowed: distance <= radiusMeters, distance: Math.round(distance) };
}

module.exports = { haversineDistance, isWithinOffice };
