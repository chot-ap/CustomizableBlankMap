/**
 * ui.js
 * User interface interactions, sidebar lists, modals, toasts, route triggers
 */

import { store } from './store.js';
import { mapManager } from './map.js';
import { searchPlaces, reverseGeocode } from './geocoding.js';
import { calculateRoute } from './routing.js';

class UIManager {
  constructor() {
    this.selectedDestPoint = null; // { lat, lng, name }
    this.currentTransportMode = 'driving';
    this.searchTimeout = null;
  }

  init() {
    this.bindEvents();
    this.renderCategoryPills();
    this.renderSpotsList();
    this.renderCategoriesManagementList();
    this.updateRouteDestSelect();

    // Subscribe to store updates
    store.subscribe((event) => {
      this.renderCategoryPills();
      this.renderSpotsList();
      this.renderCategoriesManagementList();
      this.updateRouteDestSelect();
    });
  }

  bindEvents() {
    // PWA Install Prompt handling for Android & Desktop Chrome
    this.deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById('btn-install-pwa');
      const modalInstallBtn = document.getElementById('btn-modal-install-pwa');
      if (installBtn) installBtn.style.display = 'inline-flex';
      if (modalInstallBtn) modalInstallBtn.style.display = 'inline-flex';
    });

    const handleInstallClick = async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const choiceResult = await this.deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          this.showToast('アプリのインストールを開始しました');
        }
        this.deferredPrompt = null;
      } else {
        alert('ブラウザメニュー（右上の3点アイコンなど）から「ホーム画面に追加」または「アプリをインストール」を選択してください。');
      }
    };

    document.getElementById('btn-install-pwa')?.addEventListener('click', handleInstallClick);
    document.getElementById('btn-modal-install-pwa')?.addEventListener('click', handleInstallClick);

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      const installBtn = document.getElementById('btn-install-pwa');
      const modalInstallBtn = document.getElementById('btn-modal-install-pwa');
      if (installBtn) installBtn.style.display = 'none';
      if (modalInstallBtn) modalInstallBtn.style.display = 'none';
      this.showToast('白地図手帳がインストールされました！');
    });

    // Sidebar toggle
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('app-sidebar');
    toggleBtn?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    // Map style selector
    const tileSelect = document.getElementById('select-tile-layer');
    tileSelect?.addEventListener('change', (e) => {
      mapManager.setTileLayer(e.target.value);
      this.showToast(`地図スタイルを「${tileSelect.options[tileSelect.selectedIndex].text}」に変更しました`);
    });

    // Sidebar tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId)?.classList.add('active');
      });
    });

    // Status filter buttons (All / Visited / Wishlist)
    document.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const status = btn.getAttribute('data-status-filter');
        store.setStatusFilter(status);
      });
    });

    // Header buttons
    document.getElementById('btn-open-route')?.addEventListener('click', () => {
      this.switchSidebarTab('tab-routes');
    });

    document.getElementById('btn-quick-add')?.addEventListener('click', () => {
      this.openSpotModal();
    });

    document.getElementById('btn-data-management')?.addEventListener('click', () => {
      this.openModal('modal-data');
    });

    // Modal Spot Search Events
    const modalSearchInput = document.getElementById('modal-spot-search-input');
    const modalSearchBtn = document.getElementById('btn-modal-spot-search');
    let modalSearchTimeout = null;

    modalSearchInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(modalSearchTimeout);
      if (val.length >= 2) {
        modalSearchTimeout = setTimeout(() => {
          this.executeModalSpotSearch(val);
        }, 350);
      } else {
        const resultsEl = document.getElementById('modal-spot-search-results');
        if (resultsEl) resultsEl.style.display = 'none';
      }
    });

    modalSearchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = modalSearchInput.value.trim();
        if (val) this.executeModalSpotSearch(val);
      }
    });

    modalSearchBtn?.addEventListener('click', () => {
      const val = modalSearchInput?.value.trim();
      if (val) this.executeModalSpotSearch(val);
    });

    // Button to pick on map from modal
    document.getElementById('btn-pick-spot-on-map-direct')?.addEventListener('click', () => {
      this.closeModal('modal-spot');
      this.startAddSpotMode();
    });

    // Floating controls
    document.getElementById('btn-locate-me')?.addEventListener('click', () => {
      this.handleLocateCurrentPosition();
    });

    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      mapManager.resetView();
    });

    document.getElementById('btn-export-map-image')?.addEventListener('click', () => {
      this.exportMapImage();
    });

    // Global search input
    const searchInput = document.getElementById('global-search-input');
    const searchClear = document.getElementById('global-search-clear');
    const searchDropdown = document.getElementById('search-results-dropdown');

    searchInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val.length > 0) {
        searchClear.style.display = 'block';
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
          this.executeGlobalSearch(val);
        }, 400);
      } else {
        searchClear.style.display = 'none';
        searchDropdown.style.display = 'none';
      }
    });

    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      searchDropdown.style.display = 'none';
    });

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = 'none';
      }
    });

    // Map Interaction Banner Cancel
    document.getElementById('btn-cancel-interaction')?.addEventListener('click', () => {
      this.endInteractionBanner();
    });

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // Spot Form submit
    document.getElementById('form-spot')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSpotFormSubmit();
    });

    // Delete Spot button
    document.getElementById('btn-delete-spot')?.addEventListener('click', () => {
      const id = document.getElementById('spot-id').value;
      if (id && confirm('このスポットを削除してもよろしいですか？')) {
        store.deleteSpot(id);
        this.closeModal('modal-spot');
        this.showToast('スポットを削除しました');
      }
    });

    // Category create button
    document.getElementById('btn-create-category')?.addEventListener('click', () => {
      this.openCategoryModal();
    });

    // Category form submit
    document.getElementById('form-category')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCategoryFormSubmit();
    });

    // Category color input sync
    const catColorInput = document.getElementById('category-color');
    const catColorLabel = document.getElementById('category-color-label');
    catColorInput?.addEventListener('input', (e) => {
      if (catColorLabel) catColorLabel.textContent = e.target.value;
    });

    // Route origin buttons
    document.getElementById('btn-set-origin-current')?.addEventListener('click', () => {
      this.handleSetOriginCurrentLocation();
    });

    document.getElementById('btn-pick-origin-map')?.addEventListener('click', () => {
      this.startPickOriginOnMap();
    });

    document.getElementById('btn-pick-dest-map')?.addEventListener('click', () => {
      this.startPickDestOnMap();
    });

    // Swap route points
    document.getElementById('btn-swap-route-points')?.addEventListener('click', () => {
      this.handleSwapRoutePoints();
    });

    // Transport mode buttons
    document.querySelectorAll('.transport-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.transport-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTransportMode = btn.getAttribute('data-mode');
        // Auto recalculate if points already exist
        const origin = store.getOriginPoint();
        if (origin && this.selectedDestPoint) {
          this.executeRouteCalculation();
        }
      });
    });

    // Calculate route button
    document.getElementById('btn-calculate-route')?.addEventListener('click', () => {
      this.executeRouteCalculation();
    });

    // Clear route button
    document.getElementById('btn-clear-route')?.addEventListener('click', () => {
      store.clearRoute();
      document.getElementById('route-result-card').style.display = 'none';
      this.showToast('ルート表示をクリアしました');
    });

    // Dest select dropdown change
    document.getElementById('route-dest-select')?.addEventListener('change', (e) => {
      const spotId = e.target.value;
      if (spotId) {
        const spot = store.getSpotById(spotId);
        if (spot) {
          this.selectedDestPoint = { lat: spot.lat, lng: spot.lng, name: spot.name };
        }
      } else {
        this.selectedDestPoint = null;
      }
    });

    // Data Management actions
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      store.exportJSON();
      this.showToast('バックアップデータをダウンロードしました');
    });

    document.getElementById('file-import-json')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const res = store.importJSON(ev.target.result);
          if (res.success) {
            this.closeModal('modal-data');
            this.showToast(`${res.count} 件のスポットを復元しました`);
          } else {
            alert(res.error);
          }
        };
        reader.readAsText(file);
      }
    });

    document.getElementById('btn-load-samples')?.addEventListener('click', () => {
      if (confirm('サンプルの温泉・宿・観光地データを再読み込みしますか？')) {
        store.resetToDefaults();
        this.closeModal('modal-data');
        this.showToast('サンプルデータを読み込みました');
        mapManager.resetView();
      }
    });

    document.getElementById('btn-reset-all-data')?.addEventListener('click', () => {
      if (confirm('すべての登録スポットを削除しますか？この操作は元に戻せません。')) {
        store.clearAllData();
        this.closeModal('modal-data');
        this.showToast('すべてのデータを初期化しました');
      }
    });

    // Handle popup button clicks (delegated)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const spotId = target.getAttribute('data-id');
      const spot = store.getSpotById(spotId);

      if (!spot) return;

      if (action === 'set-origin') {
        store.setOriginPoint({ lat: spot.lat, lng: spot.lng, name: spot.name });
        document.getElementById('route-origin-input').value = spot.name;
        this.switchSidebarTab('tab-routes');
        this.showToast(`「${spot.name}」を出発地に設定しました`);
      } else if (action === 'set-destination') {
        this.selectedDestPoint = { lat: spot.lat, lng: spot.lng, name: spot.name };
        const destSelect = document.getElementById('route-dest-select');
        if (destSelect) destSelect.value = spot.id;
        this.switchSidebarTab('tab-routes');
        this.showToast(`「${spot.name}」を目的地に設定しました`);

        // If origin already set, auto calculate route
        if (store.getOriginPoint()) {
          this.executeRouteCalculation();
        } else {
          this.showToast('出発地を設定して「ルートを計算」を押してください');
        }
      } else if (action === 'edit-spot') {
        this.openSpotModal(spot);
      }
    });
  }

  // Render Category Pills on top of sidebar
  renderCategoryPills() {
    const container = document.getElementById('category-pills-list');
    if (!container) return;

    const categories = store.getCategories();
    const activeFilter = store.activeCategoryFilter;

    let html = `
      <button class="cat-pill ${activeFilter === 'all' ? 'active' : ''}" data-cat-id="all">
        <span>すべて</span>
      </button>
    `;

    categories.forEach(cat => {
      const isActive = activeFilter === cat.id;
      html += `
        <button class="cat-pill ${isActive ? 'active' : ''}" data-cat-id="${cat.id}">
          <span class="cat-pill-dot" style="background-color: ${cat.color};"></span>
          <span>${cat.icon} ${escapeHtml(cat.name)}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.getAttribute('data-cat-id');
        store.setCategoryFilter(catId);
      });
    });
  }

  // Render Spots List in tab 1
  renderSpotsList() {
    const listEl = document.getElementById('spots-list');
    const countEl = document.getElementById('spots-count');
    if (!listEl) return;

    const spots = store.getFilteredSpots();
    if (countEl) countEl.textContent = spots.length;

    if (spots.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-map-location-dot"></i>
          <p>該当するスポットがありません</p>
          <button id="btn-empty-add" class="btn btn-sm btn-primary">
            <i class="fa-solid fa-plus"></i> 地図にスポットを追加
          </button>
        </div>
      `;
      document.getElementById('btn-empty-add')?.addEventListener('click', () => {
        this.openSpotModal();
      });
      return;
    }

    let html = '';
    spots.forEach(spot => {
      const cat = store.getCategoryById(spot.categoryId) || { name: 'その他', icon: '📍', color: '#3b82f6' };
      const isVisited = spot.status === 'visited';
      const statusBadge = isVisited
        ? `<span class="badge-tag visited"><i class="fa-solid fa-check"></i> 行った</span>`
        : `<span class="badge-tag wishlist"><i class="fa-solid fa-star"></i> 行きたい</span>`;
      const stars = '⭐'.repeat(spot.rating || 3);

      html += `
        <div class="spot-card" data-spot-id="${spot.id}" style="--spot-color: ${cat.color};">
          <div class="spot-card-header">
            <div class="spot-card-title">${cat.icon} ${escapeHtml(spot.name)}</div>
            <div class="spot-card-badges">${statusBadge}</div>
          </div>
          <div class="spot-card-meta">
            <span>${stars}</span>
            ${spot.date ? `<span>• ${escapeHtml(spot.date)}</span>` : ''}
            ${spot.address ? `<span>• ${escapeHtml(spot.address)}</span>` : ''}
          </div>
          ${spot.memo ? `<div class="spot-card-memo">${escapeHtml(spot.memo)}</div>` : ''}
          <div class="spot-card-actions">
            <button class="icon-btn-sm" data-card-action="navigate" data-id="${spot.id}" title="ここへのルートを検索">
              <i class="fa-solid fa-route"></i>
            </button>
            <button class="icon-btn-sm" data-card-action="edit" data-id="${spot.id}" title="編集">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="icon-btn-sm" data-card-action="delete" data-id="${spot.id}" title="削除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    // Card click events
    listEl.querySelectorAll('.spot-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.spot-card-actions')) return;
        const spotId = card.getAttribute('data-spot-id');
        const spot = store.getSpotById(spotId);
        if (spot) {
          mapManager.flyToLocation(spot.lat, spot.lng, 14);
        }
      });
    });

    // Card action buttons
    listEl.querySelectorAll('[data-card-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-card-action');
        const spotId = btn.getAttribute('data-id');
        const spot = store.getSpotById(spotId);
        if (!spot) return;

        if (action === 'navigate') {
          this.selectedDestPoint = { lat: spot.lat, lng: spot.lng, name: spot.name };
          const destSelect = document.getElementById('route-dest-select');
          if (destSelect) destSelect.value = spot.id;
          this.switchSidebarTab('tab-routes');
          if (store.getOriginPoint()) {
            this.executeRouteCalculation();
          } else {
            this.showToast('出発地を設定してください');
          }
        } else if (action === 'edit') {
          this.openSpotModal(spot);
        } else if (action === 'delete') {
          if (confirm(`「${spot.name}」を削除してもよろしいですか？`)) {
            store.deleteSpot(spot.id);
            this.showToast('スポットを削除しました');
          }
        }
      });
    });
  }

  // Render Categories Management in Tab 2
  renderCategoriesManagementList() {
    const listEl = document.getElementById('categories-management-list');
    if (!listEl) return;

    const categories = store.getCategories();
    const spots = store.getSpots();

    let html = '';
    categories.forEach(cat => {
      const spotCount = spots.filter(s => s.categoryId === cat.id).length;
      html += `
        <div class="category-mgmt-item">
          <div class="cat-item-info">
            <div class="cat-icon-preview" style="background-color: ${cat.color};">
              ${cat.icon}
            </div>
            <div>
              <div class="cat-item-name">${escapeHtml(cat.name)}</div>
              <div class="cat-item-count">${spotCount} 件登録</div>
            </div>
          </div>
          <div class="cat-item-actions">
            <button class="icon-btn-sm" data-edit-category="${cat.id}" title="編集">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-edit-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-category');
        const cat = store.getCategoryById(id);
        if (cat) this.openCategoryModal(cat);
      });
    });
  }

  // Update Route Destination Dropdown
  updateRouteDestSelect() {
    const select = document.getElementById('route-dest-select');
    if (!select) return;

    const spots = store.getSpots();
    let html = `<option value="">登録スポットから目的地を選択...</option>`;
    spots.forEach(spot => {
      const cat = store.getCategoryById(spot.categoryId);
      html += `<option value="${spot.id}">${cat ? cat.icon + ' ' : ''}${escapeHtml(spot.name)}</option>`;
    });

    select.innerHTML = html;
    if (this.selectedDestPoint) {
      // Find spot id if matches coordinates
      const matched = spots.find(s => Math.abs(s.lat - this.selectedDestPoint.lat) < 0.0001 && Math.abs(s.lng - this.selectedDestPoint.lng) < 0.0001);
      if (matched) select.value = matched.id;
    }
  }

  // Mode: Add Spot by clicking map
  startAddSpotMode() {
    this.showInteractionBanner('地図上の登録したい場所をクリックしてください', () => {
      mapManager.setClickMode(null, null);
    });

    mapManager.setClickMode('add-spot', async (latlng) => {
      this.endInteractionBanner();
      const addr = await reverseGeocode(latlng.lat, latlng.lng);
      this.openSpotModal({
        lat: latlng.lat,
        lng: latlng.lng,
        address: addr,
        name: addr ? addr.split(/[都道府県市区町村]/).pop() || '' : ''
      });
    });
  }

  // Mode: Pick Origin on map
  startPickOriginOnMap() {
    this.showInteractionBanner('地図上で【出発地点】をクリックしてください', () => {
      mapManager.setClickMode(null, null);
    });

    mapManager.setClickMode('pick-origin', async (latlng) => {
      this.endInteractionBanner();
      const addr = await reverseGeocode(latlng.lat, latlng.lng);
      const name = addr || `緯度:${latlng.lat.toFixed(3)}, 経度:${latlng.lng.toFixed(3)}`;
      store.setOriginPoint({ lat: latlng.lat, lng: latlng.lng, name });
      document.getElementById('route-origin-input').value = name;
      this.showToast(`出発地を設定しました: ${name}`);
      this.switchSidebarTab('tab-routes');
    });
  }

  // Mode: Pick Destination on map
  startPickDestOnMap() {
    this.showInteractionBanner('地図上で【目的地】をクリックしてください', () => {
      mapManager.setClickMode(null, null);
    });

    mapManager.setClickMode('pick-dest', async (latlng) => {
      this.endInteractionBanner();
      const addr = await reverseGeocode(latlng.lat, latlng.lng);
      const name = addr || `緯度:${latlng.lat.toFixed(3)}, 経度:${latlng.lng.toFixed(3)}`;
      this.selectedDestPoint = { lat: latlng.lat, lng: latlng.lng, name };
      
      const select = document.getElementById('route-dest-select');
      if (select) {
        // Add temporary option for custom location
        const opt = document.createElement('option');
        opt.value = 'custom-point';
        opt.textContent = `📍 ${name}`;
        opt.selected = true;
        select.appendChild(opt);
      }

      this.showToast(`目的地を設定しました: ${name}`);
      this.switchSidebarTab('tab-routes');
    });
  }

  showInteractionBanner(text, onCancel) {
    const banner = document.getElementById('map-interaction-banner');
    const textEl = document.getElementById('map-interaction-text');
    if (banner && textEl) {
      textEl.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> ${text}`;
      banner.style.display = 'flex';
      this.onBannerCancel = onCancel;
    }
  }

  endInteractionBanner() {
    const banner = document.getElementById('map-interaction-banner');
    if (banner) banner.style.display = 'none';
    mapManager.setClickMode(null, null);
  }

  // Current position geolocation
  handleLocateCurrentPosition() {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報サービスに対応していません。');
      return;
    }
    this.showToast('現在地を取得中...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapManager.flyToLocation(latitude, longitude, 13);
        this.showToast('現在地を表示しました');
      },
      (err) => {
        console.error('Geolocation error:', err);
        alert('現在地を取得できませんでした。ブラウザの位置情報パーミッションをご確認ください。');
      },
      { timeout: 8000 }
    );
  }

  handleSetOriginCurrentLocation() {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報に対応していません。');
      return;
    }
    this.showToast('現在地を出発地に設定中...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const addr = await reverseGeocode(latitude, longitude);
        const name = addr ? `現在地 (${addr})` : '現在地';
        store.setOriginPoint({ lat: latitude, lng: longitude, name });
        document.getElementById('route-origin-input').value = name;
        mapManager.flyToLocation(latitude, longitude, 12);
        this.showToast('現在地を出発地点に設定しました');
      },
      (err) => {
        alert('現在地を取得できませんでした: ' + err.message);
      }
    );
  }

  handleSwapRoutePoints() {
    const origin = store.getOriginPoint();
    const dest = this.selectedDestPoint;

    if (!origin || !dest) {
      this.showToast('出発地と目的地の両方を設定してください');
      return;
    }

    // Swap
    store.setOriginPoint(dest);
    this.selectedDestPoint = origin;

    document.getElementById('route-origin-input').value = dest.name || '';
    const destSelect = document.getElementById('route-dest-select');
    if (destSelect) {
      // Find spot matching new dest
      const matched = store.getSpots().find(s => Math.abs(s.lat - origin.lat) < 0.0001 && Math.abs(s.lng - origin.lng) < 0.0001);
      if (matched) {
        destSelect.value = matched.id;
      } else {
        const opt = document.createElement('option');
        opt.value = 'custom-point';
        opt.textContent = `📍 ${origin.name}`;
        opt.selected = true;
        destSelect.appendChild(opt);
      }
    }

    this.showToast('出発地と目的地を入れ替えました');
    this.executeRouteCalculation();
  }

  // Calculate route and display results
  async executeRouteCalculation() {
    const origin = store.getOriginPoint();
    const dest = this.selectedDestPoint;

    if (!origin) {
      alert('出発地点を設定してください（現在地、地図クリック、またはスポットから指定できます）。');
      return;
    }
    if (!dest) {
      alert('目的地を選択してください。');
      return;
    }

    const calcBtn = document.getElementById('btn-calculate-route');
    if (calcBtn) {
      calcBtn.disabled = true;
      calcBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 計算中...';
    }

    this.showToast('ルートと所要時間を計算中...');

    try {
      const result = await calculateRoute(origin, dest, this.currentTransportMode);
      if (result.success) {
        store.setCurrentRoute(result);

        // Display results in card
        const card = document.getElementById('route-result-card');
        const durEl = document.getElementById('route-duration');
        const distEl = document.getElementById('route-distance');
        const summaryEl = document.getElementById('route-summary-desc');

        if (durEl) durEl.textContent = result.durationFormatted;
        if (distEl) distEl.textContent = result.distanceFormatted;
        if (summaryEl) {
          const modeName = this.currentTransportMode === 'driving' ? '車' : (this.currentTransportMode === 'walking' ? '徒歩' : '自転車');
          summaryEl.innerHTML = `
            <strong>${modeName}での移動</strong>: ${result.summary}<br>
            出発: <em>${escapeHtml(origin.name)}</em><br>
            到着: <em>${escapeHtml(dest.name)}</em>
          `;
        }

        if (card) card.style.display = 'flex';
        this.showToast(`検索完了: 約 ${result.durationFormatted} (${result.distanceFormatted})`);
      }
    } catch (error) {
      alert('ルートの計算に失敗しました: ' + error.message);
    } finally {
      if (calcBtn) {
        calcBtn.disabled = false;
        calcBtn.innerHTML = '<i class="fa-solid fa-route"></i> ルートと所要時間を計算';
      }
    }
  }

  // Global Search
  async executeGlobalSearch(query) {
    const dropdown = document.getElementById('search-results-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> 検索中...</div>';
    dropdown.style.display = 'block';

    try {
      const results = await searchPlaces(query);

      if (!results || results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #94a3b8;">見つかりませんでした</div>';
        return;
      }

      let html = '';
      results.forEach((item, idx) => {
        html += `
          <div class="search-result-item" data-search-idx="${idx}">
            <i class="fa-solid fa-location-dot"></i>
            <div>
              <div class="search-result-name">${escapeHtml(item.name)}</div>
              <div class="search-result-addr">${escapeHtml(item.displayName)}</div>
            </div>
          </div>
        `;
      });

      dropdown.innerHTML = html;

      dropdown.querySelectorAll('.search-result-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const idx = parseInt(itemEl.getAttribute('data-search-idx'), 10);
          const item = results[idx];
          dropdown.style.display = 'none';

          // Fly to location and offer to add spot
          mapManager.flyToLocation(item.lat, item.lng, 14);
          this.openSpotModal({
            name: item.name,
            address: item.displayName,
            lat: item.lat,
            lng: item.lng
          });
        });
      });
    } catch (err) {
      console.error('Global search error:', err);
      dropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">検索エラーが発生しました</div>';
    }
  }

  // Modal Spot Search (inside Spot Add/Edit Dialog)
  async executeModalSpotSearch(query) {
    const resultsContainer = document.getElementById('modal-spot-search-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #64748b; font-size: 0.8125rem;"><i class="fa-solid fa-spinner fa-spin"></i> 検索中...</div>';
    resultsContainer.style.display = 'block';

    try {
      const results = await searchPlaces(query);

      if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 0.8125rem;">候補が見つかりませんでした</div>';
        return;
      }

      let html = '';
      results.forEach((item, idx) => {
        html += `
          <div class="modal-search-result-item" data-modal-search-idx="${idx}">
            <i class="fa-solid fa-location-dot"></i>
            <div>
              <div class="modal-search-result-name">${escapeHtml(item.name)}</div>
              <div class="modal-search-result-addr">${escapeHtml(item.displayName)}</div>
            </div>
          </div>
        `;
      });

      resultsContainer.innerHTML = html;
    } catch (e) {
      console.error('Modal search error:', e);
      resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #ef4444; font-size: 0.8125rem;">検索エラーが発生しました</div>';
      return;
    }

    resultsContainer.querySelectorAll('.modal-search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-modal-search-idx'), 10);
        const item = results[idx];

        // Fill spot form with selected place data
        document.getElementById('spot-name').value = item.name;
        document.getElementById('spot-address').value = item.displayName;
        document.getElementById('spot-lat').value = item.lat;
        document.getElementById('spot-lng').value = item.lng;

        // Hide search results
        resultsContainer.style.display = 'none';
        const searchInput = document.getElementById('modal-spot-search-input');
        if (searchInput) searchInput.value = item.name;

        // Fly map to selected location
        mapManager.flyToLocation(item.lat, item.lng, 14);

        this.showToast(`「${item.name}」を選択しました`);
      });
    });
  }

  // Spot Modal
  openSpotModal(spot = null) {
    const modal = document.getElementById('modal-spot');
    const titleEl = document.getElementById('modal-spot-title');
    const delBtn = document.getElementById('btn-delete-spot');
    const categorySelect = document.getElementById('spot-category');
    const searchSection = document.getElementById('spot-modal-search-box');
    const searchInput = document.getElementById('modal-spot-search-input');
    const searchResults = document.getElementById('modal-spot-search-results');

    // Reset search box inside modal
    if (searchInput) searchInput.value = '';
    if (searchResults) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
    }

    // Populate categories in select
    const categories = store.getCategories();
    let catOptions = '';
    categories.forEach(cat => {
      catOptions += `<option value="${cat.id}">${cat.icon} ${escapeHtml(cat.name)}</option>`;
    });
    categorySelect.innerHTML = catOptions;

    // Reset or populate fields
    document.getElementById('spot-id').value = spot?.id || '';
    document.getElementById('spot-lat').value = spot?.lat !== undefined ? spot.lat : '';
    document.getElementById('spot-lng').value = spot?.lng !== undefined ? spot.lng : '';
    document.getElementById('spot-name').value = spot?.name || '';
    document.getElementById('spot-address').value = spot?.address || '';
    document.getElementById('spot-date').value = spot?.date || new Date().toISOString().slice(0, 10);
    document.getElementById('spot-rating').value = spot?.rating || '4';
    document.getElementById('spot-memo').value = spot?.memo || '';
    document.getElementById('spot-image-url').value = spot?.imageUrl || '';

    if (spot?.categoryId) {
      categorySelect.value = spot.categoryId;
    }

    const statusRadio = document.querySelector(`input[name="spot-status"][value="${spot?.status || 'visited'}"]`);
    if (statusRadio) statusRadio.checked = true;

    if (spot?.id) {
      titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> スポットを編集';
      delBtn.style.display = 'inline-flex';
      // Hide search bar when simply editing an existing spot (can still change name)
      if (searchSection) searchSection.style.display = 'none';
    } else {
      titleEl.innerHTML = '<i class="fa-solid fa-location-dot"></i> 新しいスポットを登録';
      delBtn.style.display = 'none';
      if (searchSection) searchSection.style.display = 'flex';
    }

    this.openModal('modal-spot');

    // Auto-focus search input if adding new spot
    if (!spot?.id && searchInput) {
      setTimeout(() => searchInput.focus(), 150);
    }
  }


  handleSpotFormSubmit() {
    const id = document.getElementById('spot-id').value;
    const lat = document.getElementById('spot-lat').value;
    const lng = document.getElementById('spot-lng').value;
    const name = document.getElementById('spot-name').value;
    const categoryId = document.getElementById('spot-category').value;
    const status = document.querySelector('input[name="spot-status"]:checked')?.value || 'visited';
    const date = document.getElementById('spot-date').value;
    const rating = document.getElementById('spot-rating').value;
    const address = document.getElementById('spot-address').value;
    const memo = document.getElementById('spot-memo').value;
    const imageUrl = document.getElementById('spot-image-url').value;

    if (!name.trim()) {
      alert('スポット名を入力してください。');
      return;
    }

    const spotData = {
      name,
      categoryId,
      status,
      lat: lat ? parseFloat(lat) : 35.6812, // Default Tokyo if not set
      lng: lng ? parseFloat(lng) : 139.7671,
      date,
      rating: parseInt(rating, 10),
      address,
      memo,
      imageUrl
    };

    if (id) {
      store.updateSpot(id, spotData);
      this.showToast(`「${name}」を更新しました`);
    } else {
      const created = store.addSpot(spotData);
      mapManager.flyToLocation(created.lat, created.lng, 13);
      this.showToast(`「${name}」を白地図に登録しました`);
    }

    this.closeModal('modal-spot');
  }

  // Category Modal
  openCategoryModal(category = null) {
    const titleEl = document.getElementById('modal-category-title');
    const delBtn = document.getElementById('btn-delete-category');

    document.getElementById('category-id').value = category?.id || '';
    document.getElementById('category-name').value = category?.name || '';
    document.getElementById('category-icon').value = category?.icon || '📍';
    document.getElementById('category-color').value = category?.color || '#3b82f6';
    document.getElementById('category-color-label').textContent = category?.color || '#3b82f6';

    if (category?.id) {
      titleEl.innerHTML = '<i class="fa-solid fa-pen"></i> 目的（カテゴリ）を編集';
      delBtn.style.display = 'inline-flex';
      delBtn.onclick = () => {
        if (confirm(`カテゴリ「${category.name}」を削除しますか？`)) {
          store.deleteCategory(category.id);
          this.closeModal('modal-category');
          this.showToast('カテゴリを削除しました');
        }
      };
    } else {
      titleEl.innerHTML = '<i class="fa-solid fa-plus"></i> 新しい目的（カテゴリ）を追加';
      delBtn.style.display = 'none';
    }

    this.openModal('modal-category');
  }

  handleCategoryFormSubmit() {
    const id = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value;
    const icon = document.getElementById('category-icon').value;
    const color = document.getElementById('category-color').value;

    if (!name.trim()) {
      alert('カテゴリ名を入力してください。');
      return;
    }

    if (id) {
      store.updateCategory(id, { name, icon, color });
      this.showToast(`カテゴリ「${name}」を更新しました`);
    } else {
      store.addCategory({ name, icon, color });
      this.showToast(`新しい目的「${name}」を作成しました`);
    }

    this.closeModal('modal-category');
  }

  // Export Blank Map as Image (print/download)
  exportMapImage() {
    window.print();
  }

  // Modal helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && typeof modal.close === 'function') {
      modal.close();
    }
  }

  switchSidebarTab(tabId) {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar?.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.click();
      }
    });
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
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

export const uiManager = new UIManager();
