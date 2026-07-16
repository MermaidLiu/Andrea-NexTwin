/**
 * Forum sessions mapped to venues and tracks
 */
const SESSIONS = [
  {
    id: 'session_west_ai_life_1',
    venueId: 'venue_west_bund_ai_life',
    trackIds: ['track_large_models', 'track_embodied_ai'],
    nameKey: 'session.westAiLife1',
    descKey: 'session.westAiLife1Desc',
    speakerKey: 'session.westAiLife1Speaker',
    startTime: '2026-07-26 09:00',
    endTime: '2026-07-26 11:00',
    room: 'Room 101'
  },
  {
    id: 'session_west_ai_life_2',
    venueId: 'venue_west_bund_ai_life',
    trackIds: ['track_healthcare_ai', 'track_education_ai'],
    nameKey: 'session.westAiLife2',
    descKey: 'session.westAiLife2Desc',
    speakerKey: 'session.westAiLife2Speaker',
    startTime: '2026-07-26 14:00',
    endTime: '2026-07-26 16:00',
    room: 'Room 102'
  },
  {
    id: 'session_west_media_1',
    venueId: 'venue_west_bund_media',
    trackIds: ['track_nlp', 'track_computer_vision'],
    nameKey: 'session.westMedia1',
    descKey: 'session.westMedia1Desc',
    speakerKey: 'session.westMedia1Speaker',
    startTime: '2026-07-26 10:00',
    endTime: '2026-07-26 12:00',
    room: 'Room 201'
  },
  {
    id: 'session_west_media_2',
    venueId: 'venue_west_bund_media',
    trackIds: ['track_ai_ethics', 'track_ai_governance'],
    nameKey: 'session.westMedia2',
    descKey: 'session.westMedia2Desc',
    speakerKey: 'session.westMedia2Speaker',
    startTime: '2026-07-26 15:00',
    endTime: '2026-07-26 17:00',
    room: 'Room 202'
  },
  {
    id: 'session_zj_computing_1',
    venueId: 'venue_zhangjiang_computing',
    trackIds: ['track_large_models', 'track_quantum_ai'],
    nameKey: 'session.zjComputing1',
    descKey: 'session.zjComputing1Desc',
    speakerKey: 'session.zjComputing1Speaker',
    startTime: '2026-07-26 09:30',
    endTime: '2026-07-26 11:30',
    room: 'Computing Lab A'
  },
  {
    id: 'session_zj_computing_2',
    venueId: 'venue_zhangjiang_computing',
    trackIds: ['track_robotics', 'track_manufacturing'],
    nameKey: 'session.zjComputing2',
    descKey: 'session.zjComputing2Desc',
    speakerKey: 'session.zjComputing2Speaker',
    startTime: '2026-07-26 13:30',
    endTime: '2026-07-26 15:30',
    room: 'Computing Lab B'
  },
  {
    id: 'session_zj_computing_3',
    venueId: 'venue_zhangjiang_computing',
    trackIds: ['track_energy', 'track_smart_city'],
    nameKey: 'session.zjComputing3',
    descKey: 'session.zjComputing3Desc',
    speakerKey: 'session.zjComputing3Speaker',
    startTime: '2026-07-26 16:00',
    endTime: '2026-07-26 18:00',
    room: 'Computing Lab C'
  },
  {
    id: 'session_expo_summit_1',
    venueId: 'venue_expo_ai_summit',
    trackIds: ['track_autonomous_driving', 'track_finance_ai'],
    nameKey: 'session.expoSummit1',
    descKey: 'session.expoSummit1Desc',
    speakerKey: 'session.expoSummit1Speaker',
    startTime: '2026-07-26 10:00',
    endTime: '2026-07-26 12:30',
    room: 'Summit Main Stage'
  },
  {
    id: 'session_expo_summit_2',
    venueId: 'venue_expo_ai_summit',
    trackIds: ['track_security', 'track_agriculture'],
    nameKey: 'session.expoSummit2',
    descKey: 'session.expoSummit2Desc',
    speakerKey: 'session.expoSummit2Speaker',
    startTime: '2026-07-26 14:00',
    endTime: '2026-07-26 16:30',
    room: 'Summit Side Stage'
  },
  {
    id: 'session_expo_summit_3',
    venueId: 'venue_expo_ai_summit',
    trackIds: ['track_large_models', 'track_ai_governance'],
    nameKey: 'session.expoSummit3',
    descKey: 'session.expoSummit3Desc',
    speakerKey: 'session.expoSummit3Speaker',
    startTime: '2026-07-26 17:00',
    endTime: '2026-07-26 19:00',
    room: 'Summit Main Stage'
  }
];

function getSessionById(id) {
  return SESSIONS.find(s => s.id === id) || null;
}

function getSessionsByVenue(venueId) {
  return SESSIONS.filter(s => s.venueId === venueId);
}

function getSessionsByTrack(trackId) {
  return SESSIONS.filter(s => s.trackIds.includes(trackId));
}

function getSessionsByTrackSorted(trackId) {
  return getSessionsByTrack(trackId).slice().sort((a, b) => {
    return new Date(a.startTime.replace(/-/g, '/')).getTime()
      - new Date(b.startTime.replace(/-/g, '/')).getTime();
  });
}

function getNextSessionForVenueAndTrack(venueId, trackId) {
  const sessions = getSessionsByTrack(trackId)
    .filter(s => s.venueId === venueId)
    .sort((a, b) => {
      return new Date(a.startTime.replace(/-/g, '/')).getTime()
        - new Date(b.startTime.replace(/-/g, '/')).getTime();
    });
  return sessions[0] || null;
}

function getSessionsOnSameFloor(venueId) {
  const { getVenueById } = require('./venues');
  const venue = getVenueById(venueId);
  if (!venue) return [];
  const { VENUES } = require('./venues');
  const sameFloorVenueIds = VENUES
    .filter(v => v.locationId === venue.locationId && v.floor === venue.floor)
    .map(v => v.id);
  return SESSIONS.filter(s => sameFloorVenueIds.includes(s.venueId));
}

module.exports = {
  SESSIONS,
  getSessionById,
  getSessionsByVenue,
  getSessionsByTrack,
  getSessionsByTrackSorted,
  getNextSessionForVenueAndTrack,
  getSessionsOnSameFloor
};
