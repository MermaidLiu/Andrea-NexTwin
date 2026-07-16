const { VenueScene } = require('../../utils/three-scene');
const { GestureController } = require('../../utils/gesture');
const { planCrossVenueRoute } = require('../../utils/routing');
const { TRACKS } = require('../../data/tracks');
const { VENUES, getVenueById, getLocationById, LOCATIONS } = require('../../data/venues');
const {
  getSessionsByVenue,
  getSessionsOnSameFloor,
  getSessionsByTrack,
  getSessionsByTrackSorted,
  getNextSessionForVenueAndTrack,
  getSessionById
} = require('../../data/sessions');
const {
  isInWishlist,
  toggleWishlist,
  addCalendarReminder
} = require('../../utils/wishlist');
const { isAllianceMember } = require('../../utils/alliance');

function getAppInstance() {
  return getApp();
}

Page({
  data: {
    mode: 'venue',
    locale: 'zh',
    navLabels: {},
    labels: {},
    drawerLabels: {},
    trackLabels: {},
    crossVenueLabels: {},

    venueDrawerVisible: false,
    drawerSessions: [],
    drawerIndex: 0,

    tracks: [],
    selectedTrackId: '',
    selectedTrackName: '',
    activeTrackCount: 0,
    activeCountLabel: '',
    trackDrawerExpanded: true,

    venueList: [],
    crossVenueVisible: false,
    crossFromVenueId: '',
    crossToVenueId: '',
    routeResult: null,

    showWelcome: true,
    welcomeLeaving: false,
    welcomeLabels: {},
    locationCards: [],
    wishlistCount: 0,
    isAllianceMember: false,

    trackSessions: [],
    poiLabels: [],
    zoneLabels: []
  },

  scene: null,
  gesture: null,
  _touchMoved: false,
  _canvasNode: null,
  _labelUpdateTimer: null,

  onLoad() {
    this._initI18n();
    this._initTracks();
    this._initVenueList();
    this._initLocationCards();
    this._refreshWishlistCount();
    this._refreshAllianceStatus();
  },

  onShow() {
    this._refreshWishlistCount();
    this._refreshAllianceStatus();
    getAppInstance()._checkWishlistReminders();
  },

  onReady() {
    this._initCanvas();
  },

  onUnload() {
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
  },

  _initI18n() {
    const app = getAppInstance();
    const locale = app.globalData.locale;
    const t = app.globalData.i18n.t.bind(app.globalData.i18n);
    this._t = t;

    this.setData({
      locale,
      navLabels: {
        venue: t('nav.venue'),
        track: t('nav.track')
      },
      labels: {
        crossVenue: t('nav.crossVenue'),
        alliance: t('nav.alliance'),
        allianceHint: t('alliance.hint')
      },
      drawerLabels: {
        floor: t('drawer.floorLabel'),
        hall: t('drawer.hallLabel'),
        time: t('detail.time'),
        speaker: t('detail.speaker'),
        swipeHint: t('drawer.swipeHint'),
        addWishlist: t('wishlist.add'),
        inWishlist: t('wishlist.inWishlist')
      },
      trackLabels: {
        selectHint: t('track.selectHint'),
        all: t('track.all'),
        upcoming: t('track.upcoming'),
        upcomingHint: t('track.upcomingHint'),
        noSessions: t('track.noSessions')
      },
      crossVenueLabels: {
        title: t('crossVenue.title'),
        selectFrom: t('crossVenue.selectFrom'),
        selectTo: t('crossVenue.selectTo'),
        calculate: t('crossVenue.calculate'),
        clear: t('crossVenue.clear')
      },
      welcomeLabels: {
        subtitle: t('welcome.subtitle'),
        hint: t('welcome.hint'),
        enterMap: t('welcome.enterMap')
      }
    });
  },

  _initLocationCards() {
    const t = this._t;
    const locationCards = Object.values(LOCATIONS).map(loc => {
      const venueCount = VENUES.filter(v => v.locationId === loc.id).length;
      return {
        id: loc.id,
        name: t(loc.nameKey),
        color: loc.color,
        countLabel: t('welcome.venueCount', { count: venueCount })
      };
    });
    this.setData({ locationCards });
  },

  _initTracks() {
    const t = this._t;
    const tracks = TRACKS.map(track => ({
      id: track.id,
      name: t(track.nameKey),
      color: track.color
    }));
    this.setData({ tracks });
  },

  _initVenueList() {
    const t = this._t;
    const venueList = VENUES.map(v => ({
      id: v.id,
      name: t(v.nameKey)
    }));
    this.setData({ venueList });
  },

  _initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('.map-area')
      .boundingClientRect()
      .select('#venueCanvas')
      .node()
      .exec((res) => {
        const areaRect = res && res[0];
        const canvasRes = res && res[1];

        if (!canvasRes || !canvasRes.node) {
          console.error('Canvas node not found');
          return;
        }

        const canvas = canvasRes.node;
        const width = areaRect ? areaRect.width : wx.getSystemInfoSync().windowWidth;
        const height = areaRect ? areaRect.height : wx.getSystemInfoSync().windowHeight - 55;
        this._canvasNode = canvas;

        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        try {
          this.scene = new VenueScene(canvas, width, height);
          this.gesture = new GestureController({
            minDistance: 8,
            maxDistance: 35,
            rotationBounds: {
              minPhi: 0.25,
              maxPhi: Math.PI / 2.2,
              minTheta: -Math.PI * 0.75,
              maxTheta: Math.PI * 0.75
            }
          });
          // Overview camera angle – not zoomed into blocks
          this.gesture.setFromPosition(0, 18, 22);
          this.scene.setCameraPosition(this.gesture.getCameraPosition());
          this.scene.onRenderCallback = () => {
            if (this.data.mode === 'track' && this.data.selectedTrackId) {
              this._updateMapLabelsThrottled();
            }
          };
          this.scene.startRenderLoop();
        } catch (err) {
          console.error('Failed to init 3D scene:', err);
          wx.showToast({ title: '3D init failed', icon: 'none' });
        }
      });
  },

  onEnterMap() {
    this.setData({ welcomeLeaving: true, showWelcome: false });
    if (this.scene) {
      this.scene.setMapRevealed(true);
    }
  },

  onSelectLocation(e) {
    const locationId = e.currentTarget.dataset.id;
    this.onEnterMap();

    // Pan camera toward selected location zone
    const centers = {
      loc_west_bund: { x: -3.5, y: 0, z: 1.5 },
      loc_zhangjiang: { x: 4, y: 0, z: -2 },
      loc_expo: { x: 0, y: 0, z: -4 }
    };
    const target = centers[locationId];
    if (target && this.gesture && this.scene) {
      this.gesture.animateToTarget(target, 800, (pos) => {
        this.scene.setCameraPosition(pos);
      });
    }
  },

  // --- Touch gestures ---

  onTouchStart(e) {
    if (this.data.showWelcome) return;
    this._touchMoved = false;
    if (this.gesture) {
      this.gesture.handleTouch({ type: 'touchstart', touches: e.touches });
    }
  },

  onTouchMove(e) {
    if (this.data.showWelcome) return;
    this._touchMoved = true;
    if (this.gesture && this.scene) {
      this.gesture.handleTouch({ type: 'touchmove', touches: e.touches });
      this.scene.setCameraPosition(this.gesture.getCameraPosition());
    }
  },

  onTouchEnd(e) {
    if (this.data.showWelcome) return;
    if (this.gesture) {
      this.gesture.handleTouch({ type: 'touchend', touches: e.changedTouches || [] });
    }

    if (this.data.mode === 'track' && this.data.selectedTrackId) {
      this._updateMapLabels();
    }

    // Tap detection
    if (!this._touchMoved && e.changedTouches && e.changedTouches.length === 1) {
      this._handlePOITap(e.changedTouches[0]);
    }
  },

  _handlePOITap(touch) {
    if (!this.scene) return;

    const venue = this.scene.hitTestPOI(touch.x, touch.y);
    if (!venue) return;

    if (this.data.mode === 'track') {
      this._navigateToSessionDetail(venue.id);
    } else {
      this._openVenueDrawer(venue.id);
    }
  },

  // --- Venue mode drawer ---

  _openVenueDrawer(venueId) {
    const t = this._t;
    const sameFloorSessions = getSessionsOnSameFloor(venueId);

    const drawerSessions = sameFloorSessions.map(session => {
      const venue = getVenueById(session.venueId);
      return {
        id: session.id,
        venueName: venue ? t(venue.nameKey) : '',
        name: t(session.nameKey),
        desc: t(session.descKey),
        floorLabel: t('drawer.floor', { floor: venue ? venue.floor : 1 }),
        hall: venue ? venue.hall : '',
        timeRange: `${session.startTime} - ${session.endTime.split(' ')[1]}`,
        speaker: t(session.speakerKey),
        trackNames: session.trackIds.map(tid => {
          const track = TRACKS.find(tr => tr.id === tid);
          return track ? t(track.nameKey) : tid;
        }),
        inWishlist: isInWishlist(session.id)
      };
    });

    const startIndex = drawerSessions.findIndex(s => {
      const session = sameFloorSessions.find(ss => ss.id === s.id);
      return session && session.venueId === venueId;
    });

    this.setData({
      venueDrawerVisible: true,
      drawerSessions,
      drawerIndex: startIndex >= 0 ? startIndex : 0
    });

    // Animate camera toward selected POI
    const venue = getVenueById(venueId);
    if (venue && this.gesture && this.scene) {
      this.gesture.animateToTarget(
        venue.position3d,
        600,
        (pos) => this.scene.setCameraPosition(pos)
      );
    }
  },

  onCloseVenueDrawer() {
    this.setData({ venueDrawerVisible: false });
  },

  onDrawerSwiperChange(e) {
    this.setData({ drawerIndex: e.detail.index });
  },

  onDrawerToggleWishlist(e) {
    this._handleWishlistToggle(e.detail.sessionId);
  },

  onOpenWishlist() {
    wx.navigateTo({ url: '/packageSub/wishlist/wishlist' });
  },

  onOpenAlliance() {
    wx.navigateTo({ url: '/packageSub/alliance/alliance' });
  },

  _refreshWishlistCount() {
    const count = getAppInstance().refreshWishlistCount();
    this.setData({ wishlistCount: count });
  },

  _refreshAllianceStatus() {
    this.setData({ isAllianceMember: isAllianceMember() });
  },

  async _handleWishlistToggle(sessionId) {
    const session = getSessionById(sessionId);
    if (!session) return;

    const t = this._t;
    const added = toggleWishlist(session);

    if (added) {
      await addCalendarReminder(session, t);
      wx.showToast({ title: t('wishlist.added'), icon: 'success' });
    } else {
      wx.showToast({ title: t('wishlist.removed'), icon: 'none' });
    }

    this._refreshWishlistCount();

    // Refresh drawer session wishlist state
    const drawerSessions = this.data.drawerSessions.map(s => ({
      ...s,
      inWishlist: isInWishlist(s.id)
    }));
    this.setData({ drawerSessions });
  },

  _buildTrackSessions(trackId) {
    if (!trackId) return [];

    const t = this._t;
    const sessions = getSessionsByTrackSorted(trackId);

    return sessions.map(session => {
      const venue = getVenueById(session.venueId);
      const location = venue ? getLocationById(venue.locationId) : null;
      const startTime = session.startTime.split(' ')[1];
      const endTime = session.endTime.split(' ')[1];

      return {
        id: session.id,
        name: t(session.nameKey),
        venueName: venue ? t(venue.nameKey) : '',
        locationName: location ? t(location.nameKey) : '',
        address: venue ? t(venue.addressKey) : '',
        timeRange: `${startTime} - ${endTime}`,
        venueId: session.venueId
      };
    });
  },

  _updateMapLabels() {
    if (!this.scene || this.data.mode !== 'track' || !this.data.selectedTrackId) {
      this.setData({ poiLabels: [], zoneLabels: [] });
      return;
    }

    const t = this._t;
    const trackId = this.data.selectedTrackId;
    const positions = this.scene.getPOIScreenPositions();
    const zonePositions = this.scene.getZoneScreenPositions();

    const poiLabels = positions.map(pos => {
      const venue = getVenueById(pos.venueId);
      if (!venue) return null;
      const location = getLocationById(venue.locationId);
      const nextSession = getNextSessionForVenueAndTrack(pos.venueId, trackId);
      const startTime = nextSession ? nextSession.startTime.split(' ')[1] : '';

      return {
        venueId: pos.venueId,
        x: pos.x,
        y: pos.y,
        venueName: t(venue.nameKey),
        locationName: location ? t(location.nameKey) : '',
        sessionHint: nextSession
          ? t('track.nextSession', { time: startTime })
          : ''
      };
    }).filter(Boolean);

    const zoneLabels = zonePositions.map(pos => {
      const loc = Object.values(LOCATIONS).find(l => l.id === pos.locationId);
      return {
        locationId: pos.locationId,
        x: pos.x,
        y: pos.y,
        name: loc ? t(loc.nameKey) : ''
      };
    });

    this.setData({ poiLabels, zoneLabels });
  },

  _updateMapLabelsThrottled() {
    if (this._labelUpdateTimer) return;
    this._labelUpdateTimer = setTimeout(() => {
      this._labelUpdateTimer = null;
      this._updateMapLabels();
    }, 200);
  },

  onPoiLabelTap(e) {
    const venueId = e.currentTarget.dataset.id;
    if (venueId) {
      this._navigateToSessionDetail(venueId);
    }
  },

  onTrackSessionSelect(e) {
    const sessionId = e.detail.sessionId;
    wx.navigateTo({
      url: `/packageSub/session-detail/session-detail?sessionId=${sessionId}`
    });
  },

  // --- Track mode ---

  _navigateToSessionDetail(venueId) {
    const sessions = getSessionsByVenue(venueId);
    const trackId = this.data.selectedTrackId;

    let targetSession = sessions[0];
    if (trackId) {
      const filtered = sessions.filter(s => s.trackIds.includes(trackId));
      if (filtered.length > 0) targetSession = filtered[0];
    }

    if (targetSession) {
      wx.navigateTo({
        url: `/packageSub/session-detail/session-detail?sessionId=${targetSession.id}`
      });
    }
  },

  onTrackSelect(e) {
    const trackId = e.detail.trackId;
    const t = this._t;

    let selectedTrackName = '';
    let activeTrackCount = 0;

    if (trackId) {
      const track = TRACKS.find(tr => tr.id === trackId);
      selectedTrackName = track ? t(track.nameKey) : '';
      activeTrackCount = getSessionsByTrack(trackId).length;
    }

    getAppInstance().globalData.selectedTrackId = trackId || null;

    const trackSessions = this._buildTrackSessions(trackId);

    this.setData({
      selectedTrackId: trackId,
      selectedTrackName,
      activeTrackCount,
      activeCountLabel: t('track.activeCount', { count: activeTrackCount }),
      trackSessions,
      trackDrawerExpanded: !!trackId
    });

    if (this.scene) {
      this.scene.setTrackFilter(trackId || null);
    }

    if (trackId) {
      this._updateMapLabels();
      // Pan camera to first session venue
      const first = trackSessions[0];
      if (first) {
        const venue = getVenueById(first.venueId);
        if (venue && this.gesture) {
          this.gesture.animateToTarget(venue.position3d, 600, (pos) => {
            this.scene.setCameraPosition(pos);
            this._updateMapLabels();
          });
        }
      }
    } else {
      this.setData({ poiLabels: [], zoneLabels: [] });
    }
  },

  onToggleTrackDrawer() {
    this.setData({ trackDrawerExpanded: !this.data.trackDrawerExpanded });
  },

  // --- Mode switching ---

  onModeChange(e) {
    const mode = e.detail.mode;

    // Track mode skips welcome and shows map directly
    if (mode === 'track') {
      this.setData({ showWelcome: false, welcomeLeaving: false });
      if (this.scene) {
        this.scene.setMapRevealed(true);
      }
      if (this.data.selectedTrackId) {
        this._updateMapLabels();
      }
    }

    this.setData({
      mode,
      venueDrawerVisible: false
    });

    if (mode === 'venue') {
      if (this.scene) {
        this.scene.setTrackFilter(null);
      }
      this.setData({
        selectedTrackId: '',
        selectedTrackName: '',
        activeTrackCount: 0,
        trackSessions: [],
        poiLabels: [],
        zoneLabels: []
      });
    }
  },

  // --- Cross-venue navigation ---

  onToggleCrossVenue() {
    this.setData({ crossVenueVisible: !this.data.crossVenueVisible });
  },

  onCloseCrossVenue() {
    this.setData({ crossVenueVisible: false });
  },

  onCrossSelectFrom(e) {
    this.setData({ crossFromVenueId: e.detail.venueId });
  },

  onCrossSelectTo(e) {
    this.setData({ crossToVenueId: e.detail.venueId });
  },

  onCalculateRoute() {
    const { crossFromVenueId, crossToVenueId } = this.data;
    if (!crossFromVenueId || !crossToVenueId) return;

    const t = this._t;
    const route = planCrossVenueRoute(crossFromVenueId, crossToVenueId, t);

    if (!route) {
      wx.showToast({ title: 'Route not found', icon: 'none' });
      return;
    }

    const routeResult = {
      totalTimeLabel: t('crossVenue.totalTime', { minutes: route.totalMinutes }),
      instructions: route.instructions
    };

    this.setData({ routeResult });

    if (this.scene) {
      this.scene.setRouteLine(route.routeLine3D);
    }
  },

  onClearRoute() {
    this.setData({
      routeResult: null,
      crossFromVenueId: '',
      crossToVenueId: ''
    });
    if (this.scene) {
      this.scene.clearRouteLine();
    }
  },

  // --- i18n ---

  onLocaleChange(e) {
    const locale = e.detail.locale;
    getAppInstance().setLocale(locale);
    this._initI18n();
    this._initTracks();
    this._initVenueList();
    this._initLocationCards();

    this.setData({ locale });
    this._refreshAllianceStatus();

    if (this.data.selectedTrackId) {
      this.onTrackSelect({ detail: { trackId: this.data.selectedTrackId } });
    }
  }
});
