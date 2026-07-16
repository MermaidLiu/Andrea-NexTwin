const { createI18n } = require('./utils/i18n');
const { checkUpcomingReminders } = require('./utils/wishlist');

App({
  globalData: {
    locale: 'zh',
    i18n: createI18n('zh'),
    selectedTrackId: null,
    crossVenueSelection: [],
    wishlistCount: 0
  },

  onLaunch() {
    const savedLocale = wx.getStorageSync('waic_locale');
    if (savedLocale === 'en' || savedLocale === 'zh') {
      this.globalData.locale = savedLocale;
      this.globalData.i18n = createI18n(savedLocale);
    }
  },

  onShow() {
    this._checkWishlistReminders();
  },

  _checkWishlistReminders() {
    const t = this.globalData.i18n.t.bind(this.globalData.i18n);
    checkUpcomingReminders(t);
  },

  setLocale(locale) {
    if (locale !== 'zh' && locale !== 'en') return;
    this.globalData.locale = locale;
    this.globalData.i18n = createI18n(locale);
    wx.setStorageSync('waic_locale', locale);
  },

  t(key, params) {
    return this.globalData.i18n.t(key, params);
  },

  refreshWishlistCount() {
    const { getWishlistCount } = require('./utils/wishlist');
    this.globalData.wishlistCount = getWishlistCount();
    return this.globalData.wishlistCount;
  }
});
