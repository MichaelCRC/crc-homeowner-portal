const CC_API_BASE = 'https://api.companycam.com/v2';

async function fetchPhotos(projectId) {
  const token = process.env.COMPANYCAM_API_KEY;
  if (!token || !projectId) return [];

  try {
    const res = await fetch(`${CC_API_BASE}/projects/${projectId}/photos?per_page=100`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) return [];
    const photos = await res.json();
    return photos.map(p => ({
      id: p.id,
      url: p.uris?.[0]?.uri || p.photo_url || '',
      thumb: p.uris?.find(u => u.type === 'thumb')?.uri || p.uris?.[0]?.uri || '',
      caption: p.photo_note || '',
      takenAt: p.captured_at || p.created_at || '',
      tags: (p.tags || []).map(t => t.display_value || t.value || '')
    }));
  } catch (err) {
    console.error('CompanyCam fetch error:', err.message);
    return [];
  }
}

async function searchProjectByAddress(address) {
  const token = process.env.COMPANYCAM_API_KEY;
  if (!token || !address) return null;

  try {
    const res = await fetch(`${CC_API_BASE}/projects?search=${encodeURIComponent(address)}&per_page=5`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const projects = await res.json();
    return projects.length > 0 ? projects[0] : null;
  } catch (err) {
    console.error('CompanyCam search error:', err.message);
    return null;
  }
}

module.exports = { fetchPhotos, searchProjectByAddress };
