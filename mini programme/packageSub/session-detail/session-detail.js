const { getSessionById } = require('../../../data/sessions');
const { getVenueById } = require('../../../data/venues');
const { TRACKS } = require('../../../data/tracks');
const {
  isInWishlist,
  toggleWishlist,
  addCalendarReminder
} = require('../../../utils/wishlist');

function getAppInstance() {
  return getApp();
}

Page({
  data: {
    session: null,
    sessionName: '',
    sessionDesc: '',
    venueName: '',
    speaker: '',
    timeRange: '',
    locationText: '',
    trackNames: [],
    inWishlist: false,
    labels: {}
  },

  _session: null,

  onLoad(options) {
    const sessionId = options.sessionId;
    if (!sessionId) {
      wx.navigateBack();
      return;
    }

    const session = getSessionById(sessionId);
    if (!session) {
      wx.navigateBack();
      return;
    }

    this._session = session;
    this._renderSession(session);
  },

  onShow() {
    if (this._session) {
      this.setData({ inWishlist: isInWishlist(this._session.id) });
    }
  },

  _renderSession(session) {
    const t = getAppInstance().globalData.i18n.t.bind(getAppInstance().globalData.i18n);
    const venue = getVenueById(session.venueId);

    this.setData({
      session,
      sessionName: t(session.nameKey),
      sessionDesc: t(session.descKey),
      venueName: venue ? t(venue.nameKey) : '',
      speaker: t(session.speakerKey),
      timeRange: `${session.startTime} - ${session.endTime}`,
      locationText: venue
        ? `${t(venue.nameKey)} · ${session.room} · ${t(venue.addressKey)}`
        : session.room,
      trackNames: session.trackIds.map(tid => {
        const track = TRACKS.find(tr => tr.id === tid);
        return track ? t(track.nameKey) : tid;
      }),
      inWishlist: isInWishlist(session.id),
      labels: {
        back: t('common.back'),
        time: t('detail.time'),
        location: t('detail.location'),
        speaker: t('detail.speaker'),
        tracks: t('detail.tracks'),
        description: t('detail.description'),
        remindMe: t('detail.remindMe'),
        addWishlist: t('wishlist.add'),
        inWishlist: t('wishlist.inWishlist')
      }
    });

    wx.setNavigationBarTitle({ title: t(session.nameKey) });
  },

  onBack() {
    wx.navigateBack();
  },

  async onToggleWishlist() {
    const session = this._session;
    if (!session) return;

    const t = getAppInstance().globalData.i18n.t.bind(getAppInstance().globalData.i18n);
    const added = toggleWishlist(session);

    if (added) {
      await addCalendarReminder(session, t);
      wx.showToast({ title: t('wishlist.added'), icon: 'success' });
    } else {
      wx.showToast({ title: t('wishlist.removed'), icon: 'none' });
    }

    this.setData({ inWishlist: isInWishlist(session.id) });
    getAppInstance().refreshWishlistCount();
  },

  onRemindMe() {
    const session = this._session;
    if (!session) return;

    const t = getAppInstance().globalData.i18n.t.bind(getAppInstance().globalData.i18n);

    addCalendarReminder(session, t).then((ok) => {
      if (ok) {
        wx.showToast({ title: t('detail.addedToCalendar'), icon: 'success' });
      } else {
        wx.showToast({ title: t('detail.calendarFail'), icon: 'none' });
      }
    });
  }
});
