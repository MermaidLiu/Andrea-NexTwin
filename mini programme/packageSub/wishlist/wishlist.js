const { getWishlist, removeFromWishlist } = require('../../../utils/wishlist');
const { getSessionById } = require('../../../data/sessions');
const { getVenueById } = require('../../../data/venues');

function getAppInstance() {
  return getApp();
}

Page({
  data: {
    items: [],
    labels: {}
  },

  onShow() {
    this._loadWishlist();
  },

  _loadWishlist() {
    const t = getAppInstance().globalData.i18n.t.bind(getAppInstance().globalData.i18n);
    const list = getWishlist();

    const items = list.map(item => {
      const session = getSessionById(item.sessionId);
      if (!session) return null;
      const venue = getVenueById(session.venueId);
      return {
        sessionId: item.sessionId,
        name: t(session.nameKey),
        venueName: venue ? t(venue.nameKey) : '',
        timeRange: `${session.startTime} - ${session.endTime.split(' ')[1]}`
      };
    }).filter(Boolean);

    this.setData({
      items,
      labels: {
        back: t('common.back'),
        title: t('wishlist.title'),
        subtitle: t('wishlist.subtitle'),
        empty: t('wishlist.empty'),
        emptyHint: t('wishlist.emptyHint')
      }
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onOpenSession(e) {
    wx.navigateTo({
      url: `/packageSub/session-detail/session-detail?sessionId=${e.currentTarget.dataset.id}`
    });
  },

  onRemove(e) {
    const sessionId = e.currentTarget.dataset.id;
    removeFromWishlist(sessionId);
    this._loadWishlist();
    wx.showToast({
      title: getAppInstance().t('wishlist.removed'),
      icon: 'none'
    });
  }
});
