Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    venues: {
      type: Array,
      value: []
    },
    fromVenueId: {
      type: String,
      value: ''
    },
    toVenueId: {
      type: String,
      value: ''
    },
    routeResult: {
      type: Object,
      value: null
    },
    labels: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onSelectFrom(e) {
      this.triggerEvent('selectfrom', { venueId: e.currentTarget.dataset.id });
    },

    onSelectTo(e) {
      this.triggerEvent('selectto', { venueId: e.currentTarget.dataset.id });
    },

    onCalculate() {
      this.triggerEvent('calculate');
    },

    onClear() {
      this.triggerEvent('clear');
    }
  }
});
