/**
 * Mock dataset: 3 locations & 4 venues (三地四馆)
 * Locations: West Bund, Zhangjiang, Expo Center
 * Venues: 4 distinct halls across these locations
 */

const LOCATIONS = {
  westBund: {
    id: 'loc_west_bund',
    nameKey: 'location.westBund',
    coords: { lat: 31.1865, lng: 121.4568 },
    color: '#2359BE'
  },
  zhangjiang: {
    id: 'loc_zhangjiang',
    nameKey: 'location.zhangjiang',
    coords: { lat: 31.2042, lng: 121.6015 },
    color: '#A234D5'
  },
  expoCenter: {
    id: 'loc_expo',
    nameKey: 'location.expoCenter',
    coords: { lat: 31.1943, lng: 121.4755 },
    color: '#4A7FD4'
  }
};

const VENUES = [
  {
    id: 'venue_west_bund_ai_life',
    locationId: 'loc_west_bund',
    nameKey: 'venue.westBundAiLife',
    descKey: 'venue.westBundAiLifeDesc',
    floor: 1,
    hall: 'Hall A',
    position3d: { x: -4, y: 0.5, z: 2 },
    addressKey: 'address.westBund'
  },
  {
    id: 'venue_west_bund_media',
    locationId: 'loc_west_bund',
    nameKey: 'venue.westBundMedia',
    descKey: 'venue.westBundMediaDesc',
    floor: 2,
    hall: 'Hall B',
    position3d: { x: -3, y: 1.5, z: 1 },
    addressKey: 'address.westBund'
  },
  {
    id: 'venue_zhangjiang_computing',
    locationId: 'loc_zhangjiang',
    nameKey: 'venue.zhangjiangComputing',
    descKey: 'venue.zhangjiangComputingDesc',
    floor: 1,
    hall: 'Computing Hall',
    position3d: { x: 4, y: 0.5, z: -2 },
    addressKey: 'address.zhangjiang'
  },
  {
    id: 'venue_expo_ai_summit',
    locationId: 'loc_expo',
    nameKey: 'venue.expoAiSummit',
    descKey: 'venue.expoAiSummitDesc',
    floor: 1,
    hall: 'Main Summit Hall',
    position3d: { x: 0, y: 0.5, z: -4 },
    addressKey: 'address.expoCenter'
  }
];

/**
 * Metro route graph for cross-venue navigation
 * Nodes represent stations; edges represent line segments with travel time
 */
const METRO_STATIONS = {
  west_bund: {
    id: 'st_west_bund',
    nameKey: 'metro.westBundStation',
    line: 'Line 11',
    coords: { lat: 31.1865, lng: 121.4568 }
  },
  longyang_road: {
    id: 'st_longyang',
    nameKey: 'metro.longyangRoad',
    line: 'Line 2 / Line 16 / Line 18 / Maglev',
    coords: { lat: 31.2035, lng: 121.5578 }
  },
  zhangjiang: {
    id: 'st_zhangjiang',
    nameKey: 'metro.zhangjiangStation',
    line: 'Line 2',
    coords: { lat: 31.2042, lng: 121.6015 }
  },
  expo_center: {
    id: 'st_expo',
    nameKey: 'metro.expoStation',
    line: 'Line 8',
    coords: { lat: 31.1943, lng: 121.4755 }
  },
  lu_jiazui: {
    id: 'st_lujiazui',
    nameKey: 'metro.lujiazui',
    line: 'Line 2',
    coords: { lat: 31.2397, lng: 121.4998 }
  }
};

const METRO_EDGES = [
  { from: 'st_west_bund', to: 'st_expo', lineKey: 'metro.line11', durationMin: 8, transfer: false },
  { from: 'st_expo', to: 'st_west_bund', lineKey: 'metro.line11', durationMin: 8, transfer: false },
  { from: 'st_west_bund', to: 'st_lujiazui', lineKey: 'metro.line11', durationMin: 15, transfer: false },
  { from: 'st_lujiazui', to: 'st_longyang', lineKey: 'metro.line2', durationMin: 20, transfer: true, transferAtKey: 'metro.lujiazui' },
  { from: 'st_longyang', to: 'st_zhangjiang', lineKey: 'metro.line2', durationMin: 12, transfer: false },
  { from: 'st_zhangjiang', to: 'st_longyang', lineKey: 'metro.line2', durationMin: 12, transfer: false },
  { from: 'st_expo', to: 'st_lujiazui', lineKey: 'metro.line2', durationMin: 10, transfer: false }
];

/** Map venue to nearest metro station */
const VENUE_METRO_MAP = {
  venue_west_bund_ai_life: 'st_west_bund',
  venue_west_bund_media: 'st_west_bund',
  venue_zhangjiang_computing: 'st_zhangjiang',
  venue_expo_ai_summit: 'st_expo'
};

/** Location ID to 3D cluster center for route line rendering */
const LOCATION_3D_CENTERS = {
  loc_west_bund: { x: -3.5, y: 1, z: 1.5 },
  loc_zhangjiang: { x: 4, y: 1, z: -2 },
  loc_expo: { x: 0, y: 1, z: -4 }
};

function getVenueById(id) {
  return VENUES.find(v => v.id === id) || null;
}

function getVenuesByLocation(locationId) {
  return VENUES.filter(v => v.locationId === locationId);
}

function getLocationById(id) {
  return Object.values(LOCATIONS).find(l => l.id === id) || null;
}

module.exports = {
  LOCATIONS,
  VENUES,
  METRO_STATIONS,
  METRO_EDGES,
  VENUE_METRO_MAP,
  LOCATION_3D_CENTERS,
  getVenueById,
  getVenuesByLocation,
  getLocationById
};
