const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const autoRefreshToggle = document.getElementById("autoRefresh");
const themeToggle = document.getElementById("themeToggle");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const saveSettings = document.getElementById("saveSettings");
const openWeatherKeyInput = document.getElementById("openWeatherKeyInput");

const aqiValueEl = document.getElementById("aqiValue");
const aqiCategoryEl = document.getElementById("aqiCategory");
const pm25El = document.getElementById("pm25");
const pm10El = document.getElementById("pm10");
const aqiCanvas = document.getElementById("aqiChart");

const temperatureEl = document.getElementById("temperature");
const windEl = document.getElementById("wind");
const locInfoEl = document.getElementById("locInfo");

const energyValueEl = document.getElementById("energyValue");
const energyCanvas = document.getElementById("energyChart");
const recyclingRateEl = document.getElementById("recyclingRate");
const wasteCanvas = document.getElementById("wasteChart");

const tubeStatusEl = document.getElementById("tubeStatus");
const busesStatusEl = document.getElementById("busesStatus");
const bikesStatusEl = document.getElementById("bikesStatus");

// state
let map;
let markerLayer = null;
let autoRefreshInterval = null;
let settings = { openWeatherKey: localStorage.getItem("openWeatherKey") || "" };

// apply saved key to modal input
openWeatherKeyInput.value = settings.openWeatherKey;

// Map initialization
function initMap() {
  map = L.map("map").setView([20.59,78.96], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}
function centerMap(lat, lon, label) {
  map.setView([lat, lon], 11);
  if (markerLayer) markerLayer.clearLayers();
  L.marker([lat, lon]).addTo(markerLayer).bindPopup(label || "Location").openPopup();
}

// Minimal helper: set AQI styles
function setAQIStylesByValue(aqiVal) {
  
  aqiCategoryEl.className = "aqi-label";
  aqiValueEl.className = "aqi-number";

  if (aqiVal == null || isNaN(aqiVal)) {
    aqiCategoryEl.textContent = "N/A";
    return;
  }
  if (aqiVal <= 50) { aqiCategoryEl.classList.add("good"); aqiValueEl.classList.add("good"); }
  else if (aqiVal <= 100) { aqiCategoryEl.classList.add("moderate"); aqiValueEl.classList.add("moderate"); }
  else if (aqiVal <= 200) { aqiCategoryEl.classList.add("unhealthy"); aqiValueEl.classList.add("unhealthy"); }
  else { aqiCategoryEl.classList.add("very"); aqiValueEl.classList.add("very"); }
}

// Charts
let aqiChart = null;
function updateAQChart(values, labels) {
  const ctx = aqiCanvas.getContext("2d");
  if (aqiChart) aqiChart.destroy();
  aqiChart = new Chart(ctx, {
    type: "line",
    data: { labels: labels, datasets: [{ data: values, borderWidth: 2, tension: 0.25 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { display: false } } }
  });
}

let energyChart = null;
function updateEnergyChart(values, labels) {
  const ctx = energyCanvas.getContext("2d");
  if (energyChart) energyChart.destroy();
  energyChart = new Chart(ctx, {
    type: "bar",
    data: { labels: labels, datasets: [{ data: values }] },
    options: { plugins: { legend: { display: false } } }
  });
}

let wasteChart = null;
function updateWasteChart(values) {
  const ctx = wasteCanvas.getContext("2d");
  if (wasteChart) wasteChart.destroy();
  wasteChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ["Recycled", "Other"], datasets: [{ data: values }] },
    options: { plugins: { legend: { position: "bottom" } } }
  });
}

// Geocoding (Nominatim)
async function geocodeCity(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.length) return null;
    return { lat: data[0].lat, lon: data[0].lon, display_name: data[0].display_name };
  } catch (e) {
    return null;
  }
}

// Weather (Open-Meteo)
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.current_weather) {
      temperatureEl.textContent = Math.round(data.current_weather.temperature) + "°C";
      windEl.textContent = `Wind: ${data.current_weather.windspeed} m/s`;
    } else {
      temperatureEl.textContent = "—";
      windEl.textContent = "—";
    }
  } catch (e) {
    temperatureEl.textContent = "—";
    windEl.textContent = "—";
  }
}

