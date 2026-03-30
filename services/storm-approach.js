/**
 * Storm approach intelligence for field reps.
 * Detects GPS proximity to job site and provides
 * storm-informed inspection approach guidance.
 */

const { reverseGeocode } = require('./geocode');

const PROXIMITY_THRESHOLD_FEET = 500;
const FEET_PER_DEGREE_LAT = 364000;
const FEET_PER_DEGREE_LNG_AT_40 = 279000; // ~40°N (Columbus, OH)

// Compass directions for wind approach
const COMPASS = [
  'North', 'North-Northeast', 'Northeast', 'East-Northeast',
  'East', 'East-Southeast', 'Southeast', 'South-Southeast',
  'South', 'South-Southwest', 'Southwest', 'West-Southwest',
  'West', 'West-Northwest', 'Northwest', 'North-Northwest'
];

function degreesToCompass(degrees) {
  const idx = Math.round(degrees / 22.5) % 16;
  return COMPASS[idx];
}

/**
 * Calculate distance in feet between two GPS points.
 */
function distanceFeet(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * FEET_PER_DEGREE_LAT;
  const dLng = (lng2 - lng1) * FEET_PER_DEGREE_LNG_AT_40;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Simple geocode of an address to lat/lng via Google Maps.
 * (Forward geocoding — address to coordinates)
 */
async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.length) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {}
  return null;
}

/**
 * Check if rep's GPS position is within proximity of the job site.
 * Returns approach brief if at site, or distance info if not.
 *
 * @param {Object} job - Job record (needs address, supplementData.stormData)
 * @param {number} repLat - Rep's current GPS latitude
 * @param {number} repLng - Rep's current GPS longitude
 * @returns {Object} proximity check + storm approach brief
 */
async function checkProximityAndBrief(job, repLat, repLng) {
  // Geocode the job address
  const jobCoords = await geocodeAddress(job.address);

  if (!jobCoords) {
    return {
      atJobSite: false,
      reason: 'Could not geocode job address',
      stormBrief: buildStormBrief(job)
    };
  }

  const distance = distanceFeet(repLat, repLng, jobCoords.lat, jobCoords.lng);
  const atJobSite = distance <= PROXIMITY_THRESHOLD_FEET;

  const result = {
    atJobSite,
    distanceFeet: Math.round(distance),
    jobCoords,
    repCoords: { lat: repLat, lng: repLng }
  };

  if (atJobSite) {
    result.stormBrief = buildStormBrief(job);
  }

  return result;
}

/**
 * Build the storm approach brief from job storm data.
 * Provides wind direction, recommended starting slope, and hail info.
 */
function buildStormBrief(job) {
  const stormData = job.supplementData?.stormData || job.stormData;
  const events = stormData?.events || [];

  if (events.length === 0) {
    return {
      available: false,
      message: 'No storm data available for this job'
    };
  }

  // Use the most recent / most severe event
  const primary = events.reduce((worst, ev) => {
    const severity = (ev.hailSize || 0) + (ev.windSpeed || 0) / 100;
    const worstSev = (worst.hailSize || 0) + (worst.windSpeed || 0) / 100;
    return severity > worstSev ? ev : worst;
  }, events[0]);

  const windSpeed = primary.windSpeed || null;
  const windDirection = primary.windDirection || primary.windBearing || null;
  const hailSize = primary.hailSize || null;
  const eventType = primary.eventType || 'Unknown';
  const eventDate = primary.date || null;

  // Determine approach direction (wind came FROM this direction)
  let windFromCompass = null;
  let startSlope = null;
  let approachGuidance = '';

  if (windDirection !== null && windDirection !== undefined) {
    windFromCompass = degreesToCompass(windDirection);
    // Start inspection on the windward side (facing the storm)
    startSlope = `${windFromCompass}-facing slope`;
    approachGuidance = `Wind came from ${windFromCompass} at ${windSpeed ? windSpeed + ' MPH' : 'unknown speed'}. Start on the ${windFromCompass}-facing slope.`;
  } else if (windSpeed) {
    approachGuidance = `Wind speed recorded at ${windSpeed} MPH. Check all exposures for wind damage.`;
  }

  const brief = {
    available: true,
    eventType,
    eventDate,
    windSpeed,
    windFromCompass,
    hailSize: hailSize ? `${hailSize}"` : null,
    startSlope,
    approachGuidance,
    fieldNotes: []
  };

  // Build field notes
  if (hailSize) {
    brief.fieldNotes.push(`Hail size: ${hailSize}" — ${hailSize >= 1.75 ? 'significant damage likely' : hailSize >= 1.0 ? 'moderate damage expected' : 'check for soft metal and shingle hits'}`);
  }
  if (windSpeed && windSpeed >= 60) {
    brief.fieldNotes.push(`High wind event (${windSpeed} MPH) — check for lifted shingles, missing ridge caps, damaged fascia`);
  }
  if (eventType.toLowerCase().includes('hail') && eventType.toLowerCase().includes('wind')) {
    brief.fieldNotes.push('Combined hail + wind event — document both impact marks and creasing/lifting');
  }

  return brief;
}

module.exports = { checkProximityAndBrief, buildStormBrief, distanceFeet, geocodeAddress };
