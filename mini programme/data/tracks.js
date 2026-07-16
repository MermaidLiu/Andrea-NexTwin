/**
 * 17 official WAIC thematic tracks
 */
const TRACKS = [
  { id: 'track_ai_ethics', nameKey: 'track.aiEthics', color: '#ef4444' },
  { id: 'track_large_models', nameKey: 'track.largeModels', color: '#2359BE' },
  { id: 'track_robotics', nameKey: 'track.robotics', color: '#f59e0b' },
  { id: 'track_autonomous_driving', nameKey: 'track.autonomousDriving', color: '#10b981' },
  { id: 'track_healthcare_ai', nameKey: 'track.healthcareAi', color: '#ec4899' },
  { id: 'track_finance_ai', nameKey: 'track.financeAi', color: '#06b6d4' },
  { id: 'track_education_ai', nameKey: 'track.educationAi', color: '#6366f1' },
  { id: 'track_smart_city', nameKey: 'track.smartCity', color: '#14b8a6' },
  { id: 'track_manufacturing', nameKey: 'track.manufacturing', color: '#f97316' },
  { id: 'track_agriculture', nameKey: 'track.agriculture', color: '#84cc16' },
  { id: 'track_energy', nameKey: 'track.energy', color: '#eab308' },
  { id: 'track_security', nameKey: 'track.security', color: '#dc2626' },
  { id: 'track_nlp', nameKey: 'track.nlp', color: '#A234D5' },
  { id: 'track_computer_vision', nameKey: 'track.computerVision', color: '#0ea5e9' },
  { id: 'track_quantum_ai', nameKey: 'track.quantumAi', color: '#7c3aed' },
  { id: 'track_embodied_ai', nameKey: 'track.embodiedAi', color: '#d946ef' },
  { id: 'track_ai_governance', nameKey: 'track.aiGovernance', color: '#64748b' }
];

function getTrackById(id) {
  return TRACKS.find(t => t.id === id) || null;
}

module.exports = {
  TRACKS,
  getTrackById
};
