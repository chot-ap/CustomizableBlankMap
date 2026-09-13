/**
 * store.js
 * State management, LocalStorage persistence, and CRUD operations
 */

const STORAGE_KEY = 'blankmap_app_data_v1';

// Default categories
const DEFAULT_CATEGORIES = [
  { id: 'cat-onsen', name: '温泉・サウナ', icon: '♨️', color: '#ef4444' },
  { id: 'cat-hotel', name: '宿・ホテル', icon: '🏨', color: '#3b82f6' },
  { id: 'cat-gourmet', name: 'レストラン・名物', icon: '🍴', color: '#f59e0b' },
  { id: 'cat-sightseeing', name: '観光地・史跡', icon: '🏯', color: '#8b5cf6' },
  { id: 'cat-nature', name: '絶景・自然・ドライブ', icon: '🚗', color: '#10b981' },
  { id: 'cat-cafe', name: 'カフェ・甘味処', icon: '☕', color: '#ec4899' },
];

// Rich sample spots to delight the user on first load
const SAMPLE_SPOTS = [
  {
    id: 'spot-1',
    name: '草津温泉 湯畑',
    categoryId: 'cat-onsen',
    status: 'visited',
    lat: 36.6228,
    lng: 138.5962,
    date: '2025-10-14',
    rating: 5,
    address: '群馬県吾妻郡草津町草津',
    memo: '湯けむりと硫黄の香りが最高。夜のライトアップが幻想的だった。温泉まんじゅうも美味。',
    imageUrl: ''
  },
  {
    id: 'spot-2',
    name: '別府地獄めぐり',
    categoryId: 'cat-onsen',
    status: 'wishlist',
    lat: 33.3157,
    lng: 131.4764,
    date: '2026-11-20',
    rating: 4,
    address: '大分県別府市鉄輪',
    memo: '海地獄や血の池地獄を巡りたい。地獄蒸しプリンも必食！',
    imageUrl: ''
  },
  {
    id: 'spot-3',
    name: '富士屋ホテル',
    categoryId: 'cat-hotel',
    status: 'visited',
    lat: 35.2415,
    lng: 139.0645,
    date: '2025-07-21',
    rating: 5,
    address: '神奈川県足柄下郡箱根町宮ノ下359',
    memo: '明治創業のクラシックホテル。歴史ある建築美と伝統のアップルパイを堪能。',
    imageUrl: ''
  },
  {
    id: 'spot-4',
    name: '白川郷合掌造り集落',
    categoryId: 'cat-sightseeing',
    status: 'wishlist',
    lat: 36.2562,
    lng: 136.9066,
    date: '',
    rating: 5,
    address: '岐阜県大野郡白川村荻町',
    memo: '雪景色のライトアップの時期に行ってみたい世界遺産。展望台からの眺めが楽しみ。',
    imageUrl: ''
  },
  {
    id: 'spot-5',
    name: 'メタセコイア並木',
    categoryId: 'cat-nature',
    status: 'visited',
    lat: 35.4852,
    lng: 136.0305,
    date: '2025-11-03',
    rating: 4,
    address: '滋賀県高島市マキノ町蛭口',
    memo: '秋の紅葉シーズンにドライブで訪問。約2.4km続く黄金色の並木道が圧巻。',
    imageUrl: ''
  },
  {
    id: 'spot-6',
    name: '築地場外市場',
    categoryId: 'cat-gourmet',
    status: 'visited',
    lat: 35.6655,
    lng: 139.7708,
    date: '2026-02-10',
    rating: 4,
    address: '東京都中央区築地4丁目',
    memo: '新鮮な海鮮丼と厚焼き玉子の食べ歩き。活気にあふれている。',
    imageUrl: ''
  }
];

