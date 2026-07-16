Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    sessions: {
      type: Array,
      value: []
    },
    currentIndex: {
      type: Number,
      value: 0
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

    onSwiperChange(e) {
      this.triggerEvent('swiperchange', { index: e.detail.current });
    },

    onToggleWishlist(e) {
      this.triggerEvent('togglewishlist', { sessionId: e.currentTarget.dataset.id });
    },

    preventMove() {
      return false;
    }
  }
});
