Component({
  properties: {
    tracks: {
      type: Array,
      value: []
    },
    selectedTrackId: {
      type: String,
      value: ''
    },
    selectedTrackName: {
      type: String,
      value: ''
    },
    activeCount: {
      type: Number,
      value: 0
    },
    activeCountLabel: {
      type: String,
      value: ''
    },
    sessions: {
      type: Array,
      value: []
    },
    labels: {
      type: Object,
      value: {}
    },
    expanded: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    onToggleExpand() {
      this.triggerEvent('toggleexpand');
    },

    onSelectTrack(e) {
      const trackId = e.currentTarget.dataset.id;
      this.triggerEvent('trackselect', { trackId });
    },

    onSessionTap(e) {
      this.triggerEvent('sessionselect', { sessionId: e.currentTarget.dataset.id });
    }
  }
});
