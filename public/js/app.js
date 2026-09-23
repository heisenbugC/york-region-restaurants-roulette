import { I18nManager } from "./i18n.js";
import { DetailPanel } from "./detail-panel.js";
import { RouletteWheel, WheelState } from "./wheel.js";

const layout = document.getElementById("app-layout");
const pageTitle = document.getElementById("page-title");
const liveIndicator = document.getElementById("live-indicator");
const statePrompt = document.getElementById("state-prompt");
const filterSelect = document.getElementById("filter-select");
const langSelect = document.getElementById("lang-select");

const i18n = new I18nManager("zh_CN");
const detailPanel = new DetailPanel(document.getElementById("detail-panel"), i18n);


let restaurants = [];
let selectedRestaurant = null;

function setWheelStopped(stopped) {
  layout.classList.toggle("is-stopped", stopped);
}

async function loadRestaurants() {
  const municipality = filterSelect.value;
  setWheelStopped(false);
  selectedRestaurant = null;

  try {
    const res = await fetch(`./api/restaurants?municipality=${encodeURIComponent(municipality)}`);
    if (!res.ok) throw new Error(`Restaurant request failed with ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Restaurant response was not an array");
    restaurants = data;
    wheel.setData(restaurants, i18n.currentLang);
  } catch (err) {
    console.error("Failed to load restaurants:", err);
    restaurants = [];
    wheel.setData([], i18n.currentLang);
    statePrompt.textContent = i18n.t("loadError");
  }
}

const wheel = new RouletteWheel(
  document.getElementById("roulette"),
  (activeRestaurant) => {
    const isZH = i18n.currentLang === "zh_CN";
    liveIndicator.textContent = (isZH && activeRestaurant.name_zh) ? activeRestaurant.name_zh : activeRestaurant.name_en;
  },
  (winner) => {
    if (wheel.state !== WheelState.STOPPED) return;
    selectedRestaurant = winner;
    setWheelStopped(true);
    statePrompt.textContent = i18n.t("statusStopped");
    detailPanel.show(winner);
  },
  () => {
    selectedRestaurant = null;
    setWheelStopped(false);
    statePrompt.textContent = i18n.t("statusMoving");
  }
);

langSelect.addEventListener("change", (e) => {
  i18n.setLanguage(e.target.value);
});

i18n.subscribe((lang) => {
  if (pageTitle) pageTitle.textContent = i18n.t("title");
  wheel.setLanguage(lang);
  if (selectedRestaurant) detailPanel.show(selectedRestaurant);
});

filterSelect.addEventListener("change", loadRestaurants);

// Initialize
(async () => {
  await i18n.load();
  statePrompt.textContent = i18n.t("statusMoving");
  await loadRestaurants();
})();