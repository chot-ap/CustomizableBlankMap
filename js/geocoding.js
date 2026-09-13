/**
 * geocoding.js
 * High-performance, CORS-friendly Geocoding using Photon API (OpenStreetMap data)
 * with multi-word search, fuzzy ranking, and Nominatim fallback.
 */

// Japanese Kana & Width normalization helper
function normalizeJapanese(str) {
  if (!str) return '';
  return String(str)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/**
 * Perform a robust multi-word search
 * Fully CORS compatible for Android PWA, mobile browsers & GitHub Pages
 */
export async function searchPlaces(rawQuery) {
  try {
    if (!rawQuery || rawQuery.trim().length < 2) return [];

    const cleanQuery = rawQuery.replace(/　/g, ' ').trim();
    const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 0);

    if (tokens.length === 0) return [];

    // Step 1: Query Photon API (CORS enabled: Access-Control-Allow-Origin: *)
    let features = await fetchPhotonSmart(cleanQuery, tokens);

    // If Photon returned few or no results, fallback to Nominatim (no forbidden headers)
    if (!features || features.length === 0) {
      features = await fetchNominatimFallback(cleanQuery, tokens);
    }

    if (!features || features.length === 0) return [];

    // Step 2: Score and rank results
    const normCleanQuery = normalizeJapanese(cleanQuery);
    const normTokens = tokens.map(t => normalizeJapanese(t));

    const scoredItems = features.map(item => {
      const name = item.name || '';
      const address = item.address || item.displayName || '';

      const normName = normalizeJapanese(name);
      const normAddr = normalizeJapanese(address);

      let score = 0;
      let matchedTokens = 0;

      // Exact phrase match
      if (normName.includes(normCleanQuery)) score += 120;
      else if (normAddr.includes(normCleanQuery)) score += 70;

      // Token matches
      normTokens.forEach(token => {
        let matched = false;
        if (normName.includes(token)) {
          score += 45;
          matched = true;
        }
        if (normAddr.includes(token)) {
          score += 25;
          matched = true;
        }
        if (matched) matchedTokens++;
      });

      // Bonus if all tokens match
      if (tokens.length > 1 && matchedTokens === tokens.length) {
        score += 90;
      }

      return {
        name: name || 'スポット名未設定',
        displayName: address,
        address: address,
        lat: item.lat,
        lng: item.lng,
        score
      };
    });

    // Step 3: Sort by score and take top 8
    const sorted = scoredItems
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const finalResults = sorted.length > 0 ? sorted : scoredItems;

    return finalResults.slice(0, 8);
  } catch (err) {
    console.error('searchPlaces fatal error:', err);
    return [];
  }
}

/**
 * Fetch from Photon (Komoot) with multi-token smart handling
 */
async function fetchPhotonSmart(cleanQuery, tokens) {
  try {
    const candidateQueries = [cleanQuery];
    if (tokens.length > 1) {
      candidateQueries.push(tokens.join(''));
      // Add longest specific token
      const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
      if (sortedTokens[0].length >= 2 && sortedTokens[0] !== cleanQuery) {
        candidateQueries.push(sortedTokens[0]);
      }
    }

    const allFeatures = [];
    const seenIds = new Set();

    for (const q of candidateQueries) {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=default&limit=6`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      if (data && Array.isArray(data.features)) {
        data.features.forEach(f => {
          const props = f.properties || {};
          const geom = f.geometry || {};
          const coords = geom.coordinates || [];

          if (coords.length >= 2) {
            const lng = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);
            const osmId = props.osm_id || `${lat.toFixed(4)}-${lng.toFixed(4)}`;

            if (!seenIds.has(osmId)) {
              seenIds.add(osmId);

              // Build clean Japanese address
              const parts = [
                props.country === '日本' || props.countrycode === 'JP' ? '' : props.country,
                props.state,
                props.county,
                props.city || props.district || props.locality,
                props.street,
                props.housenumber
              ].filter(Boolean);

              allFeatures.push({
                name: props.name || props.street || parts.join(' ') || '名称未設定',
                address: parts.join(' ') || props.name || '',
                displayName: parts.join(' ') || props.name || '',
                lat,
                lng
              });
            }
          }
        });
      }

      // If we already found good matches, avoid extra network calls
      if (allFeatures.length >= 4) break;
    }

    return allFeatures;
  } catch (e) {
    console.warn('Photon fetch error:', e);
    return [];
  }
}

/**
 * Fallback to Nominatim (without forbidden User-Agent header)
 */
async function fetchNominatimFallback(query, tokens) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=jp&limit=6&addressdetails=1`;
    const res = await fetch(url); // Browser automatically sends standard headers
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map(item => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const name = item.name || (item.display_name ? item.display_name.split(',')[0] : '');
      return {
        name,
        address: item.display_name,
        displayName: item.display_name,
        lat,
        lng
      };
    });
  } catch (e) {
    console.warn('Nominatim fallback error:', e);
    return [];
  }
}

/**
 * Reverse Geocode (Coordinates -> Address)
 */
export async function reverseGeocode(lat, lng) {
  try {
    // Try Photon reverse first
    const photonUrl = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.features?.[0]?.properties) {
        const p = data.features[0].properties;
        const full = [p.state, p.city || p.locality, p.street, p.name].filter(Boolean).join(' ');
        if (full) return full;
      }
    }
  } catch (e) {}

  // Fallback to coordinates
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}
