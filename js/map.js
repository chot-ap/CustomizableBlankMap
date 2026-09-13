/**
 * map.js
 * Leaflet map management, tile layers, markers, route polylines
 */

import { store } from './store.js';

// Base tile layers
const TILE_LAYERS = {
  'gsi-blank': {
    name: '国土地理院 白地図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
    maxZoom: 18,
    minZoom: 4
  },
  'carto-positron': {
    name: 'CartoDB ライト白地図',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    minZoom: 3
  },
  'gsi-pale': {
    name: '国土地理院 淡色地図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
    maxZoom: 18,
    minZoom: 4
  },
  'osm-standard': {
    name: '標準地図 (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    minZoom: 3
  }
};

class MapManager {
  constructor() {
    this.map = null;
    this.currentTileLayer = null;
    this.markersGroup = null;
    this.routeGroup = null;
    this.originMarker = null;
    this.clickMode = null; // null | 'add-spot' | 'pick-origin' | 'pick-dest'
    this.onMapClickCallback = null;
  }

  init(mapElementId = 'map') {
    // Initial center on Japan
    this.map = L.map(mapElementId, {
      center: [36.5, 137.5],
      zoom: 6,
      zoomControl: true
    });

    // Layer groups
    this.markersGroup = L.layerGroup().addTo(this.map);
    this.routeGroup = L.layerGroup().addTo(this.map);

    // Initial tile layer (Default to GSI Blank Map)
    this.setTileLayer('gsi-blank');

    // Click handler on map
    this.map.on('click', (e) => {
      if (this.onMapClickCallback) {
        this.onMapClickCallback(e.latlng, this.clickMode);
      }
    });

    // Subscribe to store changes to re-render
    store.subscribe((event) => {
      if (event === 'change' || event === 'filter') {
        this.renderSpots();
      }
      if (event === 'origin') {
        this.renderOrigin();
      }
      if (event === 'route') {
        this.renderRoute();
      }
    });

    this.renderSpots();
    this.renderOrigin();
  }

  setTileLayer(layerKey) {
    const config = TILE_LAYERS[layerKey] || TILE_LAYERS['gsi-blank'];
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }
    this.currentTileLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom || 18,
      minZoom: config.minZoom || 3,
      subdomains: config.subdomains || 'abc'
    }).addTo(this.map);
  }

  setClickMode(mode, callback) {
    this.clickMode = mode;
    this.onMapClickCallback = callback;
    const mapEl = document.getElementById('map');
    if (mode) {
      mapEl.style.cursor = 'crosshair';
    } else {
      mapEl.style.cursor = '';
    }
  }

  resetView() {
    this.map.flyTo([36.5, 137.5], 6, { duration: 1.2 });
  }

  flyToLocation(lat, lng, zoom = 13) {
    this.map.flyTo([lat, lng], zoom, { duration: 1 });
  }

  // Render Spots Markers
  renderSpots() {
    this.markersGroup.clearLayers();
    const spots = store.getFilteredSpots();

    spots.forEach(spot => {
      const category = store.getCategoryById(spot.categoryId) || {
        name: '未分類',
        icon: '📍',
        color: '#3b82f6'
      };

      const iconHtml = `
        <div class="marker-pin" style="--marker-color: ${category.color};">
          <span class="marker-inner-icon">${category.icon}</span>
        </div>
        <div class="marker-status-badge ${spot.status}">
          <i class="fa-solid ${spot.status === 'visited' ? 'fa-check' : 'fa-star'}"></i>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: iconHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
        popupAnchor: [0, -36]
      });

      const marker = L.marker([spot.lat, spot.lng], { icon: customIcon });

      // Create popup content
      const statusLabel = spot.status === 'visited'
        ? '<span class="badge-tag visited"><i class="fa-solid fa-check"></i> 訪問済</span>'
        : '<span class="badge-tag wishlist"><i class="fa-solid fa-star"></i> 行きたい</span>';

      const stars = '⭐'.repeat(spot.rating || 3);

      const popupHtml = `
        <div class="popup-container">
          <div class="popup-header">
            <div>
              <span class="popup-category-badge" style="background-color: ${category.color};">
                ${category.icon} ${category.name}
              </span>
              <div class="popup-title">${escapeHtml(spot.name)}</div>
            </div>
            ${statusLabel}
          </div>
          <div class="popup-body">
            <div class="popup-meta">
              <span>${stars}</span>
              ${spot.date ? `<span>• ${escapeHtml(spot.date)}</span>` : ''}
            </div>
            ${spot.address ? `<div class="popup-meta"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(spot.address)}</div>` : ''}
            ${spot.memo ? `<div class="popup-memo">${escapeHtml(spot.memo)}</div>` : ''}
          </div>
          <div class="popup-footer">
            <button class="popup-btn" data-action="set-origin" data-id="${spot.id}">
              <i class="fa-solid fa-circle-dot"></i> 出発地に設定
            </button>
            <button class="popup-btn primary" data-action="set-destination" data-id="${spot.id}">
              <i class="fa-solid fa-route"></i> ここへ行く
            </button>
            <button class="popup-btn" data-action="edit-spot" data-id="${spot.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 320 });
      marker.spotId = spot.id;

      this.markersGroup.addLayer(marker);
    });
  }

  // Render Origin Marker
  renderOrigin() {
    if (this.originMarker) {
      this.map.removeLayer(this.originMarker);
      this.originMarker = null;
    }

    const origin = store.getOriginPoint();
    if (!origin) return;

    const iconHtml = `<div class="origin-marker-pin"><i class="fa-solid fa-street-view"></i></div>`;
    const icon = L.divIcon({
      className: 'origin-marker',
      html: iconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });

    this.originMarker = L.marker([origin.lat, origin.lng], { icon })
      .addTo(this.map)
      .bindPopup(`<b>出発地点</b><br>${escapeHtml(origin.name || '指定された出発地')}`);
  }

  // Render Route Line
  renderRoute() {
    this.routeGroup.clearLayers();
    const route = store.getCurrentRoute();
    if (!route || !route.coordinates || route.coordinates.length === 0) return;

    // Casing line (dark shadow border)
    const casing = L.polyline(route.coordinates, {
      className: 'route-polyline-casing'
    });

    // Main vibrant line
    const mainLine = L.polyline(route.coordinates, {
      className: 'route-polyline-main'
    });

    this.routeGroup.addLayer(casing);
    this.routeGroup.addLayer(mainLine);

    // Zoom map to show entire route with padding
    this.map.fitBounds(mainLine.getBounds(), {
      padding: [60, 60],
      maxZoom: 14
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const mapManager = new MapManager();
