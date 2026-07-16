Component({
  properties: {
    locale: {
      type: String,
      value: 'zh'
    }
  },

  methods: {
    onToggle() {
      const next = this.data.locale === 'zh' ? 'en' : 'zh';
      this.triggerEvent('localechange', { locale: next });
    }
  }
});
