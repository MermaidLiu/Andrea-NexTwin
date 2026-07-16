/**
 * Wishlist storage and 15-minute pre-session reminders
 */
const STORAGE_KEY = 'waic_wishlist';
const REMIND_AHEAD_MS = 15 * 60 * 1000;

function getWishlist() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || [];
  } catch (e) {
    return [];
  }
}

function saveWishlist(list) {
  wx.setStorageSync(STORAGE_KEY, list);
}

function isInWishlist(sessionId) {
  return getWishlist().some(item => item.sessionId === sessionId);
}

function addToWishlist(session) {
  if (!session || !session.id) return false;
  const list = getWishlist();
  if (list.some(item => item.sessionId === session.id)) return false;

  list.push({
    sessionId: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    nameKey: session.nameKey,
    venueId: session.venueId,
    addedAt: Date.now(),
    preReminded: false
  });
  saveWishlist(list);
  return true;
}

function removeFromWishlist(sessionId) {
  const list = getWishlist().filter(item => item.sessionId !== sessionId);
  saveWishlist(list);
}

function toggleWishlist(session) {
  if (isInWishlist(session.id)) {
    removeFromWishlist(session.id);
    return false;
  }
  addToWishlist(session);
  return true;
}

function getWishlistCount() {
  return getWishlist().length;
}

/**
 * Check wishlist and fire in-app reminder when session is within 15 minutes
 * @param {Function} t - i18n translate function
 * @returns {boolean} whether a reminder was shown
 */
function checkUpcomingReminders(t) {
  const list = getWishlist();
  if (!list.length) return false;

  const { getSessionById } = require('../data/sessions');
  const now = Date.now();
  let shown = false;
  let updated = false;

  list.forEach(item => {
    if (item.preReminded) return;

    const session = getSessionById(item.sessionId);
    if (!session) return;

    const startMs = new Date(session.startTime.replace(/-/g, '/')).getTime();
    const diff = startMs - now;

    // Within 15 minutes before start (and not yet started)
    if (diff > 0 && diff <= REMIND_AHEAD_MS) {
      const sessionName = t(session.nameKey);
      wx.showModal({
        title: t('wishlist.preReminderTitle'),
        content: t('wishlist.preReminderContent', { name: sessionName }),
        confirmText: t('wishlist.viewDetail'),
        cancelText: t('common.close'),
        success(res) {
          if (res.confirm) {
            wx.navigateTo({
              url: `/packageSub/session-detail/session-detail?sessionId=${session.id}`
            });
          }
        }
      });
      item.preReminded = true;
      shown = true;
      updated = true;
    }
  });

  if (updated) saveWishlist(list);
  return shown;
}

/**
 * Schedule native calendar alarm 15 min before session (optional enhancement)
 */
function addCalendarReminder(session, t) {
  const { getVenueById } = require('../data/venues');
  const venue = getVenueById(session.venueId);
  const startDate = new Date(session.startTime.replace(/-/g, '/')).getTime();
  const endDate = new Date(session.endTime.replace(/-/g, '/')).getTime();

  return new Promise((resolve) => {
    wx.addPhoneCalendar({
      title: t(session.nameKey),
      startTime: Math.floor(startDate / 1000),
      endTime: Math.floor(endDate / 1000),
      description: t(session.descKey),
      location: venue ? t(venue.addressKey) : session.room,
      alarm: true,
      alarmOffset: 900,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

module.exports = {
  getWishlist,
  isInWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
  getWishlistCount,
  checkUpcomingReminders,
  addCalendarReminder,
  REMIND_AHEAD_MS
};