class AppStore {
  constructor() {
    this.categories = [];
    this.spots = [];
    this.activeCategoryFilter = 'all'; // 'all' or categoryId
    this.activeStatusFilter = 'all';     // 'all' | 'visited' | 'wishlist'
    this.originPoint = null;             // { lat, lng, name }
    this.currentRoute = null;            // route data from OSRM
    this.listeners = [];
    this.init();
  }

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.categories = parsed.categories || DEFAULT_CATEGORIES;
        this.spots = parsed.spots || [];
      } catch (e) {
        console.error('Failed to parse saved data, loading defaults', e);
        this.resetToDefaults();
      }
    } else {
      this.resetToDefaults();
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        categories: this.categories,
        spots: this.spots
      }));
      this.notify();
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  resetToDefaults() {
    this.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    this.spots = JSON.parse(JSON.stringify(SAMPLE_SPOTS));
    this.save();
  }

  clearAllData() {
    this.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    this.spots = [];
    this.originPoint = null;
    this.currentRoute = null;
    this.save();
  }

  // Subscribe to changes
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(eventType = 'change') {
    this.listeners.forEach(l => l(eventType, this));
  }

  // Categories
  getCategories() {
    return this.categories;
  }

  getCategoryById(id) {
    return this.categories.find(c => c.id === id) || null;
  }

  addCategory(category) {
    const newCat = {
      id: 'cat-' + Date.now(),
      name: category.name.trim(),
      icon: category.icon.trim() || '📍',
      color: category.color || '#3b82f6'
    };
    this.categories.push(newCat);
    this.save();
    return newCat;
  }

  updateCategory(id, updates) {
    const idx = this.categories.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.categories[idx] = { ...this.categories[idx], ...updates };
      this.save();
      return this.categories[idx];
    }
    return null;
  }

  deleteCategory(id) {
    this.categories = this.categories.filter(c => c.id !== id);
    // Also re-assign or keep spots
    this.spots = this.spots.map(s => {
      if (s.categoryId === id) {
        return { ...s, categoryId: this.categories[0]?.id || '' };
      }
      return s;
    });
    if (this.activeCategoryFilter === id) {
      this.activeCategoryFilter = 'all';
    }
    this.save();
  }

  // Spots
  getSpots() {
    return this.spots;
  }

  getFilteredSpots() {
    return this.spots.filter(spot => {
      // Category filter
      if (this.activeCategoryFilter !== 'all' && spot.categoryId !== this.activeCategoryFilter) {
        return false;
      }
      // Status filter
      if (this.activeStatusFilter !== 'all' && spot.status !== this.activeStatusFilter) {
        return false;
      }
      return true;
    });
  }

  getSpotById(id) {
    return this.spots.find(s => s.id === id) || null;
  }

  addSpot(spot) {
    const newSpot = {
      id: 'spot-' + Date.now(),
      name: spot.name.trim(),
      categoryId: spot.categoryId,
      status: spot.status || 'visited', // 'visited' or 'wishlist'
      lat: Number(spot.lat),
      lng: Number(spot.lng),
      date: spot.date || '',
      rating: Number(spot.rating) || 3,
      address: (spot.address || '').trim(),
      memo: (spot.memo || '').trim(),
      imageUrl: (spot.imageUrl || '').trim()
    };
    this.spots.push(newSpot);
    this.save();
    return newSpot;
  }

  updateSpot(id, updates) {
    const idx = this.spots.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.spots[idx] = {
        ...this.spots[idx],
        ...updates,
        lat: updates.lat !== undefined ? Number(updates.lat) : this.spots[idx].lat,
        lng: updates.lng !== undefined ? Number(updates.lng) : this.spots[idx].lng,
      };
      this.save();
      return this.spots[idx];
    }
    return null;
  }

  deleteSpot(id) {
    this.spots = this.spots.filter(s => s.id !== id);
    this.save();
  }

  // Filters
  setCategoryFilter(categoryId) {
    this.activeCategoryFilter = categoryId;
    this.notify('filter');
  }

  setStatusFilter(status) {
    this.activeStatusFilter = status;
    this.notify('filter');
  }

  // Origin point for routing
  setOriginPoint(origin) {
    this.originPoint = origin; // { lat, lng, name }
    this.notify('origin');
  }

  getOriginPoint() {
    return this.originPoint;
  }

  // Route
  setCurrentRoute(route) {
    this.currentRoute = route;
    this.notify('route');
  }

  getCurrentRoute() {
    return this.currentRoute;
  }

  clearRoute() {
    this.currentRoute = null;
    this.notify('route');
  }

  // Export / Import
  exportJSON() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      categories: this.categories,
      spots: this.spots
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blankmap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data && Array.isArray(data.categories) && Array.isArray(data.spots)) {
        this.categories = data.categories;
        this.spots = data.spots;
        this.save();
        return { success: true, count: data.spots.length };
      }
      return { success: false, error: 'JSONフォーマットが正しくありません。' };
    } catch (e) {
      return { success: false, error: 'JSONの解析に失敗しました: ' + e.message };
    }
  }
}

export const store = new AppStore();
