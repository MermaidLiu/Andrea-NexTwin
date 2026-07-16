const { ALLIANCE } = require('../../../data/alliance');
const { isAllianceMember, joinAlliance } = require('../../../utils/alliance');

function getAppInstance() {
  return getApp();
}

Page({
  data: {
    isMember: false,
    groupQrImage: ALLIANCE.groupQrImage,
    benefits: [],
    labels: {}
  },

  onShow() {
    this._render();
  },

  _render() {
    const t = getAppInstance().globalData.i18n.t.bind(getAppInstance().globalData.i18n);
    const benefits = ALLIANCE.benefitKeys.map(key => t(key));

    this.setData({
      isMember: isAllianceMember(),
      benefits,
      labels: {
        name: t(ALLIANCE.nameKey),
        tagline: t(ALLIANCE.taglineKey),
        desc: t(ALLIANCE.descKey),
        benefitsTitle: t('alliance.benefitsTitle'),
        join: t('alliance.join'),
        joinHint: t('alliance.joinHint'),
        memberBadge: t('alliance.memberBadge'),
        groupTitle: t('alliance.groupTitle'),
        groupName: t(ALLIANCE.groupNameKey),
        qrHint: t('alliance.qrHint'),
        previewQr: t('alliance.previewQr'),
        saveQr: t('alliance.saveQr'),
        joined: t('alliance.joined'),
        saveSuccess: t('alliance.saveSuccess'),
        saveFail: t('alliance.saveFail')
      }
    });

    wx.setNavigationBarTitle({ title: t(ALLIANCE.nameKey) });
  },

  onJoinAlliance() {
    const t = getAppInstance().t.bind(getAppInstance());
    joinAlliance();
    this.setData({ isMember: true });

    wx.showToast({
      title: t('alliance.joined'),
      icon: 'success',
      duration: 2000
    });

    // Auto preview QR after joining so user can scan immediately
    setTimeout(() => {
      this.onPreviewQr();
    }, 800);
  },

  onPreviewQr() {
    wx.previewImage({
      urls: [ALLIANCE.groupQrImage],
      current: ALLIANCE.groupQrImage
    });
  },

  onSaveQr() {
    const t = getAppInstance().t.bind(getAppInstance());

    wx.getImageInfo({
      src: ALLIANCE.groupQrImage,
      success: (info) => {
        wx.saveImageToPhotosAlbum({
          filePath: info.path,
          success: () => {
            wx.showToast({ title: t('alliance.saveSuccess'), icon: 'success' });
          },
          fail: () => {
            wx.showModal({
              title: t('alliance.saveFail'),
              content: t('alliance.saveFailHint'),
              showCancel: false
            });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: t('alliance.saveFail'), icon: 'none' });
      }
    });
  }
});
