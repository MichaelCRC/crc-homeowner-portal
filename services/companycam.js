/**
 * CompanyCam — WEBHOOK ONLY. No API key exists.
 * Photos arrive via POST /webhook/companycam and are stored in job.photos[].
 * This module provides helpers for photo storage and retrieval from job records.
 */

function categorizePhoto(photo) {
  const tags = (photo.tags || []).map(t => (t.display_value || t.value || t || '').toLowerCase());
  const caption = (photo.caption || photo.photo_note || '').toLowerCase();

  const isPostInstall = tags.some(t =>
    t.includes('install') || t.includes('complete') || t.includes('after') || t.includes('final')
  ) || caption.includes('install') || caption.includes('complete') || caption.includes('after');

  return isPostInstall ? 'postInstall' : 'inspection';
}

function normalizePhoto(rawPhoto) {
  return {
    id: rawPhoto.id || String(Date.now()),
    url: rawPhoto.uris?.[0]?.uri || rawPhoto.photo_url || rawPhoto.url || '',
    thumb: rawPhoto.uris?.find(u => u.type === 'thumb')?.uri || rawPhoto.uris?.[0]?.uri || rawPhoto.photo_url || rawPhoto.thumb || rawPhoto.url || '',
    caption: rawPhoto.photo_note || rawPhoto.caption || '',
    takenAt: rawPhoto.captured_at || rawPhoto.created_at || rawPhoto.takenAt || new Date().toISOString(),
    tags: (rawPhoto.tags || []).map(t => t.display_value || t.value || t || ''),
    category: categorizePhoto(rawPhoto)
  };
}

function getPhotosFromJob(job) {
  const photos = job.photos || [];
  const inspection = photos.filter(p => p.category !== 'postInstall');
  const postInstall = photos.filter(p => p.category === 'postInstall');
  return { inspection, postInstall };
}

module.exports = { categorizePhoto, normalizePhoto, getPhotosFromJob };
