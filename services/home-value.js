/**
 * Home value estimation via Zillow (ZPID/Zestimate) or Attom Data API.
 * Supports both APIs — falls back to Attom if Zillow is unavailable.
 * Requires ZILLOW_API_KEY or ATTOM_API_KEY environment variable.
 *
 * Used to display property value and projected ROI after roof replacement
 * in the homeowner portal (WealthGuard conversation).
 */

const ROOF_ROI_LOW = 0.60;
const ROOF_ROI_HIGH = 0.70;
const ROOF_ROI_MID = 0.65;

async function getHomeValue(address) {
  // Try Zillow first, fall back to Attom
  if (process.env.ZILLOW_API_KEY) {
    const result = await fetchZillow(address);
    if (result.success) return result;
  }

  if (process.env.ATTOM_API_KEY) {
    const result = await fetchAttom(address);
    if (result.success) return result;
  }

  return { success: false, reason: 'No property valuation API configured (set ZILLOW_API_KEY or ATTOM_API_KEY)' };
}

async function fetchZillow(address) {
  try {
    // Zillow Bridge API (RapidAPI) — GetSearchResults + Zestimate
    const apiKey = process.env.ZILLOW_API_KEY;
    const url = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?location=${encodeURIComponent(address)}&home_type=Houses`;

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'zillow-com1.p.rapidapi.com'
      }
    });

    const data = await res.json();
    const property = data.props?.[0] || data.results?.[0];

    if (!property) return { success: false, reason: 'Property not found on Zillow' };

    const zestimate = property.zestimate || property.price || null;
    if (!zestimate) return { success: false, reason: 'No Zestimate available' };

    return {
      success: true,
      source: 'zillow',
      currentValue: zestimate,
      address: property.address || address,
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function fetchAttom(address) {
  try {
    const apiKey = process.env.ATTOM_API_KEY;
    const url = `https://api.gateway.attomdata.com/propertyapi/v1.0.0/assessment/detail?address=${encodeURIComponent(address)}`;

    const res = await fetch(url, {
      headers: { 'apikey': apiKey, 'Accept': 'application/json' }
    });

    const data = await res.json();
    const property = data.property?.[0];

    if (!property) return { success: false, reason: 'Property not found on Attom' };

    const value = property.assessment?.market?.mktTtlValue
      || property.assessment?.assessed?.assdTtlValue
      || null;

    if (!value) return { success: false, reason: 'No market value available' };

    return {
      success: true,
      source: 'attom',
      currentValue: value,
      address: property.address?.oneLine || address,
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Calculate projected value after roof replacement.
 * Industry standard: new roof adds 60-70% of project cost to home value.
 *
 * @param {number} currentValue - Current estimated home value
 * @param {number} projectCost - Estimated roof replacement cost (supplement value or estimate)
 * @returns {Object} ROI projection
 */
function calculateRoofROI(currentValue, projectCost) {
  const addedValueLow = Math.round(projectCost * ROOF_ROI_LOW);
  const addedValueHigh = Math.round(projectCost * ROOF_ROI_HIGH);
  const addedValueMid = Math.round(projectCost * ROOF_ROI_MID);

  return {
    currentValue,
    projectCost,
    addedValue: addedValueMid,
    addedValueRange: { low: addedValueLow, high: addedValueHigh },
    projectedValue: currentValue + addedValueMid,
    projectedValueRange: {
      low: currentValue + addedValueLow,
      high: currentValue + addedValueHigh
    },
    roiPercent: Math.round(ROOF_ROI_MID * 100)
  };
}

module.exports = { getHomeValue, calculateRoofROI };
