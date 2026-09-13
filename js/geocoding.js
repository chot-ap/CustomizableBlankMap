/**
 * geocoding.js
 * Enhanced fuzzy search supporting multi-word queries (space-separated)
 * with robust error handling, type safety, and rate-limit friendly requests.
 */

// Japanese Kana & Width normalization helper
function normalizeJapanese(str) {
  if (!str) return '';
  return String(str)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // Fullwidth to halfwidth
    .replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60))   // Katakana to Hiragana
    .toLowerCase();
}

/**
 * Perform a flexible multi-word search with safety guards
 * Supports spaces (e.g. "別府 杉乃井", "草津 温泉", "箱根 旅館")
 */
export async function searchPlaces(rawQuery) {
  try {
    if (!rawQuery || rawQuery.trim().length < 2) return [];

    // Normalize fullwidth spaces to halfwidth and clean up
    const cleanQuery = rawQuery.replace(/　/g, ' ').trim();
    const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 0);

    if (tokens.length === 0) return [];

    // Step 1: Sequential smart fetching to respect Nominatim rate-limits
    // Strategy: First try the exact query. If results are 0 and multiple tokens exist, try concatenated query or main keyword.
    let allItems = [];

    // Primary query
    const primaryResults = await fetchNominatimQuery(cleanQuery);
    allItems.push(...primaryResults);

    // If multiple words were given, also fetch the concatenated version (e.g. "別府 杉乃井" -> "別府杉乃井" or longest token)
    if (tokens.length > 1) {
      const concatenated = tokens.join('');
      // Only query if it differs from cleanQuery
      if (concatenated !== cleanQuery) {
        const concatResults = await fetchNominatimQuery(concatenated);
        allItems.push(...concatResults);
      }

      // If still very few results (less than 2), try the most specific token (longest non-generic word)
      if (allItems.length < 2) {
        const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
        const specificToken = sortedTokens[0];
        if (specificToken && specificToken !== cleanQuery && specificToken !== concatenated && specificToken.length >= 2) {
          const tokenResults = await fetchNominatimQuery(specificToken);
          allItems.push(...tokenResults);
        }
      }
    }

    if (allItems.length === 0) return [];

    // Step 2: Safe deduplication using place_id or safely parsed lat/lng
    const uniqueMap = new Map();
    allItems.forEach(item => {
      if (!item) return;
      const latNum = parseFloat(item.lat);
      const lonNum = parseFloat(item.lon);
      const latStr = !isNaN(latNum) ? latNum.toFixed(4) : '';
      const lonStr = !isNaN(lonNum) ? lonNum.toFixed(4) : '';
      const key = item.place_id || item.osm_id || `${latStr}-${lonStr}` || Math.random().toString();

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    const uniqueItems = Array.from(uniqueMap.values());

    // Step 3: Score and rank items based on how well they match the tokens
    const normCleanQuery = normalizeJapanese(cleanQuery);
    const normTokens = tokens.map(t => normalizeJapanese(t));

    const scoredItems = uniqueItems.map(item => {
      const rawName = item.name || (item.display_name ? item.display_name.split(',')[0] : '');
      const rawDisplayName = item.display_name || '';

      const normName = normalizeJapanese(rawName);
      const normDisplayName = normalizeJapanese(rawDisplayName);

      let score = 0;
      let matchedTokenCount = 0;

      // Exact phrase match
      if (normName.includes(normCleanQuery)) {
        score += 120;
      } else if (normDisplayName.includes(normCleanQuery)) {
        score += 80;
      }

      // Token-level matches
      normTokens.forEach(token => {
        let tokenMatched = false;
        if (normName.includes(token)) {
          score += 50;
          tokenMatched = true;
        }
        if (normDisplayName.includes(token)) {
          score += 30;
          tokenMatched = true;
        }
        if (tokenMatched) {
          matchedTokenCount++;
        }
      });

      // Bonus if all tokens appear in either name or address
      if (tokens.length > 1 && matchedTokenCount === tokens.length) {
        score += 100;
      }

      // Add small importance weight
      if (item.importance && typeof item.importance === 'number') {
        score += item.importance * 15;
      }

      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);

      return {
        score,
        name: rawName || '名称未設定',
        displayName: formatCleanAddress(rawDisplayName, rawName),
        lat: !isNaN(lat) ? lat : 35.6812,
        lng: !isNaN(lng) ? lng : 139.7671
      };
    });

    // Step 4: Sort and filter
    const sorted = scoredItems
      .filter(res => res.score > 0)
      .sort((a, b) => b.score - a.score);

    // If scoring filtered out everything (unlikely), fallback to original items
    const finalItems = sorted.length > 0 ? sorted : scoredItems;

    return finalItems.slice(0, 8).map(res => ({
      name: res.name,
      displayName: res.displayName,
      lat: res.lat,
      lng: res.lng,
      address: res.displayName
    }));
  } catch (err) {
    console.error('searchPlaces encountered an error:', err);
    return [];
  }
}

async function fetchNominatimQuery(query) {
  if (!query || query.trim().length === 0) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=jp&limit=6&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'ja,en;q=0.8',
        'User-Agent': 'BlankMapStudio/1.0'
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn(`Fetch failed for query "${query}":`, err);
    return [];
  }
}

// Clean and prettify Japanese address display
function formatCleanAddress(displayName, facilityName) {
  if (!displayName) return '';
  const parts = displayName.split(',').map(p => p.trim());
  const filteredParts = parts.filter(p => !/^\d{3}-\d{4}$/.test(p) && p !== facilityName);
  return filteredParts.slice(0, 4).join(', ') || displayName;
}

export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'ja,en;q=0.8',
        'User-Agent': 'BlankMapStudio/1.0'
      }
    });
    if (!res.ok) return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
    const data = await res.json();

    const addr = data.address;
    if (addr) {
      const state = addr.province || addr.state || '';
      const city = addr.city || addr.ward || addr.town || addr.village || addr.county || '';
      const suburb = addr.suburb || addr.quarter || addr.neighbourhood || '';
      const road = addr.road || '';
      const full = [state, city, suburb, road].filter(Boolean).join('');
      return full || data.display_name;
    }
    return data.display_name || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
}
