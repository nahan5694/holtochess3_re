const SAVE_KEY = "HoloChess3_SaveData";

export const defaultItems = {
  "Item_001": 800,
  "Item_002": 50000,
  "Item_004": 3,
  "Item_005": 10,
  "Item_008": 100,
  "Item_010": 10,
  "Item_040": 3,
  "Item_041": 5
};

const defaultPlayerData = {
  currencies: { credit: 0, holo_diamond: 0, atto_ticket: 0 },
  pendingLiveTickets: 0,
  devModeUnlocked: false,
  starterGachaCompleted: false,
  gachaPity: { special: 0, pickup: 0, jp: 0, nonjp: 0, full: 0 },
  options: {
    muteInBackground: false,
    volMaster: 100,
    volBgm: 70,
    volSfx: 100,
    muteMaster: false,
    muteBgm: false,
    muteSfx: false,
    skipDuplicateGacha: false,
    allowDuplicateSSR: true
  },
  settings: { sound: { master: 100, bgm: 70, sfx: 100 } },
  level: 1, exp: 0, ap: 120, items: { ...defaultItems },
  characters: ["C_ID_01", "C_ID_04"],
  characterStats: { 'C_ID_01': { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 }, 'C_ID_04': { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 } },
  mainCharacters: ["C_ID_01"],
  songs: ["Song_000"],
  currentBgm: "Song_000",
  bgmPlaylist: ["Song_000"],
  auditions: [null, null, null, null, null, null],
  cores: [],
  kizunaTree: {},
  studio: {
    'game': { active: [], rest: [], progress: 0 },
    'talk': { active: [], rest: [], progress: 0 },
    'sing': { active: [], rest: [], progress: 0 },
    'sexy': { active: [], rest: [], progress: 0 },
    'plan': { active: [], rest: [], progress: 0 },
    'passion': { active: [], rest: [], progress: 0 },
    'mgmtA': { active: [], progress: 0 },
    'mgmtB': { active: [], progress: 0 },
    'donations': {}
  },
  lastStudioUpdate: Date.now(),
  office: {
    'arcade': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'pr': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'recording': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'photo': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'production': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'kitchen': { active: [null], rest: [null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'dismantle': { active: [null], rest: [null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'minecraft': { active: [null, null], rest: [null, null, null, null], progress: 0, craftItem: null, craftQueue: 0 },
    'lounge': { rest: [null, null, null, null, null, null, null, null] },
    'supplies': {}
  },
  lastOfficeUpdate: Date.now(),
  decks: Array.from({ length: 24 }, (_, i) => ({
    name: `유닛 ${i + 1}`,
    supporters: [null, null, null],
    strikers: [null, null, null, null, null],
    bgm: "Song_000"
  })),
  clearedStages: [],
  savedRehearsalIssues: {},
  liveState: null,
  activeSnack: null,
  snackReserve: 0,
  claimedDevCodes: {},
  seenHelpScenes: {},
  announcedUnlocks: {}
};

// 절대 규칙 5: 상태 기반 렌더링을 위한 Proxy Store 패턴
function deepProxy(obj, onChange) {
  if (typeof obj !== 'object' || obj === null) return obj;

  for (let key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      obj[key] = deepProxy(obj[key], onChange);
    }
  }

  return new Proxy(obj, {
    set(target, prop, value) {
      if (typeof value === 'object' && value !== null) {
        value = deepProxy(value, onChange);
      }
      target[prop] = value;
      onChange();
      return true;
    }
  });
}

function loadPlayerData() {
  const savedData = localStorage.getItem(SAVE_KEY);
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      
      if (parsed.mainCharacter && !parsed.mainCharacters) {
        parsed.mainCharacters = [parsed.mainCharacter];
        delete parsed.mainCharacter;
      }
      
      if (!parsed.studio) {
        parsed.studio = {
    'game': { active: [], rest: [], progress: 0 },
    'talk': { active: [], rest: [], progress: 0 },
    'sing': { active: [], rest: [], progress: 0 },
    'sexy': { active: [], rest: [], progress: 0 },
    'plan': { active: [], rest: [], progress: 0 },
    'passion': { active: [], rest: [], progress: 0 },
    'mgmtA': { active: [], progress: 0 },
    'mgmtB': { active: [], progress: 0 }
  };
      }
      if (!parsed.lastStudioUpdate) {
        parsed.lastStudioUpdate = Date.now();
      }
      if (parsed.characterStats) {
        for (let cid in parsed.characterStats) {
          if (parsed.characterStats[cid].condition === undefined) {
            parsed.characterStats[cid].condition = 100;
          }
        }
      }

      if (parsed.inventory) {
        if (!parsed.items) parsed.items = {};
        for (const key in parsed.inventory) {
           parsed.items[key] = (parsed.items[key] || 0) + parsed.inventory[key];
        }
        delete parsed.inventory;
      }

      if (!parsed.office) {
        parsed.office = JSON.parse(JSON.stringify(defaultPlayerData.office));
      } else {
        const defOffice = defaultPlayerData.office;
        for (const deptId in defOffice) {
          if (!parsed.office[deptId]) {
            parsed.office[deptId] = JSON.parse(JSON.stringify(defOffice[deptId]));
          } else if (deptId !== 'supplies') {
            const defDept = defOffice[deptId];
            if (defDept.active) {
              if (!Array.isArray(parsed.office[deptId].active)) parsed.office[deptId].active = [];
              while (parsed.office[deptId].active.length < defDept.active.length) {
                parsed.office[deptId].active.push(null);
              }
            }
            if (defDept.rest) {
              if (!Array.isArray(parsed.office[deptId].rest)) parsed.office[deptId].rest = [];
              while (parsed.office[deptId].rest.length < defDept.rest.length) {
                parsed.office[deptId].rest.push(null);
              }
            }
          }
        }
      }
      
      const mergedItems = { ...defaultPlayerData.items, ...(parsed.items || {}) };
      return { ...defaultPlayerData, ...parsed, items: mergedItems };
    } catch (e) {
      console.error(e);
    }
  }
  return JSON.parse(JSON.stringify(defaultPlayerData));
}

let saveTimeout = null;
export const PlayerData = deepProxy(loadPlayerData(), () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(PlayerData));
    window.dispatchEvent(new CustomEvent('stateChange:PlayerData'));
  }, 10);
});

export const GameData = {}; // Static data

export function resetPlayerData() {
  localStorage.removeItem(SAVE_KEY);
  Object.keys(PlayerData).forEach(key => delete PlayerData[key]);
  Object.entries(defaultPlayerData).forEach(([key, val]) => {
    PlayerData[key] = (typeof val === 'object' && val !== null) ? JSON.parse(JSON.stringify(val)) : val;
  });
  localStorage.setItem(SAVE_KEY, JSON.stringify(PlayerData));
}

window.PlayerData = PlayerData;
window.savePlayerData = function() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(PlayerData));
    window.dispatchEvent(new CustomEvent('stateChange:PlayerData'));
};

