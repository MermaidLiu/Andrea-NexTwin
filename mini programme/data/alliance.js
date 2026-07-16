/**
 * 星孪联盟 (Star Twin Alliance) configuration
 * Replace groupQrImage with your real WeChat group QR code image
 */
const ALLIANCE = {
  id: 'star_twin_alliance',
  nameKey: 'alliance.name',
  taglineKey: 'alliance.tagline',
  descKey: 'alliance.desc',
  groupNameKey: 'alliance.groupName',
  groupQrImage: '/packageSub/assets/images/alliance-group-qr.png',
  benefitKeys: [
    'alliance.benefit1',
    'alliance.benefit2',
    'alliance.benefit3',
    'alliance.benefit4'
  ]
};

module.exports = { ALLIANCE };
