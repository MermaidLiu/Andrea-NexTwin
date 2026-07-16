/**
 * Star Twin Alliance membership state
 */
const { ALLIANCE } = require('../data/alliance');

const STORAGE_KEY = 'waic_alliance_member';

function isAllianceMember() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    return !!(data && data.joined);
  } catch (e) {
    return false;
  }
}

function getMembership() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function joinAlliance() {
  const membership = {
    allianceId: ALLIANCE.id,
    joined: true,
    joinedAt: Date.now()
  };
  wx.setStorageSync(STORAGE_KEY, membership);
  return membership;
}

function leaveAlliance() {
  wx.removeStorageSync(STORAGE_KEY);
}

module.exports = {
  isAllianceMember,
  getMembership,
  joinAlliance,
  leaveAlliance
};
