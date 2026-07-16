/**
 * Cross-venue metro routing using Dijkstra's algorithm
 * Finds optimal public transit path between two venues
 */
const {
  METRO_STATIONS,
  METRO_EDGES,
  VENUE_METRO_MAP,
  LOCATION_3D_CENTERS,
  getVenueById
} = require('../data/venues');

/**
 * Build adjacency list from metro edge data
 */
function buildGraph() {
  const graph = {};

  Object.keys(METRO_STATIONS).forEach(key => {
    graph[METRO_STATIONS[key].id] = [];
  });

  METRO_EDGES.forEach(edge => {
    graph[edge.from].push({
      to: edge.to,
      duration: edge.durationMin,
      lineKey: edge.lineKey,
      transfer: edge.transfer || false,
      transferAtKey: edge.transferAtKey || null
    });
  });

  return graph;
}

/**
 * Dijkstra shortest path by travel time (minutes)
 * @param {string} startStationId
 * @param {string} endStationId
 * @returns {{ path: string[], totalMinutes: number, steps: Array } | null}
 */
function findShortestPath(startStationId, endStationId) {
  if (startStationId === endStationId) {
    return { path: [startStationId], totalMinutes: 0, steps: [] };
  }

  const graph = buildGraph();
  const dist = {};
  const prev = {};
  const visited = new Set();

  Object.keys(graph).forEach(id => {
    dist[id] = Infinity;
    prev[id] = null;
  });
  dist[startStationId] = 0;

  while (visited.size < Object.keys(graph).length) {
    let minNode = null;
    let minDist = Infinity;

    Object.keys(dist).forEach(id => {
      if (!visited.has(id) && dist[id] < minDist) {
        minDist = dist[id];
        minNode = id;
      }
    });

    if (minNode === null || minDist === Infinity) break;
    visited.add(minNode);

    if (minNode === endStationId) break;

    graph[minNode].forEach(neighbor => {
      const alt = dist[minNode] + neighbor.duration;
      if (alt < dist[neighbor.to]) {
        dist[neighbor.to] = alt;
        prev[neighbor.to] = { from: minNode, edge: neighbor };
      }
    });
  }

  if (dist[endStationId] === Infinity) return null;

  // Reconstruct path
  const path = [];
  const steps = [];
  let current = endStationId;

  while (current !== null) {
    path.unshift(current);
    const p = prev[current];
    if (p) {
      steps.unshift({
        from: p.from,
        to: current,
        durationMin: p.edge.duration,
        lineKey: p.edge.lineKey,
        transfer: p.edge.transfer,
        transferAtKey: p.edge.transferAtKey
      });
    }
    current = p ? p.from : null;
  }

  return {
    path,
    totalMinutes: dist[endStationId],
    steps
  };
}

/**
 * Get station object by ID
 */
function getStationById(stationId) {
  return Object.values(METRO_STATIONS).find(s => s.id === stationId) || null;
}

/**
 * Plan route between two venues with human-readable instructions
 * @param {string} fromVenueId
 * @param {string} toVenueId
 * @param {Function} t - i18n translate function
 */
function planCrossVenueRoute(fromVenueId, toVenueId, t) {
  const fromVenue = getVenueById(fromVenueId);
  const toVenue = getVenueById(toVenueId);

  if (!fromVenue || !toVenue) return null;

  const startStation = VENUE_METRO_MAP[fromVenueId];
  const endStation = VENUE_METRO_MAP[toVenueId];

  if (!startStation || !endStation) return null;

  const startStationObj = getStationById(startStation);
  const endStationObj = getStationById(endStation);

  const instructions = [];

  // Walk to metro from origin
  instructions.push({
    type: 'walk',
    text: t('crossVenue.walkToMetro', { station: t(startStationObj.nameKey) }),
    durationMin: 5
  });

  let routeResult;
  if (fromVenue.locationId === toVenue.locationId) {
    // Same location – no metro needed, just walk
    routeResult = { path: [startStation], totalMinutes: 0, steps: [] };
    instructions.push({
      type: 'walk',
      text: t(toVenue.nameKey),
      durationMin: 10
    });
  } else {
    routeResult = findShortestPath(startStation, endStation);

    if (!routeResult) return null;

    routeResult.steps.forEach(step => {
      if (step.transfer && step.transferAtKey) {
        instructions.push({
          type: 'transfer',
          text: t('crossVenue.transfer', { station: t(step.transferAtKey) }),
          durationMin: 3
        });
      }
      instructions.push({
        type: 'metro',
        text: t('crossVenue.takeLine', { line: t(step.lineKey) }),
        durationMin: step.durationMin,
        from: step.from,
        to: step.to
      });
    });
  }

  // Walk from metro to destination
  instructions.push({
    type: 'walk',
    text: t('crossVenue.walkToMetro', { station: t(endStationObj.nameKey) }),
    durationMin: 5
  });

  const walkTime = instructions
    .filter(i => i.type === 'walk')
    .reduce((sum, i) => sum + i.durationMin, 0);

  const totalMinutes = (routeResult ? routeResult.totalMinutes : 0) + walkTime;

  // 3D route line points for visual overlay
  const routeLine3D = buildRouteLine3D(fromVenue, toVenue, routeResult);

  return {
    fromVenueId,
    toVenueId,
    fromVenue,
    toVenue,
    totalMinutes,
    instructions,
    metroPath: routeResult ? routeResult.path : [],
    routeLine3D
  };
}

/**
 * Build 3D polyline points connecting two venue clusters via metro path
 * Creates an arc above the ground plane for visual clarity
 */
function buildRouteLine3D(fromVenue, toVenue, routeResult) {
  const points = [];

  const startCenter = LOCATION_3D_CENTERS[fromVenue.locationId] || fromVenue.position3d;
  const endCenter = LOCATION_3D_CENTERS[toVenue.locationId] || toVenue.position3d;

  points.push({ ...fromVenue.position3d, y: fromVenue.position3d.y + 0.5 });
  points.push({ ...startCenter, y: 2.5 });

  if (routeResult && routeResult.path.length > 2) {
    // Add intermediate metro hop visualization points
    const midCount = routeResult.path.length - 2;
    for (let i = 1; i <= midCount; i++) {
      const t = i / (midCount + 1);
      points.push({
        x: startCenter.x + (endCenter.x - startCenter.x) * t,
        y: 3 + Math.sin(t * Math.PI) * 1.5, // arc height
        z: startCenter.z + (endCenter.z - startCenter.z) * t
      });
    }
  }

  points.push({ ...endCenter, y: 2.5 });
  points.push({ ...toVenue.position3d, y: toVenue.position3d.y + 0.5 });

  return points;
}

module.exports = {
  buildGraph,
  findShortestPath,
  getStationById,
  planCrossVenueRoute,
  buildRouteLine3D
};
