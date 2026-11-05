/*
 * season-overlay-card.js  (v1.6.0)
 * Dezentes Vollbild-Overlay für Home Assistant (Dashboard bleibt sichtbar und bedienbar):
 *  - Jahreszeiten: Herbst = Laub, Frühling = Blüten, Winter = funkelnde Eiskristalle
 *  - Wetter: Regen, Schnee, Hagel, Wolken & Nebel an den Bildschirmrändern,
 *            Sterne bei klarer Nacht, Mond mit Mondphase, Blitz-Aufhellen bei Gewitter
 *  - Sonnenstrahlen bei "sunny" (tagsüber), Windböen bei Wind
 *  - Frost: vereiste Ränder, wenn die Außentemperatur (Wetterstation oder Wetter-Entity) friert
 *  - Feiertage/Bräuche (Bayern): Neujahr/Silvester, Heilige Drei Könige, Valentinstag,
 *    Fasching, Ostern, Halloween, Martini, Nikolaus, Advent/Weihnachten
 * Beim Antippen blendet der Effekt aus und kommt nach X Minuten wieder.
 */

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const RAIN_STATES = ['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy'];
const SNOW_STATES = ['snowy', 'snowy-rainy'];

const LEAF_COLORS = ['#c2571a', '#d98324', '#b33a1d', '#e0a526', '#8c5a2b', '#a8431f'];
const PETAL_COLORS = ['#ffd6e5', '#ffc2d6', '#fff0f5', '#ffffff', '#f7b6cc', '#e3d4f5'];
const STAR_COLORS = ['#ffd54a', '#ffe082', '#fff3b0'];

// Wolken je Wetter: Farbton (RGB), Anzahl am oberen / unteren Rand (bei ca. 1400 px Breite)
const CLOUD_DEFS = {
  partlycloudy: { tone: '232,238,245', top: 3, bottom: 0 },
  cloudy: { tone: '176,184,195', top: 6, bottom: 3 },
  rainy: { tone: '140,148,160', top: 7, bottom: 3 },
  'snowy-rainy': { tone: '165,172,184', top: 7, bottom: 3 },
  snowy: { tone: '205,212,222', top: 6, bottom: 3 },
  hail: { tone: '150,158,170', top: 6, bottom: 3 },
  pouring: { tone: '108,115,128', top: 8, bottom: 4 },
  lightning: { tone: '100,106,120', top: 8, bottom: 4 },
  'lightning-rainy': { tone: '100,106,120', top: 8, bottom: 4 },
};

// Feiertage / Bräuche: welche Figuren fallen, in welchen Farben
const HOLIDAYS = {
  neujahr: { kinds: ['confetti', 'confetti', 'confetti', 'star'], colors: ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb'] },
  dreikoenig: { kinds: ['star', 'star', 'crown'], colors: ['#ffd54a'] },
  valentin: { kinds: ['heart'], colors: ['#e53935', '#ec407a', '#f48fb1', '#ff8a80'] },
  fasching: { kinds: ['confetti', 'confetti', 'confetti', 'star'], colors: ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb'] },
  ostern: { kinds: ['egg'], colors: ['#f48fb1', '#81d4fa', '#ffe082', '#a5d6a7', '#ce93d8'] },
  halloween: { kinds: ['pumpkin'], colors: ['#ef6c00'] },
  martini: { kinds: ['lantern'], colors: ['#e53935', '#fb8c00', '#43a047', '#1e88e5'] },
  nikolaus: { kinds: ['nikolaus', 'nikolaus', 'star'], colors: ['#ffd54a'] },
  weihnachten: { kinds: ['tree', 'tree', 'star', 'gift', 'star'], colors: ['#e53935', '#43a047', '#1e88e5', '#ffd54a'] },
};
const KIND_SIZES = {
  tree: [8, 11], nikolaus: [9, 12], star: [5, 8], gift: [5, 7], egg: [6, 9],
  confetti: [4, 6], heart: [5, 8], pumpkin: [7, 10], lantern: [7, 10], crown: [6, 9],
};
// Figuren, die aufrecht bleiben (sanftes Pendeln statt Drehen/Wenden)
const UPRIGHT = new Set(['tree', 'nikolaus', 'gift', 'egg', 'heart', 'pumpkin', 'lantern', 'crown']);

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function seasonFromDate() {
  const m = new Date().getMonth(); // 0 = Januar (meteorologisch, Nordhalbkugel)
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

// Liefert den Schlüssel des aktuellen Feiertags/Brauchs (Bayern) oder null
function holidayFor(d) {
  const y = d.getFullYear();
  const dayNum = (dt) => Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000;
  const today = dayNum(d);
  const md = (d.getMonth() + 1) * 100 + d.getDate();

  if (md === 1231 || md === 101) return 'neujahr';
  if (md === 105 || md === 106) return 'dreikoenig';
  if (md === 1205 || md === 1206) return 'nikolaus';

  // 1. Advent = vierter Sonntag vor dem 25.12. (bzw. 4. Advent minus 21 Tage)
  const dec24 = new Date(y, 11, 24);
  const fourth = new Date(y, 11, 24 - dec24.getDay());
  const first = dayNum(fourth) - 21;
  if (today >= first && md <= 1226) return 'weihnachten';

  if (md === 213 || md === 214) return 'valentin';

  const easter = dayNum(easterSunday(y));
  if (today >= easter - 53 && today <= easter - 47) return 'fasching'; // Weiberfasching bis Faschingsdienstag
  if (today >= easter - 7 && today <= easter + 1) return 'ostern'; // Palmsonntag bis Ostermontag

  if (md >= 1029 && md <= 1031) return 'halloween';
  if (md === 1110 || md === 1111) return 'martini';
  return null;
}

const BIRTHDAY_COLORS = ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb', '#ff9100'];

// Hat heute jemand aus der Liste Geburtstag? Datum als 'MM-DD' oder 'TT.MM.'
function birthdayToday(list, d) {
  if (!Array.isArray(list)) return null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const b of list) {
    const raw = String((b && b.date) || '').trim();
    let m;
    let dd;
    let r;
    if ((r = raw.match(/^(\d{1,2})-(\d{1,2})$/))) {
      m = +r[1];
      dd = +r[2];
    } else if ((r = raw.match(/^(\d{1,2})\.(\d{1,2})\.?$/))) {
      dd = +r[1];
      m = +r[2];
    } else continue;
    if (m === month && dd === day) return b.name || true;
  }
  return null;
}

// ---------- Zeichenfunktionen ----------
function drawLeaf(ctx, s, color) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.8, s * 0.5, 0, s);
  ctx.bezierCurveTo(-s * 0.8, s * 0.5, -s * 0.9, -s * 0.5, 0, -s);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0, s * 1.15);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(0.6, s * 0.06);
  ctx.stroke();
}

