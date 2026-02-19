const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'store.json');

const DEFAULTS = {
  chatId: null,
  topicId: null,
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 5,
  twitter: {},
  reddit: {},
};

let data = {};

function load() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    if (fs.existsSync(STORE_PATH)) {
      data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) };
      console.log('[store] Loaded from disk');
    } else {
      data = { ...DEFAULTS };
      save();
      console.log('[store] Created new store');
    }
  } catch (err) {
    console.error('[store] Load failed, using defaults:', err.message);
    data = { ...DEFAULTS };
  }
}

function save() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.error('[store] Save failed:', err.message);
  }
}

function get(key) { return data[key]; }
function set(key, value) { data[key] = value; save(); }
function getAll() { return { ...data }; }

module.exports = { load, save, get, set, getAll };