// AQI (Open-Meteo Air Quality)
async function fetchAQ(lat, lon) {
  if (!settings.openWeatherKey) {
    // open-meteo air-quality doesn't need a key; we use open-meteo's air-quality API
  }
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,us_aqi`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!data || !data.hourly || !data.hourly.time || !data.hourly.us_aqi) {
      pm25El.textContent = "N/A"; pm10El.textContent = "N/A"; aqiValueEl.textContent = "N/A"; aqiCategoryEl.textContent = "N/A";
      updateAQChart([], []);
      return;
    }

    const times = data.hourly.time.map(t => new Date(t).getTime());
    const now = Date.now();
    let idx = 0, minDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(times[i] - now);
      if (diff < minDiff) { minDiff = diff; idx = i; }
    }

    const pm25 = (data.hourly.pm2_5 && data.hourly.pm2_5[idx] != null) ? data.hourly.pm2_5[idx] : null;
    const pm10 = (data.hourly.pm10 && data.hourly.pm10[idx] != null) ? data.hourly.pm10[idx] : null;
    const aqi = (data.hourly.us_aqi && data.hourly.us_aqi[idx] != null) ? data.hourly.us_aqi[idx] : null;

    pm25El.textContent = pm25 != null ? pm25.toFixed(1) : "N/A";
    pm10El.textContent = pm10 != null ? pm10.toFixed(1) : "N/A";
    aqiValueEl.textContent = aqi != null ? Math.round(aqi) : "N/A";
    aqiCategoryEl.textContent = aqi == null ? "N/A" : (aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 200 ? "Unhealthy" : "Very Unhealthy");
    setAQIStylesByValue(aqi);

    const labels = [];
    const series = [];
    for (let i = Math.max(0, idx - 3); i <= idx; i++) {
      if (data.hourly.time[i] == null || data.hourly.us_aqi[i] == null) continue;
      labels.push(new Date(times[i]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      series.push(data.hourly.us_aqi[i]);
    }
    updateAQChart(series, labels);
  } catch (e) {
    pm25El.textContent = "N/A"; pm10El.textContent = "N/A"; aqiValueEl.textContent = "N/A"; aqiCategoryEl.textContent = "N/A";
    updateAQChart([], []);
  }
}

// Energy (World Bank) — fallback simulated if not available
async function fetchEnergyData(lat, lon) {
  const energyEl = energyValueEl;
  try {
    const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&addressdetails=1`;
    const revRes = await fetch(revUrl, { cache: "no-store" });
    const revJson = await revRes.json();
    const countryCode = revJson.address?.country_code?.toUpperCase() || "IN";
    const wbUrl = `https://api.worldbank.org/v2/country/${countryCode}/indicator/EG.USE.PCAP.KG.OE?format=json&per_page=200`;
    const wbRes = await fetch(wbUrl, { cache: "no-store" });
    const wbJson = await wbRes.json();
    const series = wbJson[1] || [];
    let latest = series.find(s => s.value !== null);
    if (!latest) {
      energyEl.textContent = "—";
      updateEnergyChart([900,1000,1100], ["2019","2020","2021"]);
      return;
    }
    const valueKgOE = latest.value;
    const valueKWh = Math.round(valueKgOE * 11.63);
    energyEl.textContent = `${valueKWh} kWh/person (${latest.date})`;
    const years = []; const vals = [];
    for (const entry of series) {
      if (entry.value != null) { years.push(entry.date); vals.push(Math.round(entry.value * 11.63)); }
      if (years.length >= 3) break;
    }
    updateEnergyChart(vals.reverse(), years.reverse());
  } catch (e) {
    energyEl.textContent = "—";
    updateEnergyChart([900,1000,1100], ["2019","2020","2021"]);
  }
}

// Waste (simulated)
async function fetchWasteData() {
  const value = Math.floor(Math.random() * 40) + 30;
  recyclingRateEl.textContent = value + "%";
  updateWasteChart([value, 100 - value]);
}

// Transport (simulated)
async function fetchTransportStatus() {
  tubeStatusEl.textContent = "Good"; tubeStatusEl.className = "status-text status-good";
  busesStatusEl.textContent = "Delay"; busesStatusEl.className = "status-text status-delay";
  bikesStatusEl.textContent = "Available"; bikesStatusEl.className = "status-text status-good";
}

// Main search function
async function searchCity(query) {
  if (!query) return;
  const geo = await geocodeCity(query);
  if (!geo) return alert("City not found");
  const { lat, lon, display_name } = geo;
  locInfoEl.textContent = display_name;
  centerMap(lat, lon, display_name);
  await Promise.all([
    fetchWeather(lat, lon),
    fetchAQ(lat, lon),
    fetchEnergyData(lat, lon),
    fetchWasteData(),
    fetchTransportStatus()
  ]);
  localStorage.setItem("lastCity", query);
}

// Event wiring
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  const last = localStorage.getItem("lastCity");
  if (last) { cityInput.value = last; searchCity(last); }
  else { cityInput.value = "Delhi"; searchCity("Delhi"); }
});

searchBtn.onclick = () => searchCity(cityInput.value.trim());
cityInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchCity(cityInput.value.trim()); });

// Theme toggle — toggle at root to match .dark CSS
themeToggle.onclick = () => document.documentElement.classList.toggle("dark");

// Auto-refresh (5 minutes)
autoRefreshToggle.onchange = () => {
  if (autoRefreshToggle.checked) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
      const q = cityInput.value.trim();
      if (q) searchCity(q);
    }, 5 * 60 * 1000);
  } else {
    if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
  }
};

// Settings modal (OpenWeather key only — we keep it for future use)
settingsBtn.onclick = () => settingsModal.classList.remove("hidden");
closeSettings.onclick = () => settingsModal.classList.add("hidden");
saveSettings.onclick = () => {
  settings.openWeatherKey = openWeatherKeyInput.value.trim();
  localStorage.setItem("openWeatherKey", settings.openWeatherKey);
  settingsModal.classList.add("hidden");
};