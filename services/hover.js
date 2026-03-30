/**
 * Hover integration for roof visualization.
 * Uses OAuth credentials from supplement portal (shared via env vars).
 * Matches Hover jobs by property address.
 *
 * Requires: HOVER_API_KEY or HOVER_ACCESS_TOKEN
 */

const HOVER_API_BASE = 'https://api.hover.to/api/v2';

function getHeaders() {
  const token = process.env.HOVER_ACCESS_TOKEN || process.env.HOVER_API_KEY;
  if (!token) return null;
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };
}

/**
 * Find a Hover job by property address.
 * Returns the Hover job ID and visualization URLs if found.
 */
async function findHoverJob(address) {
  const headers = getHeaders();
  if (!headers) {
    return { success: false, reason: 'Hover API credentials not configured' };
  }

  try {
    // Search Hover jobs by address
    const searchAddr = address.split(',')[0].trim();
    const res = await fetch(
      `${HOVER_API_BASE}/jobs?search=${encodeURIComponent(searchAddr)}&state=complete`,
      { headers }
    );

    if (!res.ok) {
      return { success: false, reason: `Hover API error: ${res.status}` };
    }

    const data = await res.json();
    const jobs = data.results || data.jobs || [];

    if (jobs.length === 0) {
      return { success: false, reason: 'No Hover job found for this address' };
    }

    // Best match — first result from address search
    const job = jobs[0];
    return {
      success: true,
      hoverId: job.id,
      address: job.location_line_1 || job.name || address,
      state: job.state || 'complete',
      visualizationUrl: job.share_url || null,
      model3dUrl: job.model_url || job.three_d_model_url || null,
      deliverableId: job.deliverable_id || null
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Get the embeddable visualization URL for a Hover job.
 * This provides the color-selection / design tool embed.
 */
async function getVisualizationEmbed(hoverId) {
  const headers = getHeaders();
  if (!headers) {
    return { success: false, reason: 'Hover API credentials not configured' };
  }

  try {
    const res = await fetch(`${HOVER_API_BASE}/jobs/${hoverId}/share`, { headers });

    if (!res.ok) {
      // Try the direct capture share URL
      return {
        success: true,
        embedUrl: `https://hover.to/3d/${hoverId}`,
        type: 'direct'
      };
    }

    const data = await res.json();
    return {
      success: true,
      embedUrl: data.url || data.share_url || `https://hover.to/3d/${hoverId}`,
      type: 'share'
    };
  } catch {
    return {
      success: true,
      embedUrl: `https://hover.to/3d/${hoverId}`,
      type: 'fallback'
    };
  }
}

module.exports = { findHoverJob, getVisualizationEmbed };
