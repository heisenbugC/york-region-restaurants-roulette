export class I18nManager {
  constructor(initialLang = "zh_CN") {
    this.currentLang = initialLang;
    this.dictionary = {};
    this.subscribers = [];
  }

  async load() {
    const res = await fetch("./locales.json");
    this.dictionary = await res.json();
    this.applyTranslations();
  }

  setLanguage(lang) {
    if (!this.dictionary[lang]) return;
    this.currentLang = lang;
    this.applyTranslations();
    this.subscribers.forEach(cb => cb(this.currentLang));
  }

  t(key) {
    return this.dictionary[this.currentLang]?.[key] || key;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (this.t(key)) el.textContent = this.t(key);
    });
  }
}