function drawPetal(ctx, s, color) {
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFlower(ctx, s, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 5);
    ctx.translate(0, -s * 0.55);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.38, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd54a';
  ctx.fill();
}

function drawTree(ctx, s) {
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(-s * 0.1, s * 0.85, s * 0.2, s * 0.3);
  const cols = ['#2e7d32', '#388e3c', '#43a047'];
  for (let i = 0; i < 3; i++) {
    const top = -s + i * s * 0.55;
    const bw = s * (0.45 + i * 0.25);
    const by = top + s * 0.85;
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(bw, by);
    ctx.lineTo(-bw, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffd54a';
  ctx.beginPath();
  ctx.arc(0, -s, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  const dots = [[-0.25, -0.2, '#e53935'], [0.3, 0.3, '#ffd54a'], [-0.4, 0.6, '#42a5f5'], [0.1, 0.75, '#e53935']];
  for (const [dx, dy, col] of dots) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStar(ctx, s, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.45 : s;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawGift(ctx, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.8, -s * 0.6, s * 1.6, s * 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-s * 0.12, -s * 0.6, s * 0.24, s * 1.2);
  ctx.fillRect(-s * 0.8, -s * 0.1, s * 1.6, s * 0.2);
}

function drawNikolaus(ctx, s) {
  // Mantel
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s);
  ctx.lineTo(-s * 0.35, s * 0.1);
  ctx.lineTo(s * 0.35, s * 0.1);
  ctx.lineTo(s * 0.55, s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.55, s * 0.9, s * 1.1, s * 0.12);
  // Bart + Gesicht
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.36, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5cba7';
  ctx.beginPath();
  ctx.arc(0, -s * 0.12, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  // Mütze
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s * 0.28);
  ctx.lineTo(s * 0.32, -s * 0.28);
  ctx.lineTo(s * 0.14, -s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.34, -s * 0.36, s * 0.68, s * 0.12);
  ctx.beginPath();
  ctx.arc(s * 0.14, -s * 0.9, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawEgg(ctx, s, color) {
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(-s, -s * 0.15, s * 2, s * 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-s, s * 0.35, s * 2, s * 0.15);
  ctx.restore();
}

function drawConfetti(ctx, s, color) {
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.5, -s * 0.25, s, s * 0.5);
}

function drawHeart(ctx, s, color) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.3, 0, -s * 0.7, -s * 0.9, 0, -s * 0.35);
  ctx.bezierCurveTo(s * 0.7, -s * 0.9, s * 1.3, 0, 0, s * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPumpkin(ctx, s) {
  ctx.fillStyle = '#ef6c00';
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f57c00';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#33691e';
  ctx.fillRect(-s * 0.1, -s * 1.05, s * 0.2, s * 0.3);
  ctx.fillStyle = '#3e2723';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.5, -s * 0.2);
    ctx.lineTo(sx * s * 0.2, -s * 0.2);
    ctx.lineTo(sx * s * 0.35, -s * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, s * 0.2);
  ctx.lineTo(s * 0.45, s * 0.2);
  ctx.lineTo(s * 0.3, s * 0.45);
  ctx.lineTo(s * 0.1, s * 0.3);
  ctx.lineTo(-s * 0.1, s * 0.45);
  ctx.lineTo(-s * 0.3, s * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawLantern(ctx, s, color) {
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.3);
  ctx.lineTo(0, -s * 0.8);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,170,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.35, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrown(ctx, s) {
  ctx.fillStyle = '#ffca28';
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.6);
  ctx.lineTo(-s, -s * 0.4);
  ctx.lineTo(-s * 0.5, s * 0.1);
  ctx.lineTo(0, -s * 0.6);
  ctx.lineTo(s * 0.5, s * 0.1);
  ctx.lineTo(s, -s * 0.4);
  ctx.lineTo(s, s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e53935';
  ctx.fillRect(-s * 0.15, s * 0.15, s * 0.3, s * 0.3);
}

const DRAW = {
  leaf: drawLeaf, petal: drawPetal, flower: drawFlower, tree: drawTree, star: drawStar,
  gift: drawGift, nikolaus: drawNikolaus, egg: drawEgg, confetti: drawConfetti,
  heart: drawHeart, pumpkin: drawPumpkin, lantern: drawLantern, crown: drawCrown,
};

class SeasonOverlayCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      season_entity: 'sensor.season', // optional, sonst Datum
      weather_entity: null, // z. B. weather.home
      intensity: 0.5, // 0..3  (Standard 0.5; 1 = doppelt so viel; weniger = dezenter)
      opacity: 0.7, // 0..1  Gesamt-Deckkraft
      pause_minutes: 3, // Pause nach Antippen
      winter_effect: 'sparkle', // Winter: 'sparkle' (funkelnde Eiskristalle), 'snow' (leichter Schnee) oder 'none'

      sun_rays: true, // Sonnenstrahlen bei "sunny"
      sun_entity: 'sun.sun', // nachts (below_horizon) keine Strahlen
      sun_side: 'auto', // auto | left | right  (auto: vormittags links, nachmittags rechts)
      ray_strength: 1, // 0..2  Helligkeit der Strahlen

      wind_effect: true, // Windböen bei "windy" / hoher Windgeschwindigkeit
      wind_speed_min: 15, // ab hier (km/h, Attribut wind_speed) leichte Böen
      wind_speed_max: 50, // ab hier volle Stärke

      sky_effects: true, // Wolken, Nebel, Hagel, Sterne, Blitz je nach Wetter
      cloud_strength: 1, // 0..2  Menge der Wolken

      moon: true, // Mond im rechten oberen Eck (abends/nachts) mit Mondphase
      moon_size: 1, // 0.5..2  Größe des Mondes
      moon_entity: null, // optional: sensor.moon (Mond-Integration); sonst Phase aus Datum berechnet

      frost_effect: true, // vereiste Ränder bei Frost
      temperature_entity: null, // optional: Temperatur-Sensor (z. B. Wetterstation); sonst Attribut "temperature" der weather_entity
      frost_temperature: 0, // ab dieser Temperatur (°C) abwärts gibt es Frost, volle Stärke 5 Grad darunter
      frost_strength: 1, // 0.3..2  Breite und Dichte der Eisränder

      holidays: true, // Feiertags-Figuren (Bayern)
      holiday_strength: 1, // 0..3  Menge der Figuren

      // Geburtstage: an diesen Tagen fallen zusätzlich Geschenke und Konfetti.
      // Beispiel: [{ date: '03-15', name: 'Anna' }, { date: '21.07.', name: 'Max' }]
      // date als 'MM-DD' oder 'TT.MM.'; standardmäßig leer (kein Effekt).
      birthdays: [],
      birthday_strength: 1, // 0..3  Menge von Geschenken und Konfetti

      z_index: 100,
      test_season: null, // zum Testen: spring|summer|autumn|winter
      test_weather: null, // zum Testen: rainy|snowy|sunny|cloudy|fog|hail|lightning|clear-night|windy|...
      test_wind: null, // zum Testen: 0..1
      test_frost: null, // zum Testen: Frost-Stärke 0..1
      test_moon: null, // zum Testen: Mondphase 0..1 (0 = Neumond, 0.25 = zunehmender Halbmond, 0.5 = Vollmond, 0.75 = abnehmender Halbmond)
      test_night: false, // zum Testen: Mond auch tagsüber zeigen
      test_birthday: false, // zum Testen: Geburtstags-Effekt jetzt zeigen
      test_holiday: null, // zum Testen: neujahr|dreikoenig|valentin|fasching|ostern|halloween|martini|nikolaus|weihnachten
      ...config,
    };
    // Kompatibilität: früheres winter_snow: false schaltet den Winter-Effekt aus
    if (config.winter_effect === undefined && config.winter_snow === false) this._config.winter_effect = 'none';
    this.style.display = 'none';
    this._season = this._config.test_season || seasonFromDate();
    this._weather = this._config.test_weather || 'none';
    this._holiday = this._currentHoliday();
    this._birthday = this._currentBirthday();
    if (this._canvas) this._rebuild();
  }

  _currentHoliday() {
    const c = this._config;
    if (c.test_holiday) return c.test_holiday;
    return c.holidays ? holidayFor(new Date()) : null;
  }

  _currentBirthday() {
    const c = this._config;
    if (c.test_birthday) return true;
    return c.birthdays ? birthdayToday(c.birthdays, new Date()) : null;
  }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    let season = c.test_season;
    if (!season && c.season_entity && hass.states[c.season_entity]) {
      season = hass.states[c.season_entity].state;
    }
    if (!SEASONS.includes(season)) season = seasonFromDate();
    let weather = c.test_weather;
    if (!weather && c.weather_entity && hass.states[c.weather_entity]) {
      weather = hass.states[c.weather_entity].state;
    }
    weather = weather || 'none';
    const holiday = this._currentHoliday();
    const birthday = this._currentBirthday();
    this._updateEnv(hass, weather);
    if (
      season !== this._season ||
      weather !== this._weather ||
      holiday !== this._holiday ||
      birthday !== this._birthday
    ) {
      this._season = season;
      this._weather = weather;
      this._holiday = holiday;
      this._birthday = birthday;
      this._rebuild();
    }
  }

  getCardSize() {
    return 0;
  }

  connectedCallback() {
    if (this._canvas) return;
    const c = document.createElement('canvas');
    c.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;' +
      `z-index:${this._config ? this._config.z_index : 100};`;
    document.body.appendChild(c);
    this._canvas = c;
    this._ctx = c.getContext('2d');
    this._alpha = 0;
    this._target = 1;
    this._sunCur = 0;
    this._windCur = 0;
    this._moonCur = 0;
    this._frostCur = 0;
    this._gt = 0;
    this._nextGust = 1.5;
    this._gustStart = 0;
    this._gustLen = 0;
    this._lt = 0;
    this._nextFlash = 3;
    this._flashAt = -10;

    this._onResize = () => this._resize();
    this._onTap = () => this._tapped();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('pointerdown', this._onTap, { capture: true, passive: true });

    this._resize();
    this._start();
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointerdown', this._onTap, { capture: true });
    clearTimeout(this._timer);
    this._running = false;
    if (this._canvas) this._canvas.remove();
    this._canvas = null;
    this._ctx = null;
  }

  // ---------- Umgebung: Sonne & Wind ----------
  _updateEnv(hass, weather) {
    const c = this._config;

    let sun = 0;
    if (c.sun_rays) {
      if (weather === 'sunny') sun = 1;
      else if (weather === 'partlycloudy') sun = 0.5;
      const se = hass && c.sun_entity && hass.states[c.sun_entity];
      if (se && se.state === 'below_horizon') sun = 0;
    }
    this._sunTarget = sun;
    this._raySide =
      c.sun_side === 'left' || c.sun_side === 'right'
        ? c.sun_side
        : new Date().getHours() < 13
          ? 'left'
          : 'right';

    let wind = 0;
    if (c.wind_effect) {
      if (weather === 'windy' || weather === 'windy-variant') wind = 0.65;
      const we = hass && c.weather_entity && hass.states[c.weather_entity];
      const sp = we ? Number(we.attributes.wind_speed) : NaN;
      if (!isNaN(sp)) {
        const lo = Number(c.wind_speed_min);
        const hi = Math.max(lo + 1, Number(c.wind_speed_max));
        wind = Math.max(wind, clamp01((sp - lo) / (hi - lo)));
      }
      if (c.test_wind != null) wind = clamp01(Number(c.test_wind));
    }
    this._windTarget = wind;

    // Mond: abends/nachts oben rechts (Sichtbarkeit nach Sonnenstand und Wetter)
    let moon = 0;
    if (c.moon) {
      const se = hass && c.sun_entity && hass.states[c.sun_entity];
      const elev = se ? Number(se.attributes.elevation) : NaN;
      if (!isNaN(elev)) moon = clamp01(-elev / 6); // blendet in der Dämmerung ein
      else if (se) moon = se.state === 'below_horizon' ? 1 : 0;
      else {
        const hr = new Date().getHours();
        moon = hr >= 19 || hr < 6 ? 1 : 0;
      }
      if (['rainy', 'pouring', 'lightning', 'lightning-rainy', 'snowy', 'snowy-rainy', 'hail', 'fog'].includes(weather)) {
        moon = 0;
      } else if (weather === 'cloudy') moon *= 0.45;
      else if (weather === 'partlycloudy') moon *= 0.8;
      if (c.test_night) moon = 1;
    }
    this._moonTarget = moon;
    this._moonPhase = this._computeMoonPhase(hass);

    // Frost: Temperatur aus Sensor (z. B. Wetterstation), sonst aus der Wetter-Entity
    let frost = 0;
    if (c.frost_effect) {
      const toC = (v, unit) => (/F/.test(String(unit || '')) ? ((v - 32) * 5) / 9 : v);
      let temp = NaN;
      const te = hass && c.temperature_entity && hass.states[c.temperature_entity];
      if (te) temp = toC(parseFloat(te.state), te.attributes.unit_of_measurement);
      if (isNaN(temp)) {
        const we = hass && c.weather_entity && hass.states[c.weather_entity];
        if (we) temp = toC(parseFloat(we.attributes.temperature), we.attributes.temperature_unit);
      }
      if (!isNaN(temp)) {
        const thr = Number(c.frost_temperature);
        if (temp <= thr) frost = Math.max(0.25, clamp01((thr - temp) / 5));
      }
      if (c.test_frost != null) frost = clamp01(Number(c.test_frost));
    }
    this._frostTarget = frost;
  }

  // Mondphase 0..1 (0 = Neumond, 0.5 = Vollmond), aus Sensor oder berechnet
  _computeMoonPhase(hass) {
    const c = this._config;
    if (c.test_moon != null) return ((Number(c.test_moon) % 1) + 1) % 1;
    const MAP = {
      new_moon: 0, waxing_crescent: 0.125, first_quarter: 0.25, waxing_gibbous: 0.375,
      full_moon: 0.5, waning_gibbous: 0.625, last_quarter: 0.75, waning_crescent: 0.875,
    };
    const me = hass && c.moon_entity && hass.states[c.moon_entity];
    if (me && MAP[me.state] != null) return MAP[me.state];
    const jd = Date.now() / 86400000 + 2440587.5;
    const p = (jd - 2451550.1) / 29.530588853; // Neumond am 6.1.2000
    return p - Math.floor(p);
  }

  // ---------- Steuerung ----------
  _tapped() {
    this._target = 0;
    this._start();
    clearTimeout(this._timer);
    const ms = Math.max(0.2, Number(this._config.pause_minutes)) * 60000;
    this._timer = setTimeout(() => {
      this._target = 1;
      this._start();
    }, ms);
  }

  _start() {
    if (this._running || !this._canvas) return;
    this._running = true;
    this._last = null;
    requestAnimationFrame((t) => this._tick(t));
  }

  _resize() {
    if (!this._canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this._dpr = dpr;
    this._w = window.innerWidth;
    this._h = window.innerHeight;
    this._canvas.width = Math.round(this._w * dpr);
    this._canvas.height = Math.round(this._h * dpr);
    this._rebuild();
  }

  // ---------- Sprites (einmal vorgezeichnet, spart Rechenzeit) ----------
  _cloudSprite(tone, W, H) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W);
    cv.height = Math.round(H);
    const x = cv.getContext('2d');
    const puffs = 5 + Math.floor(rnd(0, 3));
    for (let i = 0; i < puffs; i++) {
      const u = i / (puffs - 1);
      const px = W * (0.15 + 0.7 * u) + rnd(-W * 0.04, W * 0.04);
      const r = H * rnd(0.35, 0.5) * (1 - Math.abs(u - 0.5) * 0.8);
      const py = H * 0.5 + rnd(-H * 0.08, H * 0.05);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${tone},0.55)`);
      g.addColorStop(0.6, `rgba(${tone},0.3)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      x.fill();
    }
    return cv;
  }

  _fogSprite() {
    const W = 800;
    const H = 200;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const x = cv.getContext('2d');
    x.translate(W / 2, H / 2);
    x.scale(1, H / W);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, W / 2);
    g.addColorStop(0, 'rgba(220,226,232,0.55)');
    g.addColorStop(0.5, 'rgba(220,226,232,0.25)');
    g.addColorStop(1, 'rgba(220,226,232,0)');
    x.fillStyle = g;
    x.fillRect(-W / 2, -W / 2, W, W);
    return cv;
  }

  // ---------- Partikel ----------
  _rebuild() {
    if (!this._canvas) return;
    const c = this._config;
    const w = this._w;
    const h = this._h;
    const area = w * h;
    const k = Math.max(0, Math.min(3, Number(c.intensity)));
    const n = (div, min) => Math.max(min, Math.round((area / div) * k));
    const season = this._season;
    const weather = this._weather;
    const sky = c.sky_effects;
    const scale = Math.max(0.8, Math.min(1.8, w / 1400));

    const mkFall = (kind, color, size, vy, drift) => ({
      kind, color, size, upright: UPRIGHT.has(kind),
      x: rnd(0, w), y: rnd(-20, h), vy: rnd(vy[0], vy[1]), drift: rnd(drift[0], drift[1]),
      gk: rnd(0.6, 1.4), lift: rnd(0.2, 1.2),
      amp: rnd(15, 40), freq: rnd(0.5, 1.3), phase: rnd(0, 6.28),
      rot: rnd(0, 6.28), rotSpeed: rnd(-1, 1), flip: rnd(0, 6.28), flipSpeed: rnd(0.7, 1.8),
    });

    const fall = []; // Blätter / Blüten / Feiertagsfiguren
    const rain = [];
    const hail = [];
    const snow = [];

    if (season === 'autumn') {
      for (let i = 0; i < n(60000, 4); i++) {
        fall.push(mkFall('leaf', pick(LEAF_COLORS), rnd(7, 13), [28, 55], [8, 20]));
      }
    } else if (season === 'spring') {
      for (let i = 0; i < n(55000, 4); i++) {
        const flower = Math.random() < 0.3;
        fall.push(
          mkFall(flower ? 'flower' : 'petal', pick(PETAL_COLORS), flower ? rnd(6, 10) : rnd(4, 8), [22, 45], [5, 15]),
        );
      }
    }

    // Feiertage
    const hol = this._holiday && HOLIDAYS[this._holiday];
    if (hol) {
      const cnt = Math.max(3, Math.round((area / 110000) * k * Math.max(0, Number(c.holiday_strength))));
      for (let i = 0; i < cnt; i++) {
        const kind = pick(hol.kinds);
        const sz = KIND_SIZES[kind] || [6, 9];
        const color = kind === 'star' ? pick(STAR_COLORS) : pick(hol.colors);
        fall.push(mkFall(kind, color, rnd(sz[0], sz[1]), [25, 45], [5, 15]));
      }
    }

    // Geburtstage: zusätzlich zu allem anderen Geschenke und Konfetti
    if (this._birthday) {
      const cnt = Math.max(4, Math.round((area / 60000) * k * Math.max(0, Number(c.birthday_strength))));
      for (let i = 0; i < cnt; i++) {
        fall.push(
          Math.random() < 0.3
            ? mkFall('gift', pick(BIRTHDAY_COLORS), rnd(5, 8), [25, 45], [5, 15])
            : mkFall('confetti', pick(BIRTHDAY_COLORS), rnd(4, 6), [25, 50], [5, 15]),
        );
      }
    }

    if (RAIN_STATES.includes(weather)) {
      for (let i = 0; i < n(9000, 20); i++) {
        rain.push({ x: rnd(-50, w), y: rnd(-20, h), len: rnd(9, 17), v: rnd(520, 800) });
      }
    }

    if (sky && weather === 'hail') {
      for (let i = 0; i < n(26000, 8); i++) {
        hail.push({ x: rnd(-50, w), y: rnd(-20, h), v: rnd(380, 560), r: rnd(1.3, 2.4) });
      }
    }

    let snowCount = 0;
    if (SNOW_STATES.includes(weather)) snowCount = n(20000, 10);
    if (season === 'winter' && c.winter_effect === 'snow') snowCount = Math.max(snowCount, n(30000, 8));
    for (let i = 0; i < snowCount; i++) {
      snow.push({
        x: rnd(0, w), y: rnd(-10, h), r: rnd(1, 2.8), vy: rnd(20, 50),
        amp: rnd(8, 22), freq: rnd(0.4, 1.1), phase: rnd(0, 6.28), a: rnd(0.5, 0.9),
      });
    }

    // Winter: funkelnde Eiskristalle (stehen fast still und glitzern, fallen nicht wie Schnee)
    const sparkles = [];
    if (season === 'winter' && c.winter_effect === 'sparkle') {
      for (let i = 0; i < n(15000, 14); i++) {
        sparkles.push({
          x: rnd(0, w), y: rnd(0, h), size: rnd(3, 8), vy: rnd(3, 9), drift: rnd(-3, 3),
          speed: rnd(0.5, 1.4), phase: rnd(0, 6.28),
        });
      }
    }

    // Sonnenstrahlen (Winkel gemessen von der Waagerechten, nach unten)
    const rays = [];
    const rayCount = 7;
    for (let i = 0; i < rayCount; i++) {
      rays.push({
        angle: 0.3 + (i / (rayCount - 1)) * 0.9 + rnd(-0.06, 0.06),
        hw: rnd(0.025, 0.06),
        base: rnd(0.5, 1),
        speed: rnd(0.04, 0.12),
        phase: rnd(0, 6.28),
      });
    }

    // Wolken, Nebel, Sterne an den Rändern
    const clouds = [];
    const fog = [];
    const stars = [];
    if (sky) {
      const cs = Math.max(0, Number(c.cloud_strength));
      const def = CLOUD_DEFS[weather];
      if (def) {
        const mk = (top) => {
          const sw = rnd(240, 420) * Math.min(1.5, scale);
          const sh = sw * rnd(0.3, 0.42);
          const y = top ? rnd(-sh * 0.7, -sh * 0.3) : h - sh * rnd(0.3, 0.7);
          clouds.push({ sprite: this._cloudSprite(def.tone, sw, sh), x: rnd(-sw, w), y, w: sw, v: rnd(5, 12) });
        };
        for (let i = 0; i < Math.round(def.top * scale * cs); i++) mk(true);
        for (let i = 0; i < Math.round(def.bottom * scale * cs); i++) mk(false);
      }
      if (weather === 'fog') {
        const sprite = this._fogSprite();
        const mkFog = (top) => {
          const bw = rnd(0.6, 1.0) * w;
          const bh = rnd(0.16, 0.24) * h;
          fog.push({
            sprite, w: bw, h: bh,
            x: rnd(-bw * 0.3, w - bw * 0.7),
            y: top ? -bh * rnd(0.35, 0.65) : h - bh * rnd(0.35, 0.65),
            v: rnd(3, 8) * (Math.random() < 0.5 ? -1 : 1),
          });
        };
        for (let i = 0; i < 4; i++) mkFog(false);
        for (let i = 0; i < 2; i++) mkFog(true);
      }
      if (weather === 'clear-night') {
        for (let i = 0; i < Math.round(30 * scale); i++) {
          stars.push({ x: rnd(0, w), y: rnd(0, h * 0.18), r: rnd(0.6, 1.6), phase: rnd(0, 6.28), speed: rnd(0.6, 1.8) });
        }
      }
    }

    this._p = { fall, rain, hail, snow };
    this._sparkles = sparkles;
    if (c.frost_effect) {
      const key = `${w}x${h}|${c.frost_strength}`;
      if (!this._frostSprite || this._frostKey !== key) {
        this._frostSprite = this._buildFrost(w, h);
        this._frostKey = key;
      }
    }
    this._rays = rays;
    this._clouds = clouds;
    this._fog = fog;
    this._stars = stars;
    this._start();
  }

  // Eisränder: milchiger Rand, kältere Ecken und kleine Eiskristalle (einmal vorgezeichnet)
  _buildFrost(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w);
    cv.height = Math.round(h);
    const x = cv.getContext('2d');
    const m = Math.min(w, h);
    const fs = Math.max(0.3, Math.min(2, Number(this._config.frost_strength)));
    const band = m * 0.07 * fs;
    const tone = '214,236,252';

    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(${tone},0.55)`);
      g.addColorStop(0.5, `rgba(${tone},0.2)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      x.fillStyle = g;
      x.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, band, 0, 0, w, band);
    edge(0, h, 0, h - band, 0, h - band, w, band);
    edge(0, 0, band, 0, 0, 0, band, h);
    edge(w, 0, w - band, 0, w - band, 0, band, h);

    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      const r = m * 0.22 * fs;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${tone},0.6)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const maxD = band * 2.4;
    const sc = Math.max(0.8, Math.min(1.8, m / 800));
    const spot = () => {
      const side = Math.floor(Math.random() * 4);
      const d = Math.pow(Math.random(), 2.2) * maxD;
      if (side === 0) return [rnd(0, w), d, d];
      if (side === 1) return [rnd(0, w), h - d, d];
      if (side === 2) return [d, rnd(0, h), d];
      return [w - d, rnd(0, h), d];
    };

    const crystal = (cx, cy, len, rot) => {
      x.save();
      x.translate(cx, cy);
      x.rotate(rot);
      x.strokeStyle = 'rgba(255,255,255,0.7)';
      x.lineWidth = Math.max(0.6, len * 0.06);
      x.lineCap = 'round';
      for (let a = 0; a < 6; a++) {
        x.save();
        x.rotate((a * Math.PI) / 3);
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(len, 0);
        for (const [f, bl] of [[0.4, 0.38], [0.7, 0.26]]) {
          x.moveTo(len * f, 0);
          x.lineTo(len * (f + bl * 0.5), len * bl);
          x.moveTo(len * f, 0);
          x.lineTo(len * (f + bl * 0.5), -len * bl);
        }
        x.stroke();
        x.restore();
      }
      x.restore();
    };

    const total = Math.round(((w + h) / 8) * fs);
    for (let i = 0; i < total; i++) {
      const [px, py, d] = spot();
      crystal(px, py, rnd(4, 15) * sc * (1 - (d / maxD) * 0.5), rnd(0, Math.PI));
    }
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < total * 1.5; i++) {
      const [px, py] = spot();
      x.beginPath();
      x.arc(px, py, rnd(0.6, 1.6), 0, Math.PI * 2);
      x.fill();
    }
    return cv;
  }

  _drawRays(ctx, t, w, h, k) {
    const left = this._raySide === 'left';
    const sgn = left ? 1 : -1;
    const ox = left ? -w * 0.03 : w * 1.03;
    const oy = -h * 0.06;
    const L = Math.hypot(w, h) * 1.05;

    // weicher Schein in der Ecke
    const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.min(w, h) * 0.7);
    glow.addColorStop(0, `rgba(255,238,180,${0.22 * k})`);
    glow.addColorStop(1, 'rgba(255,238,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (const b of this._rays) {
      const pulse = 0.55 + 0.45 * Math.sin(t * b.speed * 6.283 + b.phase);
      const a = b.angle + Math.sin(t * 0.1 + b.phase) * 0.03;
      const alpha = 0.15 * k * b.base * pulse;
      const dir = (ang) => [sgn * Math.cos(ang), Math.sin(ang)];
      const [cx, cy] = dir(a);
      const [x1, y1] = dir(a - b.hw);
      const [x2, y2] = dir(a + b.hw);
      const g = ctx.createLinearGradient(ox, oy, ox + cx * L, oy + cy * L);
      g.addColorStop(0, `rgba(255,236,170,${alpha})`);
      g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + x1 * L, oy + y1 * L);
      ctx.lineTo(ox + x2 * L, oy + y2 * L);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Mondoberfläche mit Meeren (Maria) und Kratern, einmal vorgezeichnet
  _moonTexture(r) {
    const D = Math.max(64, Math.ceil(2 * r * (this._dpr || 1)));
    if (this._moonTex && this._moonTex.width === D) return this._moonTex;
    const cv = document.createElement('canvas');
    cv.width = D;
    cv.height = D;
    const x = cv.getContext('2d');
    x.translate(D / 2, D / 2);
    x.scale(D / 2, D / 2); // ab hier hat der Mond den Radius 1

    let seed = 20260105;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let tt = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      tt = (tt + Math.imul(tt ^ (tt >>> 7), 61 | tt)) ^ tt;
      return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296;
    };

    x.beginPath();
    x.arc(0, 0, 1, 0, Math.PI * 2);
    x.clip();

    // Grundfarbe mit Lichtverlauf
    const base = x.createRadialGradient(-0.3, -0.3, 0.1, 0, 0, 1.05);
    base.addColorStop(0, '#f6f2e2');
    base.addColorStop(0.6, '#d9d4c1');
    base.addColorStop(1, '#a8a392');
    x.fillStyle = base;
    x.fillRect(-1, -1, 2, 2);

    // Maria (dunkle Ebenen), ungefähr wie von der Nordhalbkugel gesehen
    const maria = [
      [-0.28, -0.38, 0.3, 0.24, 0.3, 0.62], // Mare Imbrium
      [0.1, -0.38, 0.2, 0.18, 0, 0.58], // Mare Serenitatis
      [0.3, -0.1, 0.24, 0.2, 0.2, 0.6], // Mare Tranquillitatis
      [0.68, -0.28, 0.12, 0.09, 0.3, 0.6], // Mare Crisium
      [-0.58, 0.0, 0.22, 0.38, 0.1, 0.55], // Oceanus Procellarum
      [0.55, 0.2, 0.14, 0.18, -0.3, 0.5], // Mare Fecunditatis
      [-0.2, 0.45, 0.18, 0.12, 0, 0.5], // Mare Nubium
      [-0.52, 0.4, 0.1, 0.1, 0, 0.5], // Mare Humorum
      [-0.02, -0.08, 0.12, 0.08, 0, 0.35], // Mare Vaporum
    ];
    for (const [mx, my, rx, ry, rot, al] of maria) {
      x.save();
      x.translate(mx, my);
      x.rotate(rot);
      x.scale(rx, ry);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(92,98,108,${al})`);
      g.addColorStop(0.65, `rgba(92,98,108,${al * 0.8})`);
      g.addColorStop(1, 'rgba(92,98,108,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, 1, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }

    // Krater: dunkle Mulde, helle Kante oben links, Schatten unten rechts
    const crater = (cx, cy, cr, k) => {
      x.fillStyle = `rgba(70,70,75,${0.16 * k})`;
      x.beginPath();
      x.arc(cx, cy, cr, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = Math.max(0.004, cr * 0.18);
      x.strokeStyle = `rgba(255,255,250,${0.35 * k})`;
      x.beginPath();
      x.arc(cx, cy, cr, Math.PI * 0.75, Math.PI * 1.75);
      x.stroke();
      x.strokeStyle = `rgba(40,40,45,${0.25 * k})`;
      x.beginPath();
      x.arc(cx, cy, cr, -Math.PI * 0.25, Math.PI * 0.75);
      x.stroke();
    };
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.92;
      crater(Math.cos(a) * d, Math.sin(a) * d, 0.012 + Math.pow(rand(), 2.2) * 0.055, 0.6 + rand() * 0.6);
    }

    // bekannte Krater und die Strahlen von Tycho
    x.strokeStyle = 'rgba(255,255,250,0.22)';
    x.lineWidth = 0.012;
    x.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const len = 0.25 + rand() * 0.35;
      x.beginPath();
      x.moveTo(-0.12, 0.72);
      x.lineTo(-0.12 + Math.cos(a) * len, 0.72 + Math.sin(a) * len);
      x.stroke();
    }
    crater(-0.12, 0.72, 0.06, 1.4); // Tycho
    crater(-0.3, -0.12, 0.05, 1.2); // Copernicus
    crater(-0.55, -0.12, 0.035, 1.0); // Kepler

    // Randabdunklung
    const limb = x.createRadialGradient(0, 0, 0.62, 0, 0, 1);
    limb.addColorStop(0, 'rgba(0,0,0,0)');
    limb.addColorStop(1, 'rgba(20,20,30,0.45)');
    x.fillStyle = limb;
    x.fillRect(-1, -1, 2, 2);

    this._moonTex = cv;
    return cv;
  }

  // Mond in der aktuellen Phase (zugenommen: rechts beleuchtet, abnehmend: links), mit weichem Übergang
  _moonSprite(r, phase) {
    const key = `${Math.round(r)}|${Math.round(phase * 300)}`;
    if (this._moonCache && this._moonCache.key === key) return this._moonCache.cv;
    const tex = this._moonTexture(r);
    const D = tex.width;
    const R = D / 2;
    const cv = document.createElement('canvas');
    cv.width = D;
    cv.height = D;
    const x = cv.getContext('2d');
    x.drawImage(tex, 0, 0);

    const mk = document.createElement('canvas');
    mk.width = D;
    mk.height = D;
    const m = mk.getContext('2d');
    m.translate(R, R);
    m.fillStyle = 'rgba(255,255,255,0.12)'; // Erdlicht auf der dunklen Seite
    m.beginPath();
    m.arc(0, 0, R, 0, Math.PI * 2);
    m.fill();
    const q = phase <= 0.5 ? phase : 1 - phase; // 0 = Neumond, 0.5 = Vollmond
    const k = Math.cos(q * Math.PI * 2); // 1 (neu) ... -1 (voll)
    m.save();
    if (phase > 0.5) m.scale(-1, 1);
    try {
      m.filter = `blur(${Math.max(1, R * 0.035)}px)`;
    } catch (e) {
      /* Browser ohne canvas filter: harte Kante */
    }
    m.fillStyle = '#fff';
    const rx = R * Math.abs(k);
    m.beginPath();
    m.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    if (k >= 0) m.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, true);
    else m.ellipse(0, 0, rx, R, 0, Math.PI / 2, Math.PI * 1.5, false);
    m.closePath();
    m.fill();
    m.restore();

    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mk, 0, 0);
    this._moonCache = { key, cv };
    return cv;
  }

  // Großer Mond im rechten oberen Eck, bewusst angeschnitten
  _drawMoon(ctx, w, h, a) {
    const size = Math.max(0.5, Math.min(2, Number(this._config.moon_size) || 1));
    const r = Math.max(60, Math.min(170, Math.min(w, h) * 0.14)) * size;
    const cx = w - r * 0.6;
    const cy = r * 0.6;
    const p = this._moonPhase || 0;
    const q = p <= 0.5 ? p : 1 - p;
    const lit = (1 - Math.cos(q * Math.PI * 2)) / 2; // beleuchteter Anteil 0..1

    ctx.save();
    ctx.globalAlpha *= a;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.6);
    glow.addColorStop(0, `rgba(230,235,255,${0.04 + 0.16 * lit})`);
    glow.addColorStop(1, 'rgba(230,235,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(this._moonSprite(r, p), cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---------- Animation ----------
  _tick(ts) {
    if (!this._running || !this._ctx) return;
    const dt = this._last == null ? 0 : Math.min(0.05, (ts - this._last) / 1000);
    this._last = ts;
    const t = ts / 1000;
    const ctx = this._ctx;
    const w = this._w;
    const h = this._h;
    const c = this._config;

    // Ein-/Ausblenden (~0,7 s aus, ~2,5 s ein)
    const step = this._target > this._alpha ? dt / 2.5 : dt / 0.7;
    this._alpha += Math.sign(this._target - this._alpha) * Math.min(step, Math.abs(this._target - this._alpha));

    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this._alpha <= 0.002 && this._target === 0) {
      this._alpha = 0;
      this._running = false; // spart CPU/Akku während der Pause
      return;
    }

    // Sonne & Wind sanft nachführen (~2,5-3 s Übergang)
    const ease = (cur, target, rate) =>
      cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), rate * dt);
    this._sunCur = ease(this._sunCur, this._sunTarget || 0, 0.4);
    this._windCur = ease(this._windCur, this._windTarget || 0, 0.33);
    this._moonCur = ease(this._moonCur, this._moonTarget || 0, 0.25);
    this._frostCur = ease(this._frostCur, this._frostTarget || 0, 0.3);

    // Windböen: zufällige Böen, die sanft anschwellen und abklingen
    const s = this._windCur;
    let g = 0;
    if (s > 0.01) {
      this._gt += dt;
      if (this._gt >= this._nextGust) {
        this._gustStart = this._gt;
        this._gustLen = rnd(2, 4.5);
        this._nextGust = this._gt + this._gustLen + rnd(2, 7) / (0.4 + s);
      }
      if (this._gt < this._gustStart + this._gustLen) {
        const x = (this._gt - this._gustStart) / this._gustLen;
        g = Math.pow(Math.sin(Math.PI * x), 2);
      }
    }
    const windX = s * (35 + g * 260); // px/s nach rechts
    const turb = s * g; // Verwirbelung während einer Bö

    ctx.globalAlpha = this._alpha * clamp01(Number(c.opacity));
    const p = this._p || { fall: [], rain: [], hail: [], snow: [] };

    // Sonnenstrahlen (ganz hinten)
    const sun = this._sunCur * Math.max(0, Number(c.ray_strength));
    if (sun > 0.005 && this._rays) this._drawRays(ctx, t, w, h, sun);

    // Nebel am oberen/unteren Rand
    if (this._fog) {
      for (const b of this._fog) {
        b.x += (b.v + windX * 0.1) * dt;
        if (b.x > w) b.x = -b.w;
        else if (b.x + b.w < 0) b.x = w;
        ctx.drawImage(b.sprite, b.x, b.y, b.w, b.h);
      }
    }

    // Wolken am oberen/unteren Rand
    if (this._clouds) {
      for (const cl of this._clouds) {
        cl.x += (cl.v + s * 60) * dt;
        if (cl.x > w) cl.x = -cl.w;
        ctx.drawImage(cl.sprite, cl.x, cl.y);
      }
    }

    // Frost: vereiste Ränder (Temperatur am oder unter dem Gefrierpunkt)
    if (this._frostCur > 0.01 && this._frostSprite) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * this._frostCur;
      ctx.drawImage(this._frostSprite, 0, 0, w, h);
      ctx.globalAlpha = prev;
    }

    // Mond im rechten oberen Eck (über Frost und Wolken, damit er sichtbar bleibt)
    if (this._moonCur > 0.01) this._drawMoon(ctx, w, h, this._moonCur);

    // Sterne (klare Nacht)
    if (this._stars && this._stars.length) {
      for (const st of this._stars) {
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase));
        ctx.fillStyle = `rgba(255,255,240,${a})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Blitz: kurzes sanftes Aufhellen von oben (Gewitter)
    if (c.sky_effects && (this._weather === 'lightning' || this._weather === 'lightning-rainy')) {
      this._lt += dt;
      if (this._lt >= this._nextFlash) {
        this._flashAt = this._lt;
        this._nextFlash = this._lt + rnd(6, 15);
      }
      const pulse = (x) => (x >= 0 ? Math.exp(-x * 9) : 0);
      const dtf = this._lt - this._flashAt;
      const f = pulse(dtf) + 0.7 * pulse(dtf - 0.22);
      if (f > 0.01) {
        const gr = ctx.createLinearGradient(0, 0, 0, h * 0.55);
        gr.addColorStop(0, `rgba(225,232,255,${0.2 * f})`);
        gr.addColorStop(1, 'rgba(225,232,255,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h * 0.55);
      }
    }

    // Regen
    if (p.rain.length) {
      const slope = 0.18 + s * 0.25 + turb * 0.2;
      ctx.strokeStyle = 'rgba(175,195,215,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of p.rain) {
        d.y += d.v * dt;
        d.x += d.v * slope * dt;
        if (d.y > h + 20 || d.x > w + 30) { d.y = rnd(-40, -5); d.x = rnd(-h * slope, w); }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * slope, d.y - d.len);
      }
      ctx.stroke();
    }

    // Hagel
    if (p.hail.length) {
      const slope = 0.15 + s * 0.2;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      for (const d of p.hail) {
        d.y += d.v * dt;
        d.x += d.v * slope * dt;
        if (d.y > h + 10 || d.x > w + 20) { d.y = rnd(-30, -5); d.x = rnd(-h * slope, w); }
        ctx.moveTo(d.x + d.r, d.y);
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Schnee
    for (const sn of p.snow) {
      sn.y += sn.vy * dt;
      sn.x += windX * 0.5 * dt;
      if (sn.y > h + 5 || sn.x > w + 10) { sn.y = -5; sn.x = rnd(0, w); }
      const x = sn.x + Math.sin(t * sn.freq + sn.phase) * sn.amp;
      ctx.beginPath();
      ctx.arc(x, sn.y, sn.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${sn.a})`;
      ctx.fill();
    }

    // Winter: funkelnde Eiskristalle
    if (this._sparkles && this._sparkles.length) {
      for (const sp of this._sparkles) {
        sp.y += sp.vy * dt;
        sp.x += (sp.drift + windX * 0.3) * dt;
        if (sp.y > h + 10) { sp.y = -10; sp.x = rnd(0, w); }
        if (sp.x > w + 10) sp.x = -10;
        else if (sp.x < -10) sp.x = w + 10;
        const tw = Math.sin(t * sp.speed + sp.phase);
        if (tw <= 0.1) continue;
        const a = (tw - 0.1) / 0.9;
        const r = sp.size * (0.5 + 0.5 * a);
        ctx.fillStyle = `rgba(210,232,255,${0.9 * a})`;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - r);
        ctx.quadraticCurveTo(sp.x, sp.y, sp.x + r, sp.y);
        ctx.quadraticCurveTo(sp.x, sp.y, sp.x, sp.y + r);
        ctx.quadraticCurveTo(sp.x, sp.y, sp.x - r, sp.y);
        ctx.quadraticCurveTo(sp.x, sp.y, sp.x, sp.y - r);
        ctx.fill();
      }
    }

    // Blätter / Blüten / Feiertagsfiguren (Böen schieben, heben und wirbeln sie)
    for (const f of p.fall) {
      f.y += (f.vy - turb * f.lift * 90) * dt;
      f.x += (f.drift + windX * f.gk) * dt;
      f.rot += f.rotSpeed * (1 + turb * 5) * dt;
      f.flip += f.flipSpeed * (1 + turb * 3) * dt;
      if (f.y > h + 20 || f.x > w + 30) { f.y = rnd(-30, -10); f.x = rnd(-20, w); }
      if (f.y < -120) f.y = -120;
      const x =
        f.x + Math.sin(t * f.freq + f.phase) * f.amp + Math.sin(t * 4 + f.phase * 2) * turb * 40;
      ctx.save();
      ctx.translate(x, f.y);
      if (f.upright) {
        ctx.rotate(Math.sin(t * f.freq * 0.8 + f.phase) * 0.3 + turb * 0.4 * Math.sin(t * 3 + f.phase));
      } else {
        ctx.rotate(f.rot);
        ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(f.flip))));
      }
      (DRAW[f.kind] || drawPetal)(ctx, f.size, f.color);
      ctx.restore();
    }

    requestAnimationFrame((n) => this._tick(n));
  }
}

if (!customElements.get('season-overlay-card')) {
  customElements.define('season-overlay-card', SeasonOverlayCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    name: 'Season Overlay Card',
    description: 'Dezentes Vollbild-Overlay: Jahreszeiten, Wetter, Sonne, Wind und Feiertage (Bayern).',
  });
}
