/**
 * routing.js
 * Route calculation and travel time via OSRM (Open Source Routing Machine) API
 */

export async function calculateRoute(startPoint, destPoint, mode = 'driving') {
  // mode: 'driving' | 'walking' | 'cycling'
  // OSRM public server supports driving primarily, with foot/bike depending on server.
  // We request driving and adjust duration if walking/cycling as fallback or use dedicated profile
  
  const osrmProfile = mode === 'walking' ? 'walking' : (mode === 'cycling' ? 'cycling' : 'driving');
  
  const startLng = startPoint.lng;
  const startLat = startPoint.lat;
  const destLng = destPoint.lng;
  const destLat = destPoint.lat;

  // Primary OSRM URL
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Route service returned error ' + res.status);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found between selected points');
    }

    const route = data.routes[0];
    let durationSec = route.duration;
    const distanceMeters = route.distance;

    // Adjust duration according to mode if using driving baseline
    if (mode === 'walking') {
      // average walking speed ~ 4.5 km/h
      durationSec = (distanceMeters / 1000) / 4.5 * 3600;
    } else if (mode === 'cycling') {
      // average cycling speed ~ 15 km/h
      durationSec = (distanceMeters / 1000) / 15 * 3600;
    }

    // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
    const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    return {
      success: true,
      distanceMeters,
      durationSec,
      distanceFormatted: formatDistance(distanceMeters),
      durationFormatted: formatDuration(durationSec),
      coordinates,
      mode,
      summary: route.legs?.[0]?.summary || '主要幹線道路経由'
    };
  } catch (error) {
    console.warn('OSRM routing failed, calculating geodesic estimate:', error);
    // Fallback: Calculate direct Great Circle distance and estimate duration
    const distMeters = calculateHaversineDistance(startLat, startLng, destLat, destLng);
    // Add 25% curve factor for realistic road distance
    const roadDistMeters = distMeters * 1.28;

    let speedKmh = 40; // Driving average
    if (mode === 'walking') speedKmh = 4.5;
    if (mode === 'cycling') speedKmh = 15;

    const durationSec = ((roadDistMeters / 1000) / speedKmh) * 3600;

    return {
      success: true,
      distanceMeters: roadDistMeters,
      durationSec,
      distanceFormatted: `約 ${formatDistance(roadDistMeters)} (直線推計)`,
      durationFormatted: `約 ${formatDuration(durationSec)}`,
      coordinates: [
        [startLat, startLng],
        [destLat, destLng]
      ],
      mode,
      summary: '直線概算ルート（オフライン推計）'
    };
  }
}

// Helpers
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${Math.max(1, mins)} 分`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return `${hours} 時間`;
  }
  return `${hours} 時間 ${remainingMins} 分`;
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
