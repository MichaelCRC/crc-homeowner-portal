/**
 * Reverse geocoding via Google Maps Geocoding API.
 * Converts GPS coordinates to a formatted street address.
 * Requires GOOGLE_MAPS_API_KEY environment variable.
 */

async function reverseGeocode(lat, lng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { success: false, reason: 'Google Maps API key not configured' };
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return { success: false, reason: data.status || 'No results' };
    }

    // Prefer the most specific street-address result
    const best = data.results.find(r => r.types.includes('street_address'))
      || data.results.find(r => r.types.includes('premise'))
      || data.results[0];

    return {
      success: true,
      address: best.formatted_address,
      components: parseComponents(best.address_components)
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

function parseComponents(components) {
  const get = (type) => components.find(c => c.types.includes(type))?.long_name || '';
  return {
    street: `${get('street_number')} ${get('route')}`.trim(),
    city: get('locality') || get('sublocality'),
    state: components.find(c => c.types.includes('administrative_area_level_1'))?.short_name || '',
    zip: get('postal_code'),
    county: get('administrative_area_level_2')
  };
}

module.exports = { reverseGeocode };
