Component({
  properties: {
    activeMode: {
      type: String,
      value: 'venue'
    },
    labels: {
      type: Object,
      value: { venue: 'Venue', track: 'Track' }
    }
  },

  methods: {
    onVenueTap() {
      if (this.data.activeMode !== 'venue') {
        this.triggerEvent('modechange', { mode: 'venue' });
      }
    },
    onTrackTap() {
      if (this.data.activeMode !== 'track') {
        this.triggerEvent('modechange', { mode: 'track' });
      }
    }
  }
});
