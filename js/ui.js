import { GameData, PlayerData, resetPlayerData, defaultItems } from './state.js?v=004276';
import { updateAuditionTimers, renderAuditionSlots } from './audition.js?v=004276';
import { openShopScene } from './shop.js?v=004276';
import { openCoreScene, initCoreUI } from './ui_core.js?v=004276';
import { extractCharacterCombatModifiers } from './battle/damage_resolver.js';
import { getEffectiveAggro } from './battle/target_resolver.js';

// === UI State ===
export let currentSortMode = 'default';
export let currentWarehouseTab = "all";
let currentWarehouseFilter = 'all';
let selectedItemId = null;
let globalTime = 300;
let globalTimerId = null;
let currentCharInModal = null;
let currentBattleChar = null;
let currentBattleTabMode = 'standard';
let lvlupHoldTimer = null;

const EXP_TABLE = { 
  10: { exp: 4000, credit: 4000 }, 
  20: { exp: 8000, credit: 8000 }, 
  30: { exp: 16000, credit: 16000 }, 
  40: { exp: 35000, credit: 35000 }, 
  50: { exp: 65000, credit: 65000 }, 
  60: { exp: 110000, credit: 110000 }, 
  70: { exp: 180000, credit: 180000 }, 
  80: { exp: 300000, credit: 300000 }, 
  90: { exp: 430000, credit: 430000 } 
};
const EXP_ITEMS = { "Item_006": 3000, "Item_007": 1000, "Item_008": 300 };
const MAX_LVL_DATA = { "SSR": [30, 60, 90], "SR": [30, 60, 80], "R": [30, 60, 70] };
function getMaxLvl(tier, star) { return (MAX_LVL_DATA[tier] || [30, 60, 90])[star - 1] || 90; }

// =========================================
// 전역 UI 구독 (Proxy 이벤트)
// =========================================
export function initUIStoreListeners() {
  window.addEventListener('mouseup', () => { if (lvlupHoldTimer) clearTimeout(lvlupHoldTimer); });
  window.addEventListener('touchend', () => { if (lvlupHoldTimer) clearTimeout(lvlupHoldTimer); });

  window.addEventListener('stateChange:PlayerData', () => {
    updateMainBgmPlayer();
    updateTopCurrencies();
    updateMainMenuNotificationDots();
    // 씬이 렌더링 중이라면 다시 렌더링하도록 훅 추가 가능
    const scene5 = document.getElementById("scene-5");
    if (scene5 && scene5.classList.contains("active")) renderHoloMemList(true);
    
    const sceneUnowned = document.getElementById("scene-unowned");
    if (sceneUnowned && sceneUnowned.classList.contains("active")) renderHoloMemList(false);
    
    const scene8 = document.getElementById("scene-8");
    if (scene8 && scene8.classList.contains("active")) renderWarehouseList();
  });
}

// =========================================
// 공통 UI 함수들
// =========================================
export function updateTopCurrencies() {
  if (typeof updateAPUI === 'function') updateAPUI();
  const items = ["Item_041", "Item_003", "Item_002", "Item_001", "Item_010"];
  
  items.forEach(itemId => {
    const amount = PlayerData.items[itemId] || 0;
    const itemData = (window.GameData && window.GameData.items) ? window.GameData.items.find(i => i.Item_ID === itemId) : null;
    
    // Update amount text
    const textEls = document.querySelectorAll(`.currency[data-item-id="${itemId}"] .currency-amount`);
    textEls.forEach(el => {
      el.textContent = amount.toLocaleString();
    });
    
    // Update icon image dynamically
    if (itemData && itemData.Item_Icon) {
        const iconEls = document.querySelectorAll(`.currency[data-item-id="${itemId}"] .currency-icon`);
        iconEls.forEach(el => {
            el.src = itemData.Item_Icon;
        });
    }
  });
}


let playedSongsQueue = [];
let lastPlayedBgmId = null;

export function updateMainBgmPlayer(forceRestart = false) {
    window.updateMainBgmPlayer = updateMainBgmPlayer;
    const bgmMain = document.getElementById("bgm-main");
    if (!bgmMain) return;
    
    // 스페셜 가챠 화면이 활성화되어 있는 경우 기본 BGM으로 덮어쓰지 않고 테마곡 재생 유지
    if (typeof window.isSpecialGachaActive === 'function' && window.isSpecialGachaActive()) {
        import('./gacha.js?v=004276').then(g => {
            if (typeof g.playSpecialGachaBgm === 'function') {
                g.playSpecialGachaBgm();
            }
        }).catch(e => console.warn(e));
        return;
    }
    
    const songId = PlayerData.currentBgm || "Song_000";
    const songInfo = GameData.songs ? GameData.songs.find(s => s.Song_ID === songId) : null;
    const targetSrc = (songInfo && songInfo.Song_Link) ? songInfo.Song_Link : "";
    const songChanged = (lastPlayedBgmId !== songId || !bgmMain.src || (targetSrc && !bgmMain.src.includes(targetSrc) && bgmMain.src !== targetSrc));
    
    if (songChanged) {
        lastPlayedBgmId = songId;
        if (targetSrc) {
            bgmMain.src = targetSrc;
        }
    } else if (forceRestart) {
        bgmMain.currentTime = 0;
    } else if (!bgmMain.paused) {
        return; // No change, already playing, no force restart needed.
    }
    
    let finalVol = 0.5;
    if (PlayerData.settings && PlayerData.settings.sound) {
        const master = (PlayerData.settings.sound.master ?? 100) / 100;
        const bgm = (PlayerData.settings.sound.bgm ?? 70) / 100;
        finalVol = master * bgm;
    } else if (PlayerData.options) {
        const master = (PlayerData.options.volMaster ?? 100) / 100;
        const bgm = (PlayerData.options.volBgm ?? 70) / 100;
        finalVol = master * bgm;
    }
    finalVol *= 0.7; // 모든 BGM 사운드 크기 기본 70%로 축소
    bgmMain.volume = Math.max(0, Math.min(1, finalVol));

    const loginScene = document.getElementById("login-scene");
    const battleScene = document.getElementById("scene-battle");
    if (window.isBattleActive ||
        (loginScene && loginScene.classList.contains("active")) || 
        (battleScene && battleScene.classList.contains("active"))) {
        if (bgmMain && !bgmMain.paused) {
            try {
                bgmMain.pause();
                bgmMain.currentTime = 0;
            } catch (e) {}
        }
        return; // 로그인 화면이나 전투 중에는 메인 BGM 멈춤상태 유지
    }
    bgmMain.play().catch(e => console.log("BGM 재생 실패:", e));
}

export function playNextRandomBgm() {
    if (window.isBattleActive) return;
    const battleScene = document.getElementById("scene-battle");
    if (battleScene && battleScene.classList.contains("active")) return;

    const bgmMain = document.getElementById("bgm-main");
    if (!bgmMain) return;
    
    // 스페셜 가챠 화면 활성 상태이면 테마곡 루프
    if (typeof window.isSpecialGachaActive === 'function' && window.isSpecialGachaActive()) {
        bgmMain.currentTime = 0;
        bgmMain.play().catch(e => console.warn(e));
        return;
    }

    const playlist = PlayerData.bgmPlaylist || ["Song_000"];
    if (playlist.length === 0) return;

    const availableSongs = playlist.filter(id => !playedSongsQueue.includes(id) && id !== PlayerData.currentBgm);
    
    let nextSongId = null;
    if (availableSongs.length === 0) {
        playedSongsQueue = []; // Reset queue
        const candidates = playlist.filter(id => id !== PlayerData.currentBgm);
        nextSongId = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : playlist[0];
    } else {
        nextSongId = availableSongs[Math.floor(Math.random() * availableSongs.length)];
    }

    playedSongsQueue.push(nextSongId);
    
    if (PlayerData.currentBgm === nextSongId) {
        // 똑같은 곡이 다시 걸렸다면 수동으로 재시작 트리거
        updateMainBgmPlayer(true);
    } else {
        PlayerData.currentBgm = nextSongId; 
        updateMainBgmPlayer(true);
    }
}
window.playNextRandomBgm = playNextRandomBgm;

export function updateMainCharacterImage() {
  const mainImgEl = document.getElementById("main-character-img");
  if (!mainImgEl || !GameData.characters) return;
  
  let chars = PlayerData.mainCharacters;
  if (!chars || chars.length === 0) chars = ["C_ID_01"];
  
  let targetId = chars[Math.floor(Math.random() * chars.length)];
  if (mainImgEl.dataset.currentId) {
     // Optional: try to not pick the exact same one if they have multiple
     if (chars.length > 1) {
         let newId = targetId;
         while(newId === mainImgEl.dataset.currentId) {
             newId = chars[Math.floor(Math.random() * chars.length)];
         }
         targetId = newId;
     }
  }
  
  let targetChar = GameData.characters.find(c => c.Character_ID === targetId) || GameData.characters[0];
  if (targetChar && targetChar.Character_Image_Full) {
    mainImgEl.src = targetChar.Character_Image_Full;
    mainImgEl.dataset.currentId = targetChar.Character_ID;
  }
}


// =========================================
// 씬 전환 (Transition)
// =========================================
export function changeSceneFade(fromScene, toScene) {
  const transitionOverlay = document.getElementById("transition-overlay");
  transitionOverlay.classList.add("fade-in");
  setTimeout(() => {
    fromScene.classList.remove("active");
    toScene.classList.add("active");
    if (toScene.id === "main-scene") {
      updateMainCharacterImage();
      updateMainMenuNotificationDots();
      if (typeof updateMainMenuFeatureLocks === 'function') updateMainMenuFeatureLocks();
      if (typeof checkFeatureUnlocksAndAnnounce === 'function') checkFeatureUnlocksAndAnnounce();
    }

    // 계정 최초 씬 진입 시 도움말 1회 자동 팝업 (Item 2)
    if (toScene && toScene.id && toScene.id !== 'main-scene') {
      try {
        if (!window.PlayerData) window.PlayerData = {};
        if (!window.PlayerData.seenHelpScenes) window.PlayerData.seenHelpScenes = {};
        const sId = toScene.id;
        if (window.HELP_CONTENT && window.HELP_CONTENT[sId] && !window.PlayerData.seenHelpScenes[sId]) {
          window.PlayerData.seenHelpScenes[sId] = true;
          setTimeout(() => {
            if (typeof window.openHelpModal === 'function') {
              window.openHelpModal(sId, 0, true);
            }
          }, 350);
        }
      } catch (err) {
        console.warn("First-time help auto-popup error:", err);
      }
    }

    // 스페셜 가챠 테마곡 BGM 진입/이탈 제어
    if (toScene.id === "scene-12") {
      import('./gacha.js?v=004276').then(g => {
        if (g.currentGachaType === "special") g.playSpecialGachaBgm();
      }).catch(e => console.warn(e));
    } else if (fromScene && fromScene.id === "scene-12") {
      import('./gacha.js?v=004276').then(g => {
        g.restoreNormalBgm(false);
      }).catch(e => console.warn(e));
    }

    transitionOverlay.classList.remove("fade-in");
  }, 800);
}

export function changeSceneWipe(fromScene, toScene) {
  window.changeSceneWipe = changeSceneWipe;
  const wipeOverlay = document.getElementById("wipe-overlay");
  wipeOverlay.classList.remove("wipe-out", "wipe-reset");
  wipeOverlay.classList.add("wipe-in");

  setTimeout(() => {
    document.querySelectorAll('.scene.active').forEach(s => {
      if (s !== toScene) s.classList.remove('active');
    });
    if (fromScene) fromScene.classList.remove('active');
    toScene.classList.add("active");
    if (toScene.id === "main-scene") {
      updateMainCharacterImage();
      updateMainMenuNotificationDots();
      if (typeof updateMainMenuFeatureLocks === 'function') updateMainMenuFeatureLocks();
      if (typeof checkFeatureUnlocksAndAnnounce === 'function') checkFeatureUnlocksAndAnnounce();
    }

    // 계정 최초 씬 진입 시 도움말 1회 자동 팝업 (Item 2)
    if (toScene && toScene.id && toScene.id !== 'main-scene') {
      try {
        if (!window.PlayerData) window.PlayerData = {};
        if (!window.PlayerData.seenHelpScenes) window.PlayerData.seenHelpScenes = {};
        const sId = toScene.id;
        if (window.HELP_CONTENT && window.HELP_CONTENT[sId] && !window.PlayerData.seenHelpScenes[sId]) {
          window.PlayerData.seenHelpScenes[sId] = true;
          setTimeout(() => {
            if (typeof window.openHelpModal === 'function') {
              window.openHelpModal(sId, 0, true);
            }
          }, 350);
        }
      } catch (err) {
        console.warn("First-time help auto-popup error:", err);
      }
    }

    // 스페셜 가챠 테마곡 BGM 진입/이탈 제어
    if (toScene.id === "scene-12") {
      import('./gacha.js?v=004276').then(g => {
        if (g.currentGachaType === "special") g.playSpecialGachaBgm();
      }).catch(e => console.warn(e));
    } else if (fromScene && fromScene.id === "scene-12") {
      import('./gacha.js?v=004276').then(g => {
        g.restoreNormalBgm(false);
      }).catch(e => console.warn(e));
    }
    
    wipeOverlay.classList.remove("wipe-in");
    wipeOverlay.classList.add("wipe-out");
  }, 300);

  setTimeout(() => {
    wipeOverlay.classList.remove("wipe-out");
    wipeOverlay.classList.add("wipe-reset");
  }, 600);
}

// =========================================
// Time System (오프라인 시간 보존 잠금 & 60초 분할 시뮬레이션 완결판)
// =========================================

let lastGlobalTimeTick = Date.now();
let isOfflineCalculationComplete = false; // 오프라인 정산 완료 전까지 시각 덮어쓰기 방지 잠금장치

// [1. 핵심] 스크립트 실행 즉시 오프라인 경과 시간(초)을 변수에 안전하게 선점 확보
const initialRawLocalTick = parseInt(localStorage.getItem('HOLTO_LAST_OFFLINE_TICK') || '0', 10);
const initialPlayerTick = (window.PlayerData || PlayerData)?.lastGlobalTimeTick || 0;
const initialSavedTick = Math.max(initialRawLocalTick, initialPlayerTick);
let pendingOfflineSeconds = initialSavedTick > 0 ? Math.max(0, Math.floor((Date.now() - initialSavedTick) / 1000)) : 0;

// 순수 AP & 티켓 계산 함수 (수식으로 즉시 일괄 정산)
function processApAndTickets(elapsedSeconds) {
  if (elapsedSeconds <= 0) return;

  const totalRemaining = globalTime - elapsedSeconds;

  if (totalRemaining <= 0) {
    const over = -totalRemaining;
    const triggers = 1 + Math.floor(over / 300);
    const rem = 300 - (over % 300);
    globalTime = rem === 0 ? 300 : rem;

    // 라이브 티켓 지급 (최대 30장)
    if (PlayerData.pendingLiveTickets === undefined) {
      PlayerData.pendingLiveTickets = 0;
    }
    if (PlayerData.pendingLiveTickets < 30) {
      PlayerData.pendingLiveTickets = Math.min(30, PlayerData.pendingLiveTickets + triggers);
    }

    // 최대 AP 계산
    let maxAP = 120;
    if (window.GameData && window.GameData.levels && (window.PlayerData || PlayerData)) {
      const pData = window.PlayerData || PlayerData;
      const lvlData = window.GameData.levels.find(l => parseInt((l.Account_Level || l.Level || l['레벨'] || 1)) === (pData.level || 1));
      if (lvlData && lvlData.Account_Max_AP) {
        maxAP = parseInt(lvlData.Account_Max_AP);
      }
    }

    // AP 지급
    if (PlayerData.ap === undefined) PlayerData.ap = maxAP;
    if (PlayerData.ap < maxAP) {
      PlayerData.ap = Math.min(maxAP, PlayerData.ap + triggers);
      if (typeof updateAPUI === 'function') updateAPUI();
    }

    if (window.savePlayerData) window.savePlayerData();
  } else {
    globalTime = totalRemaining;
  }
}

// 경과 시간 시뮬레이션 (60초 단위 분할)
function processTimeProgress(totalSeconds) {
  if (totalSeconds <= 0) return;

  processApAndTickets(totalSeconds);

  const cappedSeconds = Math.min(86400, totalSeconds);

  if (cappedSeconds < 10) {
    if (typeof window.tickStudio === 'function') {
      try { window.tickStudio(cappedSeconds); } catch (e) { console.error("tickStudio error:", e); }
    }
    if (typeof window.tickOffice === 'function') {
      try { window.tickOffice(cappedSeconds); } catch (e) { console.error("tickOffice error:", e); }
    }
  } else {
    const step = 60;
    const loops = Math.floor(cappedSeconds / step);
    const remainder = cappedSeconds % step;

    for (let i = 0; i < loops; i++) {
      if (typeof window.tickStudio === 'function') {
        try { window.tickStudio(step); } catch (e) {}
      }
      if (typeof window.tickOffice === 'function') {
        try { window.tickOffice(step); } catch (e) {}
      }
    }
    if (remainder > 0) {
      if (typeof window.tickStudio === 'function') {
        try { window.tickStudio(remainder); } catch (e) {}
      }
      if (typeof window.tickOffice === 'function') {
        try { window.tickOffice(remainder); } catch (e) {}
      }
    }
  }

  // [2. 핵심] 오프라인 정산이 완전히 끝난 이후에만 현재 시각을 스토리지에 갱신
  if (isOfflineCalculationComplete) {
    try {
      localStorage.setItem('HOLTO_LAST_OFFLINE_TICK', String(Date.now()));
      localStorage.setItem('HOLTO_LAST_GLOBAL_TIME', String(globalTime));
    } catch (e) {}

    if (window.PlayerData) {
      PlayerData.lastGlobalTimeTick = Date.now();
      PlayerData.globalTime = globalTime;
    }
  }
}

function runGlobalTimeSystem() {
  // 오프라인 정산 완료 전에는 일반 타이머 동작 차단 (시각 덮어쓰기 방지)
  if (!isOfflineCalculationComplete) return;

  try {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastGlobalTimeTick) / 1000);

    if (elapsedSeconds <= 0) return;

    lastGlobalTimeTick += elapsedSeconds * 1000;

    processTimeProgress(elapsedSeconds);

    const timeText = document.getElementById("time-text");
    const gaugeFill = document.getElementById("time-gauge-fill");
    if (timeText && gaugeFill) {
      timeText.textContent = globalTime + "s";
      const progressPercent = ((300 - globalTime) / 300) * 100;
      gaugeFill.style.width = progressPercent + "%";
    }

    if (typeof updateAuditionTimers === 'function') updateAuditionTimers();
    if (typeof updateMainMenuNotificationDots === 'function') updateMainMenuNotificationDots();
  } catch (err) {
    console.error("runGlobalTimeSystem error:", err);
  }
}

export function startGlobalTimeSystem() {
  window.startGlobalTimeSystem = startGlobalTimeSystem;

  if (!globalTimerId) {
    // 구글 시트(api.js), 세이브 데이터, 스튜디오/사무소 엔진 3요소 로딩 완료 대기
    const isGameDataReady = window.GameData && Array.isArray(window.GameData.characters) && window.GameData.characters.length > 0;
    const isSaveDataReady = (window.PlayerData || PlayerData) && (window.PlayerData?.items !== undefined || PlayerData?.items !== undefined);
    const isEngineReady = typeof window.tickStudio === 'function' && typeof window.tickOffice === 'function';

    if (!isGameDataReady || !isSaveDataReady || !isEngineReady) {
      setTimeout(startGlobalTimeSystem, 100);
      return;
    }

    const savedGlobalTime = parseInt(localStorage.getItem('HOLTO_LAST_GLOBAL_TIME') || '0', 10);
    if (savedGlobalTime > 0 && savedGlobalTime <= 300) {
      globalTime = savedGlobalTime;
    } else if ((window.PlayerData || PlayerData)?.globalTime !== undefined) {
      globalTime = (window.PlayerData || PlayerData).globalTime;
    }

    // [3. 핵심] 보존해 둔 오프라인 시간을 손실 없이 안전 정산
    if (pendingOfflineSeconds > 0) {
      console.log(`⏳ 오프라인 경과 시간 (${pendingOfflineSeconds}초) 안전 정산 시작...`);
      processTimeProgress(pendingOfflineSeconds);
      pendingOfflineSeconds = 0;
      console.log(`✅ 오프라인 정산 완료! (스튜디오 & 사무소 갱신)`);
    }

    // 정산 완료 후 잠금 해제 및 시각 동기화
    isOfflineCalculationComplete = true;
    lastGlobalTimeTick = Date.now();

    try {
      localStorage.setItem('HOLTO_LAST_OFFLINE_TICK', String(lastGlobalTimeTick));
      localStorage.setItem('HOLTO_LAST_GLOBAL_TIME', String(globalTime));
    } catch (e) {}

    if (window.PlayerData) {
      PlayerData.lastGlobalTimeTick = lastGlobalTimeTick;
      PlayerData.globalTime = globalTime;
    }
    if (typeof window.savePlayerData === 'function') {
      try { window.savePlayerData(); } catch (e) {}
    }

    // 화면 UI 즉시 갱신
    const timeText = document.getElementById("time-text");
    const gaugeFill = document.getElementById("time-gauge-fill");
    if (timeText && gaugeFill) {
      timeText.textContent = globalTime + "s";
      const progressPercent = ((300 - globalTime) / 300) * 100;
      gaugeFill.style.width = progressPercent + "%";
    }
    if (typeof window.updateStudioUI === 'function') window.updateStudioUI();
    if (typeof window.updateOfficeUI === 'function') window.updateOfficeUI();
    if (typeof window.renderOfficeSupplies === 'function') window.renderOfficeSupplies();

    globalTimerId = setInterval(runGlobalTimeSystem, 1000);
    window.globalTimerId = globalTimerId;
  }
}
window.startGlobalTimeSystem = startGlobalTimeSystem;
window.runGlobalTimeSystem = runGlobalTimeSystem;

if (typeof window !== 'undefined') {
  startGlobalTimeSystem();
}

// 탭 활성화 시 정산 (오프라인 정산 완료 후에만 반응)
if (typeof document !== 'undefined' && !window._globalTimeVisibilityBound) {
  window._globalTimeVisibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOfflineCalculationComplete) {
      runGlobalTimeSystem();
    }
  });
}

// 창 닫을 때 안전 저장
if (typeof window !== 'undefined' && !window._globalTimeUnloadBound) {
  window._globalTimeUnloadBound = true;
  window.addEventListener('beforeunload', () => {
    if (isOfflineCalculationComplete) {
      try {
        localStorage.setItem('HOLTO_LAST_OFFLINE_TICK', String(Date.now()));
        localStorage.setItem('HOLTO_LAST_GLOBAL_TIME', String(globalTime));
      } catch (e) {}
      if (window.PlayerData) {
        PlayerData.lastGlobalTimeTick = Date.now();
        PlayerData.globalTime = globalTime;
        if (window.savePlayerData) window.savePlayerData();
      }
    }
  });
}

// =========================================
// 메인 메뉴 4종 알림 레드닷 시스템 (Item 4) & 기능 해금
// =========================================
function toggleMenuRedDot(btn, show) {
  if (!btn) return;
  let dot = btn.querySelector('.menu-red-dot');
  if (show) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'menu-red-dot';
      btn.appendChild(dot);
    }
  } else {
    if (dot) dot.remove();
  }
}

// 메인 스토리 클리어 기능 해금 시스템 (Feature Unlocks)
export const FEATURE_UNLOCKS = {
  "scene-12": { name: "캐스팅", stageId: "Stage_001", storyName: "메인스토리_01" },
  "scene-13": { name: "오디션", stageId: "Stage_001", storyName: "메인스토리_01" },
  "scene-10": { name: "스튜디오", stageId: "Stage_002", storyName: "메인스토리_02" },
  "scene-11": { name: "사무소", stageId: "Stage_002", storyName: "메인스토리_02" },
  "scene-7":  { name: "키즈나", stageId: "Stage_003", storyName: "메인스토리_03" },
  "scene-core": { name: "코어", stageId: "Stage_004", storyName: "메인스토리_04" },
  "scene-3":  { name: "라이브 스테이지", stageId: "Stage_005", storyName: "메인스토리_05" }
};
window.FEATURE_UNLOCKS = FEATURE_UNLOCKS;

export function isFeatureUnlocked(sceneId) {
  const req = FEATURE_UNLOCKS[sceneId];
  if (!req) return true;
  const cleared = (window.PlayerData && window.PlayerData.clearedStages) || [];
  return cleared.includes(req.stageId) || cleared.includes(req.stageId.replace('Stage_', 'Story_'));
}
window.isFeatureUnlocked = isFeatureUnlocked;

export function updateMainMenuFeatureLocks() {
  try {
    Object.keys(FEATURE_UNLOCKS).forEach(sceneId => {
      const btn = document.querySelector(`.menu-btn[data-target="${sceneId}"]`);
      if (btn) {
        const unlocked = isFeatureUnlocked(sceneId);
        if (unlocked) {
          btn.classList.remove('menu-btn-locked');
          btn.removeAttribute('title');
        } else {
          btn.classList.add('menu-btn-locked');
          btn.classList.remove('menu-btn-new-unlocked');
          const info = FEATURE_UNLOCKS[sceneId];
          btn.setAttribute('title', `${info.name} (${info.storyName} 클리어 시 해금)`);
        }
      }
    });
  } catch (e) {
    console.error("updateMainMenuFeatureLocks error:", e);
  }
}
window.updateMainMenuFeatureLocks = updateMainMenuFeatureLocks;

export function checkFeatureUnlocksAndAnnounce() {
  try {
    if (!window.PlayerData) return;
    if (!window.PlayerData.announcedUnlocks) window.PlayerData.announcedUnlocks = {};

    const newlyUnlockedNames = [];
    Object.keys(FEATURE_UNLOCKS).forEach(sceneId => {
      const btn = document.querySelector(`.menu-btn[data-target="${sceneId}"]`);
      if (isFeatureUnlocked(sceneId)) {
        if (!window.PlayerData.announcedUnlocks[sceneId]) {
          window.PlayerData.announcedUnlocks[sceneId] = true;
          const info = FEATURE_UNLOCKS[sceneId];
          if (!newlyUnlockedNames.includes(info.name)) {
            newlyUnlockedNames.push(info.name);
          }
          if (btn) {
            btn.classList.add('menu-btn-new-unlocked');
          }
        }
      } else {
        if (btn) {
          btn.classList.remove('menu-btn-new-unlocked');
        }
      }
    });

    if (newlyUnlockedNames.length > 0) {
      const titleStr = `"${newlyUnlockedNames.join(', ')}" 기능이 해금되었습니다.`;
      const unlockModal = document.getElementById('unlock-modal');
      const unlockDesc = document.getElementById('unlock-modal-desc');
      if (unlockModal && unlockDesc) {
        unlockDesc.textContent = titleStr;
        unlockModal.classList.add('show');
      } else {
        alert(titleStr);
      }
    }
  } catch (e) {
    console.error("checkFeatureUnlocksAndAnnounce error:", e);
  }
}
window.checkFeatureUnlocksAndAnnounce = checkFeatureUnlocksAndAnnounce;

export function updateMainMenuNotificationDots() {
  try {
    if (!PlayerData) return;

    // AP 레드닷 연동 갱신
    updateAPUI();

    // 1. 오디션 버튼 (scene-13): 오디션 시간이 완료되어 모집 완료된 캐릭터를 획득할 수 있을 때 (해금 시에만)
    const btnAudition = document.querySelector('.menu-btn[data-target="scene-13"]');
    let hasAuditionReady = false;
    if (isFeatureUnlocked('scene-13') && PlayerData.auditions && Array.isArray(PlayerData.auditions)) {
      hasAuditionReady = PlayerData.auditions.some(s => s && (s.state === 'finished' || (s.state === 'recruiting' && Date.now() >= s.endTime)));
    }
    toggleMenuRedDot(btnAudition, hasAuditionReady);

    // 2. 스튜디오 버튼 (scene-10): 도네이션 박스에 보관된 재화 중 1개라도 최대치까지 도달했을 때 (해금 시에만)
    const btnStudio = document.querySelector('.menu-btn[data-target="scene-10"]');
    let hasStudioMax = false;
    if (isFeatureUnlocked('scene-10') && PlayerData.studio && PlayerData.studio.donations) {
      for (const itemId in PlayerData.studio.donations) {
        const amt = PlayerData.studio.donations[itemId] || 0;
        let limit = 100;
        if (itemId === 'Item_002') limit = 1000000;
        else if (itemId === 'Item_008') limit = 1000;
        if (amt >= limit) {
          hasStudioMax = true;
          break;
        }
      }
    }
    toggleMenuRedDot(btnStudio, hasStudioMax);

    // 3. 키즈나 버튼 (scene-7): 획득한 키즈나 포인트 중 미사용 포인트 20% 이상 (※ 해금 전까지 키즈나 버튼 레드닷 절대 미표시!)
    const btnKizuna = document.querySelector('.menu-btn[data-target="scene-7"]');
    let hasKizunaReady = false;
    if (isFeatureUnlocked('scene-7')) {
      try {
        if (typeof window.getAvailableKizunaPoints === 'function') {
          const { totalPoints, currentPoints } = window.getAvailableKizunaPoints();
          if (totalPoints > 0 && currentPoints > 0 && (currentPoints / totalPoints) >= 0.20) {
            hasKizunaReady = true;
          }
        }
      } catch (e) {}
    }
    toggleMenuRedDot(btnKizuna, hasKizunaReady);

    // 4. 라이브 스테이지 (scene-3): 진행중인 라이브 스테이지가 존재할 때 (해금 시에만)
    const btnLive = document.querySelector('.menu-btn[data-target="scene-3"]');
    let hasLiveOngoing = false;
    if (isFeatureUnlocked('scene-3')) {
      hasLiveOngoing = Boolean(PlayerData.liveState && (PlayerData.liveState.mode || (PlayerData.liveState.stages && PlayerData.liveState.stages.length > 0)));
    }
    toggleMenuRedDot(btnLive, hasLiveOngoing);
  } catch (err) {
    console.error("updateMainMenuNotificationDots error:", err);
  }
}
window.updateMainMenuNotificationDots = updateMainMenuNotificationDots;

// =========================================
// 도움말 시스템 전면 개편 (14개 씬 멀티페이지 지원)
// =========================================
export const HELP_CONTENT = {
  "scene-1": {
    title: "메인 스토리 진행",
    badge: "MAIN STORY",
    pages: [
      {
        pageTitle: "메인 스토리 기본 안내",
        intro: "홀로라이브 멤버들의 메인 스토리와 전투를 돌파하는 핵심 메인 콘텐츠입니다.",
        cards: [
          {
            title: "단계별 순차 잠금 해제",
            desc: "이전 스테이지를 클리어하면 다음 단계가 순차적으로 개방됩니다. 특정 메인 스토리를 돌파할 때마다 <strong>다양한 게임 내 핵심 기능</strong>들이 함께 해금됩니다.",
            points: [
              "<strong>메인스토리_01 클리어</strong>: 캐스팅(가챠) 및 오디션 기능 해금",
              "<strong>메인스토리_02 클리어</strong>: 스튜디오 및 사무소 기능 해금",
              "<strong>메인스토리_03 클리어</strong>: 키즈나 시스템 해금",
              "<strong>메인스토리_04 클리어</strong>: 코어 장비 시스템 해금",
              "<strong>메인스토리_05 클리어</strong>: 라이브 스테이지(로그라이크) 해금"
            ]
          },
          {
            title: "전투 규칙 및 특징",
            desc: "메인 스토리는 순수한 전략과 덱 구성 능력으로 돌파하는 정규 스테이지입니다.",
            points: [
              "이슈(제약 조건) 시스템을 통한 <strong>추가 보상 획득이 지원되지 않습니다</strong>.",
              "소탕권 및 자동전투를 지원하지 않으며, 직접 덱을 편성하여 <strong>수동으로 공략</strong>해야 합니다.",
              "최초 클리어 시 풍성한 <strong>초회 클리어 보상</strong>(홀로다이아 등)이 지급됩니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-2": {
    title: "리허설 스테이지",
    badge: "REHEARSAL",
    pages: [
      {
        pageTitle: "리허설 스테이지 안내",
        intro: "멤버들의 육성과 성장에 필요한 다양한 카테고리의 재료를 집중 파밍하는 공간입니다.",
        cards: [
          {
            title: "재화 파밍 던전",
            desc: "성장석, 경험치, 스킬 재료 등 <strong>다양한 카테고리의 재료</strong>를 파밍할 수 있습니다."
          },
          {
            title: "이슈 시스템 (추가 보상 획득)",
            desc: "도전적인 플레이를 위해 다양한 디버프 및 제약 조건(이슈)을 활성화할 수 있습니다.",
            points: [
              "이슈를 많이 활성화할수록 스테이지 난이도가 상승하지만, 비례하여 <strong>보너스 보상</strong>을 추가로 획득합니다.",
              "현재 설정한 이슈 조합은 스테이지별 기본값으로 저장하여 편리하게 재도전할 수 있습니다."
            ]
          },
          {
            title: "소탕(자동전투) 시스템",
            desc: "직접 1회 이상 클리어하여 공략에 성공한 스테이지는 소탕권을 사용할 수 있습니다.",
            points: [
              "<strong>AP와 소탕권</strong>을 소모하여 즉시 자동 클리어 및 보상 획득이 가능합니다.",
              "1회 이상 공략에 성공한 스테이지는 언제든지 소탕 기능을 자유롭게 이용할 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-3": {
    title: "라이브 스테이지",
    badge: "LIVE STAGE",
    pages: [
      {
        pageTitle: "로그라이크 라이브 도전",
        intro: "강력한 적들과 끊임없이 전투하며 자신의 한계를 시험하는 고난도 로그라이크 도전 콘텐츠입니다.",
        cards: [
          {
            title: "로그라이크식 연속 전투",
            desc: "각 단계마다 랜덤한 적 조합과 조우하며, 단계가 올라갈수록 더욱 치열하고 전략적인 전투가 펼쳐집니다."
          },
          {
            title: "신규 이슈 누적 & 보상 증가",
            desc: "단계를 하나씩 돌파할 때마다 새로운 이슈(제약/난관)가 무작위로 누적됩니다.",
            points: [
              "누적된 이슈 포인트가 높아질수록 최종 획득하는 <strong>보상 배율</strong>이 대폭 상승합니다.",
              "위험 부담이 클수록 더 막대한 이득을 얻을 수 있습니다."
            ]
          },
          {
            title: "AP 소모 없음",
            desc: "라이브 스테이지는 <strong>별도의 AP를 전혀 소모하지 않으므로</strong> 언제든지 자유롭게 도전할 수 있습니다."
          }
        ]
      },
      {
        pageTitle: "보상 및 정산 안내",
        intro: "라이브 스테이지에서 획득할 수 있는 보상 및 중도 정산 규칙입니다.",
        cards: [
          {
            title: "획득 가능 보상 종류",
            desc: "캐스팅(가챠)에 사용되는 핵심 귀중 재화들을 획득할 수 있습니다.",
            points: [
              "<strong>홀로다이아</strong>: 픽업 및 상시 캐스팅을 진행하는 프리미엄 재화",
              "<strong>라이브 티켓</strong>: 전투 스킵을 진행할 수 있는 아이템"
            ]
          },
          {
            title: "패배 및 중도 포기 시 보상 수령",
            desc: "도전 도중 패배하거나 스스로 중도 포기를 선택하더라도 손해를 보지 않습니다.",
            points: [
              "현재까지 도달한 최고 단계와 축적된 이슈 포인트를 기준으로 최종 결산이 진행됩니다.",
              "결산에 따라 확정된 보상을 <strong>정상적으로 모두 수령</strong>하고 복귀할 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-deck": {
    title: "덱 편성",
    badge: "DECK EDIT",
    pages: [
      {
        pageTitle: "덱 편성 기초 및 조작",
        intro: "전투에 출전할 8명의 캐릭터를 전략적으로 배치하고 시너지를 조합하는 지휘 본부입니다.",
        cards: [
          {
            title: "드래그 앤 드롭 배치 & 정보 열람",
            desc: "보유 캐릭터 목록에서 원하는 캐릭터를 드래그하여 슬롯에 배치하거나, 슬롯에서 밖으로 끌어내어 배치를 해제할 수 있습니다.",
            points: [
              "편성된 캐릭터 카드를 클릭하면 상세 스탯과 스킬, <strong>장착 코어</strong>를 즉시 확인할 수 있습니다.",
              "<strong>스트라이커(전열) 5명과 서포터(후열) 3명</strong>으로 총 8명의 팀을 구성합니다."
            ]
          },
          {
            title: "다양한 유닛 슬롯 제공",
            desc: "다양한 던전과 전략에 맞춰 여러 개의 덱 프리셋 슬롯을 자유롭게 전환하고 저장할 수 있습니다."
          }
        ]
      },
      {
        pageTitle: "키즈나 점수 & BGM 변경",
        intro: "덱 편성 시 고려해야 할 시너지 요소와 편의 기능입니다.",
        cards: [
          {
            title: "편성 정보 키즈나 점수",
            desc: "함께 출전하는 멤버들 간의 태그 조합과 유대감에 따라 키즈나 점수가 실시간 계산됩니다.",
            points: [
              "특정 스테이지의 <strong>테에테에 이슈 조건</strong>을 만족하기 위해서 키즈나 점수가 활용됩니다."
            ]
          },
          {
            title: "전투 BGM 커스텀 변경",
            desc: "덱 화면 <strong>좌측 하단</strong>의 BGM 변경 버튼을 통해 상점에서 해금한 홀로라이브 오리지널 곡 중 원하는 곡을 전투 배경음악으로 지정할 수 있습니다."
          }
        ]
      }
    ]
  },
  "scene-7": {
    title: "키즈나",
    badge: "KIZUNA",
    pages: [
      {
        pageTitle: "키즈나 시스템 안내",
        intro: "영입한 홀로라이브 멤버들의 유대(키즈나)를 바탕으로 팀 전체를 영구 강화하는 시스템입니다.",
        cards: [
          {
            title: "키즈나 포인트 획득",
            desc: "키즈나 포인트는 <strong>오직 캐릭터 수집(영입)만으로 획득</strong>합니다.",
            points: [
              "레벨업과 승급 등 육성과는 무관하며, 신규 멤버 영입 시 해당 캐릭터가 보유한 고유 태그별로 키즈나 포인트가 누적됩니다.",
              "더 많은 멤버를 수집할수록 태그별 누적 포인트가 계속해서 증가합니다."
            ]
          },
          {
            title: "태그별 스탯 분배 및 강화",
            desc: "축적된 키즈나 포인트를 원하는 태그 보드에 투자하여 능력치를 개방합니다.",
            points: [
              "해당 태그를 공유하는 모든 캐릭터에게 공격력, 체력, 치명타 등 <strong>핵심 스탯 보너스가 영구 적용</strong>됩니다."
            ]
          },
          {
            title: "크레딧 소모 페이지 단위 초기화",
            desc: "투자한 포인트는 언제든 부담 없이 재설정할 수 있습니다.",
            points: [
              "일정 크레딧을 소모하여 해당 페이지(태그)에 투자한 포인트를 즉시 <strong>전액 회수하고 다시 분배</strong>할 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-5": {
    title: "보유 홀로멤",
    badge: "MEMBERS",
    pages: [
      {
        pageTitle: "보유 멤버 목록 및 육성",
        intro: "현재 영입하여 활동 중인 모든 홀로라이브 멤버들을 관리하고 육성하는 공간입니다.",
        cards: [
          {
            title: "상세 정보 열람 및 육성",
            desc: "캐릭터 카드를 클릭하면 상세 정보창이 열리며, 다양한 육성 메뉴를 진행할 수 있습니다.",
            points: [
              "<strong>레벨업</strong>: 경험치 아이템을 소모하여 캐릭터의 기본 스탯을 성장시킵니다.",
              "<strong>승급(개화)</strong>: 캐릭터 조각을 모아 성급을 승급시키며 기본 스탯 배율이 상승합니다.",
              "<strong>궁극기 해금</strong>: 2성 개화 시 캐릭터의 고유 궁극기(AS)가 해금되어 전투에서 사용할 수 있게 됩니다.",
              "<strong>스킬 숙련</strong>: 2성 개화 시 해금되며, 스킬 재료를 소모하여 스킬 피해 계수 및 효과를 강화합니다.",
              "<strong>코어 장착</strong>: 2성 개화 시 개방되는 코어 슬롯에 강력한 코어를 장착합니다."
            ]
          },
          {
            title: "정렬 및 필터링 기능",
            desc: "우측 상단 정렬 버튼을 통해 속성, 클래스, 희귀도, 레벨, 이름 등 <strong>다양한 조건으로 정렬 및 탐색</strong>할 수 있습니다."
          }
        ]
      }
    ]
  },
  "scene-unowned": {
    title: "미보유 홀로멤",
    badge: "ARCHIVE",
    pages: [
      {
        pageTitle: "미보유 홀로멤 도감",
        intro: "아직 영입하지 않은 홀로라이브 멤버들의 정보와 매력을 미리 확인할 수 있는 도감 공간입니다.",
        cards: [
          {
            title: "상세 스펙 및 가챠 대사 열람",
            desc: "미보유 캐릭터 카드를 클릭하면 <strong>일러스트, 초기 스탯, 스킬 구성, 고유 가챠 대사</strong> 등을 미리 살펴볼 수 있습니다."
          },
          {
            title: "성장 불가 안내",
            desc: "아직 정식으로 영입(보유)하지 않은 상태이므로 레벨업, 승급, 스킬 강화, 코어 장착 등의 <strong>육성 조작은 지원되지 않습니다</strong>."
          },
          {
            title: "정렬 기능 지원",
            desc: "보유 멤버 창과 동일하게 속성, 클래스, 등급, 이름 순으로 자유롭게 정렬하여 원하는 멤버의 정보를 탐색할 수 있습니다."
          }
        ]
      }
    ]
  },
  "scene-8": {
    title: "창고",
    badge: "WAREHOUSE",
    pages: [
      {
        pageTitle: "창고 및 아이템 바로가기",
        intro: "보유하고 있는 모든 재화, 소비 아이템, 성장 재료, 티켓을 한곳에서 확인하고 관리하는 보관함입니다.",
        cards: [
          {
            title: "카테고리별 아이템 분류",
            desc: "전체, 재화, 성장 재료, 소모품 등 탭을 통해 필요한 아이템을 빠르게 찾고 수량을 파악할 수 있습니다."
          },
          {
            title: "획득처 확인 및 바로가기 기능",
            desc: "아이템을 선택하면 상세 정보창 하단에 해당 아이템을 파밍하거나 구매할 수 있는 획득처가 안내됩니다.",
            points: [
              "하단의 <strong>[바로가기] 버튼</strong>을 누르면 해당 스테이지(리허설, 상점, 사무소 등)로 즉시 화면이 이동하여 편리하게 재료를 모을 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-core": {
    title: "코어 시스템",
    badge: "CORE SYSTEM",
    pages: [
      {
        pageTitle: "코어 제작 및 장착",
        intro: "멤버들의 능력을 한 차원 더 끌어올리는 강력한 특수 장비 시스템입니다.",
        cards: [
          {
            title: "코어 슬롯 해금 조건",
            desc: "캐릭터를 <strong>2성 이상으로 승급(개화)</strong>시키면 코어를 장착할 수 있는 전용 슬롯이 개방됩니다."
          },
          {
            title: "신규 코어 제작",
            desc: "파밍한 재료 아이템과 크레딧을 사용하여 원하는 속성과 유형의 신규 코어를 직접 제작할 수 있습니다."
          }
        ]
      },
      {
        pageTitle: "강화, 승급, 리롤 & 히든 옵션",
        intro: "코어의 옵션을 최적화하고 더욱 강력하게 단련하는 방법입니다.",
        cards: [
          {
            title: "옵션 강화 / 옵션 승급 / 옵션 리롤",
            desc: "코어에 부여된 능력치를 다채로운 방식으로 커스터마이징할 수 있습니다.",
            points: [
              "<strong>옵션 강화</strong>: 코어에 붙은 스탯 수치를 직접 상승시킵니다.",
              "<strong>옵션 승급</strong>: 옵션 자체의 티어를 올려(I ~ IV) 더 높은 스탯 한도와 잠재력을 개방합니다.",
              "<strong>옵션 리롤</strong>: 마음에 들지 않는 옵션을 무작위의 새로운 옵션으로 재추첨합니다."
            ]
          },
          {
            title: "4등급 히든 옵션 (코어당 1개 제한)",
            desc: "최고 티어인 4등급 옵션 중에는 강력한 고유 효과를 지닌 <strong>'히든 옵션'</strong>이 존재합니다.",
            points: [
              "히든 옵션은 매우 막강한 성능을 발휘하므로, <strong>코어 1개당 최대 1개까지만</strong> 보유할 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-shop": {
    title: "상점",
    badge: "SHOP",
    pages: [
      {
        pageTitle: "상점 가이드",
        intro: "홀로코인 및 루비를 소모하여 다양한 성장 재료와 음원을 구매하는 공간입니다.",
        cards: [
          {
            title: "일반 상점",
            desc: "기본 화폐인 <strong>홀로코인</strong>을 사용하여 각종 성장석, 경험치 아이템, 스킬 북 등 다양한 성장 재료를 매일 구매할 수 있습니다."
          },
          {
            title: "노래 상점",
            desc: "<strong>홀로코인</strong>을 소모하여 매력적인 홀로라이브 오리지널 곡을 영구 구매할 수 있습니다.",
            points: [
              "구매한 음원은 로비 메인 화면 및 전투 배경음악으로 자유롭게 설정하여 감상할 수 있습니다."
            ]
          },
          {
            title: "루비 상점",
            desc: "<strong>루비</strong>를 지불하여 다양한 아이템을 교환할 수 있는 전용 상점입니다.",
            points: [
              "루비 획득 경로: 캐스팅(가챠) 시 이미 MAX 개화 단계에 도달한 중복 캐릭터를 획득했을 때 보상으로 지급됩니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-10": {
    title: "스튜디오",
    badge: "STUDIO",
    pages: [
      {
        pageTitle: "스튜디오 활동 및 배치",
        intro: "홀로멤들을 방송 및 스튜디오 활동에 배치하여 시간에 따라 자동으로 재화를 획득하는 방치형 공간입니다.",
        cards: [
          {
            title: "작업칸 (방송 진행 및 대성공)",
            desc: "캐릭터를 작업칸에 배치하면 방송을 진행하여 시간 경과에 따라 <strong>크레딧과 재화를 자동으로 축적</strong>합니다 (컨디션 소모).",
            points: [
              "작업 완료 시 멤버들의 스탯에 따라 일정 확률로 <strong>'대성공'</strong>이 발생하여 추가 보너스 재화와 보상을 획득할 수 있습니다."
            ]
          },
          {
            title: "휴식칸 (컨디션 회복)",
            desc: "방송으로 지친 캐릭터를 휴식칸에 배치하면 빠른 속도로 컨디션을 회복합니다.",
            points: [
              "휴식칸은 멤버들의 컨디션 회복 전용 공간이며, 대성공은 발생하지 않습니다."
            ]
          }
        ]
      },
      {
        pageTitle: "스튜디오 편의 시설",
        intro: "도네이션 박스와 휴식 효율을 높여주는 부가 시설입니다.",
        cards: [
          {
            title: "매니지먼트 설정",
            desc: "스튜디오 전반의 생산 속도와 컨디션 소모 효율을 최적화하는 매니지먼트를 적용합니다."
          },
          {
            title: "도네이션 박스 한도",
            desc: "방송을 통해 축적된 재화는 <strong>도네이션 박스</strong>에 보관되며, 최대 한도가 존재합니다.",
            points: [
              "한도에 도달하면 더 이상 재화가 누적되지 않으므로 <strong>주기적으로 방문하여 수령</strong>해주세요 (한도 도달 시 메인 화면 레드닷 알림)."
            ]
          },
          {
            title: "간식 바구니",
            desc: "간식을 비치하여 휴식 중인 멤버들의 <strong>피로 회복 속도</strong>를 한층 더 끌어올릴 수 있습니다.",
            points: [
              "휴식 중인 멤버의 컨디션이 <strong>5 이하</strong>로 떨어지면 비치된 간식을 자동으로 섭취하여 컨디션을 회복합니다.",
              "최소 남길 수량(0~999개)을 설정하여 다른 제작에 필요한 간식이 소진되지 않도록 보존할 수 있습니다."
            ]
          }
        ]
      }
    ]
  },
  "scene-11": {
    title: "사무소",
    badge: "OFFICE",
    pages: [
      {
        pageTitle: "사무소 제작 및 생산",
        intro: "하위 재료를 가공 및 합성하여 상위 아이템을 생산하거나 불필요한 아이템을 분해하는 공방 시설입니다.",
        cards: [
          {
            title: "생산 아이템 지정 및 작업칸 (대성공)",
            desc: "원하는 상위 성장 재료를 지정한 후, 필요한 하위 재료와 크레딧을 소비하여 <strong>직접 생산</strong>합니다.",
            points: [
              "캐릭터를 작업칸에 배치하면 <strong>생산 시간을 대폭 단축</strong>시킬 수 있습니다.",
              "생산 완료 시 일정 확률로 <strong>'대성공'</strong>이 발생하여 추가 생산품 및 보너스 보상을 획득합니다."
            ]
          },
          {
            title: "휴식칸 (컨디션 회복)",
            desc: "작업 중 피로도가 쌓인 멤버를 휴식칸에 배치하면 빠른 속도로 컨디션을 회복합니다.",
            points: [
              "휴식칸은 멤버들의 컨디션 회복 전용 공간이며, 대성공은 발생하지 않습니다."
            ]
          }
        ]
      },
      {
        pageTitle: "사무소 부속 시설",
        intro: "주방, 분해기 등 사무소의 특수 유틸리티 기능입니다.",
        cards: [
          {
            title: "주방 (요리 제작)",
            desc: "멤버들을 위한 맛있는 요리와 간식을 조리하여 스튜디오와 사무소의 <strong>작업 능률을 극대화</strong>합니다."
          },
          {
            title: "분해기 (재료 분해)",
            desc: "남아돌거나 당장 쓰지 않는 상위 재료를 투입하여 유용한 <strong>하위 재료나 분해 부산물로 환원</strong>합니다."
          },
          {
            title: "간식 바구니",
            desc: "간식을 비치하여 휴식 중인 멤버들의 <strong>피로 회복 속도</strong>를 한층 더 끌어올릴 수 있습니다.",
            points: [
              "휴식 중인 멤버의 컨디션이 <strong>5 이하</strong>로 떨어지면 비치된 간식을 자동으로 섭취하여 컨디션을 회복합니다.",
              "최소 남길 수량(0~999개)을 설정하여 다른 제작에 필요한 간식이 소진되지 않도록 보존할 수 있습니다."
            ]
          },
          {
            title: "휴게공간 (휴식 전용 8칸)",
            desc: "사무소 좌측 하단에 위치한 전용 휴게 시설입니다. 오직 휴식칸만 8칸 존재하며, <strong>다른 휴식공간보다 50% 높은 컨디션 회복량(1.5배)</strong>을 제공합니다."
          }
        ]
      }
    ]
  },
  "scene-12": {
    title: "캐스팅",
    badge: "CASTING",
    pages: [
      {
        pageTitle: "캐스팅(가챠) 시스템",
        intro: "홀로다이아를 사용하여 매력적인 홀로라이브 멤버들을 직접 스카우트하는 프리미엄 영입 시스템입니다.",
        cards: [
          {
            title: "다양한 픽업 및 상시 배너",
            desc: "기간 한정으로 진행되는 <strong>스페셜 픽업 배너, 특정 멤버 집중 배너, 상시 일반 캐스팅 배너</strong>가 제공됩니다.",
            points: [
              "픽업 배너에서는 해당 픽업 캐릭터의 <strong>획득 확률이 대폭 증가</strong>합니다."
            ]
          },
          {
            title: "천장(마일리지) 확정 교환",
            desc: "캐스팅을 진행할 때마다 마일리지가 적립되며, <strong>일정 수치(천장)에 도달하면 원하는 픽업 캐릭터를 확정 영입</strong>할 수 있습니다."
          }
        ]
      }
    ]
  },
  "scene-13": {
    title: "오디션",
    badge: "AUDITION",
    pages: [
      {
        pageTitle: "오디션(공개모집) 시스템",
        intro: "오디션 티켓과 크레딧을 사용하여 원하는 조건을 지정하고 멤버를 영입하는 채용 시스템입니다.",
        cards: [
          {
            title: "오디션 티켓 & 크레딧 소모",
            desc: "1회 오디션 진행 시 <strong>오디션 티켓</strong>과 일정 크레딧이 소모됩니다."
          },
          {
            title: "태그 선택을 통한 모집 범위 압축",
            desc: "포지션, 속성, 특징 등 <strong>최대 2개의 태그를 선택</strong>하여 등장 가능한 멤버 풀을 전략적으로 좁힐 수 있습니다."
          }
        ]
      },
      {
        pageTitle: "모집 시간 및 등장 확률 안내",
        intro: "높은 등급의 캐릭터를 노리기 위한 핵심 오디션 팁입니다.",
        cards: [
          {
            title: "모집 시간 설정 (태그 삭제 주의)",
            desc: "모집 시간은 1시간부터 최대 9시간까지 설정할 수 있습니다.",
            points: [
              "모집 시간이 짧을수록 <strong>설정한 태그가 탈락(삭제)될 확률</strong>이 급격히 높아집니다!",
              "선택한 태그의 멤버를 안전하게 모집하려면 반드시 <strong>최대 시간(9시간) 설정</strong>을 권장합니다."
            ]
          },
          {
            title: "SR / SSR 태그 및 출현 확률",
            desc: "오디션 슬롯에는 희귀한 상위 등급 태그가 무작위로 출현합니다.",
            points: [
              "태그 목록 갱신 시 <strong>SSR 태그는 0.5%</strong>, <strong>SR 태그는 2.5%</strong>의 확률로 출현합니다.",
              "해당 태그를 선택하고 최대 시간(9시간)으로 진행하면 <strong>해당 등급의 멤버를 확정 영입</strong>할 수 있습니다.",
              "태그를 선택하지 않은 상태에서도 기본 확률(SSR: 0.02%, SR: 3%~)에 따라 멤버가 등장할 수 있습니다."
            ]
          }
        ]
      }
    ]
  }
};
// 호환성 별칭
HELP_CONTENT["scene-4"] = HELP_CONTENT["scene-deck"];
HELP_CONTENT["scene-6"] = HELP_CONTENT["scene-unowned"];
HELP_CONTENT["scene-9"] = HELP_CONTENT["scene-shop"];
window.HELP_CONTENT = HELP_CONTENT;

let currentHelpSceneId = "scene-1";
let currentHelpPageIndex = 0;
let isHelpMandatoryFirstTime = false;

export function openHelpModal(sceneId, pageIndex = 0, isMandatory = null) {
  const data = HELP_CONTENT[sceneId];
  if (!data) return;
  currentHelpSceneId = sceneId;
  currentHelpPageIndex = Math.max(0, Math.min(pageIndex, data.pages.length - 1));
  if (isMandatory !== null) {
    isHelpMandatoryFirstTime = !!isMandatory;
  }

  const helpModal = document.getElementById("help-modal");
  const helpTitle = document.getElementById("help-title");
  const helpBadge = document.getElementById("help-badge");
  const helpBody = document.getElementById("help-body");
  const pageIndicator = document.getElementById("help-page-indicator");
  const btnPrev = document.getElementById("btn-help-prev");
  const btnNext = document.getElementById("btn-help-next");
  const btnCloseX = document.getElementById("btn-close-help-x");
  const btnClose = document.getElementById("btn-close-help");

  if (!helpModal || !helpBody) return;

  if (helpTitle) helpTitle.textContent = data.title;
  if (helpBadge) helpBadge.textContent = data.badge || "GUIDE";

  const totalPages = data.pages.length;
  const page = data.pages[currentHelpPageIndex];
  const isLastPage = currentHelpPageIndex >= totalPages - 1;
  const canClose = !isHelpMandatoryFirstTime || isLastPage;

  if (pageIndicator) {
    pageIndicator.textContent = `${currentHelpPageIndex + 1} / ${totalPages}`;
  }
  if (btnPrev) btnPrev.disabled = currentHelpPageIndex <= 0;
  if (btnNext) btnNext.disabled = isLastPage;

  // 닫기 버튼 제어 (최초 진입 시에는 마지막 페이지에 도달해야만 닫을 수 있음)
  if (btnCloseX) {
    btnCloseX.style.display = canClose ? "block" : "none";
  }
  if (btnClose) {
    if (isHelpMandatoryFirstTime) {
      if (isLastPage) {
        btnClose.style.display = "inline-block";
        btnClose.textContent = "확인";
        btnClose.className = "confirm-btn";
      } else {
        btnClose.style.display = "none";
      }
    } else {
      btnClose.style.display = "inline-block";
      btnClose.textContent = "닫기";
      btnClose.className = "cancel-btn";
    }
  }

  let html = '';
  if (page.pageTitle) {
    html += `<div class="help-page-title">📌 ${page.pageTitle}</div>`;
  }
  if (page.intro) {
    html += `<p class="help-page-intro">${page.intro}</p>`;
  }
  if (page.cards && page.cards.length > 0) {
    html += `<div class="help-section">`;
    page.cards.forEach(c => {
      html += `<div class="help-card">`;
      html += `<div class="help-card-title">✨ ${c.title}</div>`;
      if (c.desc) html += `<p class="help-card-desc">${c.desc}</p>`;
      if (c.points && c.points.length > 0) {
        html += `<ul class="help-point-list">`;
        c.points.forEach(pt => {
          html += `<li>${pt}</li>`;
        });
        html += `</ul>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  helpBody.innerHTML = html;
  helpBody.scrollTop = 0;
  helpModal.classList.add("show");
}
window.openHelpModal = openHelpModal;

// =========================================
// 시스템 UI 바인딩 및 도움말
// =========================================

  export function initCommonUI() {
    const cycleBtn = document.getElementById('btn-cycle-main-char');
    if (cycleBtn && !cycleBtn.dataset.bound) {
        cycleBtn.dataset.bound = true;
        cycleBtn.addEventListener('click', () => {
            if (window.PlayerData && window.PlayerData.mainCharacters && window.PlayerData.mainCharacters.length > 1) {
                let chars = window.PlayerData.mainCharacters;
                const mainImgEl = document.getElementById('main-character-img');
                const currentId = mainImgEl.dataset.currentId;
                let idx = chars.indexOf(currentId);
                idx = (idx + 1) % chars.length;
                let targetChar = window.GameData.characters.find(c => c.Character_ID === chars[idx]);
                if (targetChar && targetChar.Character_Image_Full) {
                    mainImgEl.src = targetChar.Character_Image_Full;
                    mainImgEl.dataset.currentId = chars[idx];
                }
            }
        });
    }
    initCoreUI();
  
  if (!PlayerData.name || !PlayerData.uid) {
      showAccountCreationModal();
  }
  updatePlayerProfileUI();
  updateAccountLevelUI();
  updateMainMenuFeatureLocks();
  updateMainMenuNotificationDots();
  checkFeatureUnlocksAndAnnounce();
  document.getElementById("btn-close-account-levelup")?.addEventListener("click", () => { document.getElementById("account-levelup-modal").classList.remove("show"); });

  // AP System
  updateAPUI();

  const apSlider = document.getElementById("ap-to-ticket-slider");
  if (apSlider) {
      apSlider.addEventListener("input", (e) => {
          const val = parseInt(e.target.value) || 1;
          document.getElementById("ap-to-ticket-cost").textContent = val * 20;
          document.getElementById("ap-to-ticket-gain").textContent = val;
      });
  }
  
  const ticketSlider = document.getElementById("ticket-to-ap-slider");
  if (ticketSlider) {
      ticketSlider.addEventListener("input", (e) => {
          const val = parseInt(e.target.value) || 1;
          document.getElementById("ticket-to-ap-cost").textContent = val;
          document.getElementById("ticket-to-ap-gain").textContent = val * 20;
      });
  }

  document.getElementById("btn-ap-to-ticket")?.addEventListener("click", () => {
    let maxConvert = Math.floor(PlayerData.ap / 20);
    if (maxConvert < 1) maxConvert = 1; // Allows showing modal even if 0, but can't convert
    const ticketCount = PlayerData.items['Item_041'] || 0;
    const spaceLeft = 999 - ticketCount;
    if (maxConvert > spaceLeft) maxConvert = spaceLeft;
    if (maxConvert < 1) maxConvert = 1;
    
    if (apSlider) {
        apSlider.max = maxConvert;
        apSlider.value = 1;
        document.getElementById("ap-to-ticket-cost").textContent = 20;
        document.getElementById("ap-to-ticket-gain").textContent = 1;
    }
    document.getElementById("ap-to-ticket-modal").classList.add("show");
  });
  
  document.getElementById("btn-ticket-to-ap")?.addEventListener("click", () => {
    let maxConvert = PlayerData.items['Item_041'] || 0;
    if (maxConvert < 1) maxConvert = 1;
    
    if (ticketSlider) {
        ticketSlider.max = maxConvert;
        ticketSlider.value = 1;
        document.getElementById("ticket-to-ap-cost").textContent = 1;
        document.getElementById("ticket-to-ap-gain").textContent = 20;
    }
    document.getElementById("ticket-to-ap-modal").classList.add("show");
  });

  
  document.getElementById("btn-cancel-ap-to-ticket")?.addEventListener("click", () => {
    document.getElementById("ap-to-ticket-modal").classList.remove("show");
  });
  document.getElementById("btn-cancel-ticket-to-ap")?.addEventListener("click", () => {
    document.getElementById("ticket-to-ap-modal").classList.remove("show");
  });
  
  document.getElementById("btn-confirm-ap-to-ticket")?.addEventListener("click", () => {
    const apSlider = document.getElementById("ap-to-ticket-slider");
    const val = apSlider ? parseInt(apSlider.value) : 1;
    const cost = val * 20;
    
    if (window.PlayerData.ap >= cost) {
      if ((window.PlayerData.items['Item_041'] || 0) + val > 999) {
        alert("AP 티켓은 최대 999개까지만 보유할 수 있습니다.");
        return;
      }
      window.PlayerData.ap -= cost;
      if (!window.PlayerData.items['Item_041']) window.PlayerData.items['Item_041'] = 0;
      window.PlayerData.items['Item_041'] += val;
      
      if (typeof window.updateAPUI === 'function') window.updateAPUI();
      if (typeof window.updateTopCurrencies === 'function') window.updateTopCurrencies();
      if (typeof window.savePlayerData === 'function') window.savePlayerData();
      
      document.getElementById("ap-to-ticket-modal").classList.remove("show");
    } else {
      alert(`AP가 부족합니다. (필요: ${cost} AP)`);
    }
  });
  
  document.getElementById("btn-confirm-ticket-to-ap")?.addEventListener("click", () => {
    const ticketSlider = document.getElementById("ticket-to-ap-slider");
    const val = ticketSlider ? parseInt(ticketSlider.value) : 1;
    
    if ((window.PlayerData.items['Item_041'] || 0) >= val) {
      window.PlayerData.items['Item_041'] -= val;
      if (window.PlayerData.ap === undefined) window.PlayerData.ap = 120;
      window.PlayerData.ap += (val * 20);
      
      if (typeof window.updateAPUI === 'function') window.updateAPUI();
      if (typeof window.updateTopCurrencies === 'function') window.updateTopCurrencies();
      if (typeof window.savePlayerData === 'function') window.savePlayerData();
      
      document.getElementById("ticket-to-ap-modal").classList.remove("show");
    } else {
      alert("AP 티켓이 부족합니다.");
    }
  });

  updateTopCurrencies();
  
  
  // Options Modal
  const btnOptions = document.getElementById("btn-options");
  const optionsModal = document.getElementById("options-modal");
  const btnCloseOptions = document.getElementById("btn-close-options");
  const btnToggleBgm = document.getElementById("btn-toggle-bgm");
  const btnReturnLogin = document.getElementById("btn-return-login");
  const bgmMain = document.getElementById("bgm-main");
  
  // Set initial BGM state based on PlayerData (only if currently hidden)
  if (PlayerData.options && PlayerData.options.muteInBackground && document.hidden && bgmMain) {
      bgmMain.muted = true;
  }
  
  // Background BGM logic
  document.addEventListener("visibilitychange", () => {
    const isHidden = document.hidden;
    const shouldMute = PlayerData.options?.muteInBackground && isHidden;
    const bgmLogin = document.getElementById("bgm-login");
    if (bgmMain) bgmMain.muted = shouldMute;
    if (bgmLogin) bgmLogin.muted = shouldMute;
  });

  const chkSkipDup = document.getElementById("chk-skip-dup-gacha");
  const chkAllowSSR = document.getElementById("chk-allow-dup-ssr");
  const wrapperAllowSSR = document.getElementById("wrapper-allow-dup-ssr");
  const inputDevCode = document.getElementById("input-dev-code");
  const btnSubmitDevCode = document.getElementById("btn-submit-dev-code");
  const btnOptionsBattleTest = document.getElementById("btn-options-battle-test");

  const syncOptionsUI = () => {
    if(!PlayerData.options) PlayerData.options = { muteInBackground: false, skipDuplicateGacha: false, allowDuplicateSSR: true };
    if(btnToggleBgm) btnToggleBgm.textContent = PlayerData.options.muteInBackground ? "ON" : "OFF";
    
    if (chkSkipDup) {
      chkSkipDup.checked = !!PlayerData.options.skipDuplicateGacha;
    }
    if (chkAllowSSR) {
      chkAllowSSR.checked = (PlayerData.options.allowDuplicateSSR !== false);
      chkAllowSSR.disabled = !PlayerData.options.skipDuplicateGacha;
      if (wrapperAllowSSR) wrapperAllowSSR.style.opacity = chkAllowSSR.disabled ? "0.5" : "1";
    }

    if (btnOptionsBattleTest) {
      btnOptionsBattleTest.style.display = PlayerData.devModeUnlocked ? "block" : "none";
    }
  };

  if(btnOptions) {
    btnOptions.addEventListener("click", () => {
      syncOptionsUI();
      if(optionsModal) optionsModal.classList.add("show");
    });
  }
  
  if(btnCloseOptions) {
    btnCloseOptions.addEventListener("click", () => {
      if(optionsModal) optionsModal.classList.remove("show");
    });
  }
  
  if(btnToggleBgm) {
    btnToggleBgm.addEventListener("click", () => {
      if(!PlayerData.options) PlayerData.options = { muteInBackground: false };
      PlayerData.options.muteInBackground = !PlayerData.options.muteInBackground;
      btnToggleBgm.textContent = PlayerData.options.muteInBackground ? "ON" : "OFF";
      
      const shouldMute = PlayerData.options.muteInBackground && document.hidden;
      if(bgmMain) bgmMain.muted = shouldMute;
      const bgmLogin = document.getElementById("bgm-login");
      if(bgmLogin) bgmLogin.muted = shouldMute;
    });
  }

  // 중복 가챠 연출 스킵 토글
  if (chkSkipDup) {
    chkSkipDup.addEventListener("change", () => {
      if (!PlayerData.options) PlayerData.options = {};
      PlayerData.options.skipDuplicateGacha = chkSkipDup.checked;
      if (chkAllowSSR) {
        chkAllowSSR.disabled = !chkSkipDup.checked;
        if (wrapperAllowSSR) wrapperAllowSSR.style.opacity = chkAllowSSR.disabled ? "0.5" : "1";
      }
    });
  }

  // SSR 연출 허용 토글
  if (chkAllowSSR) {
    chkAllowSSR.addEventListener("change", () => {
      if (!PlayerData.options) PlayerData.options = {};
      PlayerData.options.allowDuplicateSSR = chkAllowSSR.checked;
    });
  }

  // 개발자 코드 인증 (0782, 0001)
  if (btnSubmitDevCode && inputDevCode) {
    btnSubmitDevCode.addEventListener("click", () => {
      const code = inputDevCode.value.trim();
      if (code === "0001") {
      // 1. 이미 사용했는지 검사 (중복 수령 방지 유지)
      if (!PlayerData.claimedDevCodes) PlayerData.claimedDevCodes = {};
      if (PlayerData.claimedDevCodes['0001']) {
        alert("이미 사용된 개발자 코드입니다.");
        return;
      }

      // 2. [0001] 코드 보상 목록 정의 (여기서 자유롭게 수정/추가하세요)
      const code0001Rewards = {
        'Item_001': 12000,
        'Item_002': 500000,
        'Item_003': 100,
        'Item_004': 10,
        'Item_005': 500,
        'Item_006': 100,
        'Item_008': 1000,
        'Item_009': 50,
        'Item_010': 100,
        'Item_019': 100,
        'Item_022': 25,
        'Item_025': 25,
        'Item_028': 25,
        'Item_031': 25,
        'Item_034': 25,
        'Item_037': 25,
        'Item_041': 50,        
      };

      // 3. 보상 아이템 지급 처리
      if (!PlayerData.items) PlayerData.items = {};
      for (const [itemId, amount] of Object.entries(code0001Rewards)) {
        PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + amount;
      }

      // 4. 사용 완료 처리 및 UI/데이터 업데이트
      PlayerData.claimedDevCodes['0001'] = true;
      inputDevCode.value = "";
      alert("사용자 데이터 초기화에 대한 보상이 지급되었습니다. 불편을 드려 진심으로 죄송합니다.");

      updateTopCurrencies();
      if (typeof window.renderWarehouseItems === 'function') {
        window.renderWarehouseItems();
      }
      if (typeof window.savePlayerData === 'function') {
        window.savePlayerData();
      }

    } else if (code === "8282") {
      // [8282] 코드: Item_001 1200개 지급 (무제한 중복 수령 가능)
      if (!PlayerData.items) PlayerData.items = {};
      PlayerData.items['Item_001'] = (PlayerData.items['Item_001'] || 0) + 1200;

      inputDevCode.value = "";
      alert("🎁 개발자 코드(8282) 보상이 지급되었습니다! (Item_001 +1200)");

      updateTopCurrencies();
      if (typeof window.renderWarehouseItems === 'function') {
        window.renderWarehouseItems();
      }
      if (typeof window.savePlayerData === 'function') {
        window.savePlayerData();
      }

        } else if (code === "7474") {
      if (!PlayerData.items) PlayerData.items = {};
      PlayerData.items['Item_010'] = (PlayerData.items['Item_010'] || 0) + 100;

      inputDevCode.value = "";
      alert("🎁 개발자 코드(7474) 보상이 지급되었습니다! (Item_010 +100)");

      updateTopCurrencies();
      if (typeof window.renderWarehouseItems === 'function') {
        window.renderWarehouseItems();
      }
      if (typeof window.savePlayerData === 'function') {
        window.savePlayerData();
      }

    } else if (code === "0782") {
        if (!PlayerData.items) PlayerData.items = {};
        const devRewards = {
          'Item_001': 100000,
          'Item_002': 10000000,
          'Item_003': 1000,
          'Item_004': 1000,
          'Item_005': 5000,
          'Item_006': 5000,
          'Item_009': 3000,
          'Item_010': 3000,
          'Item_039': 1000,
          'Item_040': 50,
          'Item_041': 100
        };
        for (let i = 11; i <= 38; i++) {
          const id = `Item_${String(i).padStart(3, '0')}`;
          devRewards[id] = 1000;
        }
        for (const [k, v] of Object.entries(devRewards)) {
          PlayerData.items[k] = (PlayerData.items[k] || 0) + v;
        }
        PlayerData.devModeUnlocked = true;
        if (btnOptionsBattleTest) {
          btnOptionsBattleTest.style.display = "block";
        }
        inputDevCode.value = "";
        alert("✅ 개발자 코드가 인증되었습니다!\n개발자 지원 아이템이 창고에 즉시 지급되었으며, 전투 테스트 버튼이 활성화되었습니다.");
        updateTopCurrencies();
        if (typeof window.renderWarehouseItems === 'function') {
          window.renderWarehouseItems();
        }
      } else {
        alert("❌ 잘못된 개발자 코드입니다.");
      }
    });
  }
  
  if (btnOptionsBattleTest) {
    btnOptionsBattleTest.style.display = PlayerData.devModeUnlocked ? "block" : "none";
    btnOptionsBattleTest.addEventListener("click", () => {
      if (optionsModal) optionsModal.classList.remove("show");
      import('./battle.js?v=004276').then(battle => {
        battle.openBattleScene();
      });
    });
  }

  if(btnReturnLogin) {
    btnReturnLogin.addEventListener("click", () => {
      if(optionsModal) optionsModal.classList.remove("show");
      document.querySelectorAll(".scene.active").forEach(el => el.classList.remove("active"));
      document.getElementById("login-scene").classList.add("active");
      
      const bgmLogin = document.getElementById("bgm-login");
      if(bgmMain) {
         bgmMain.pause();
         bgmMain.currentTime = 0;
      }
      if(bgmLogin) {
         bgmLogin.volume = 0.6 * 0.7; // 기본 70% 축소 적용
         bgmLogin.muted = (PlayerData.options?.muteInBackground && document.hidden) || false;
         bgmLogin.play().catch(e => console.log(e));
      }
      
      const btnConnect = document.getElementById("btn-connect");
      if(btnConnect) {
          btnConnect.disabled = false;
          btnConnect.textContent = "접속하기";
      }
    });
  }

  // AP System Modal
  const btnApCollect = document.getElementById("btn-ap-collect");
  const apModal = document.getElementById("ap-collect-modal");
  const btnApClose = document.getElementById("btn-ap-close");
  const btnApClaim = document.getElementById("btn-ap-claim");
  const apCount = document.getElementById("ap-accumulated-count");

  if(btnApCollect) {
    btnApCollect.addEventListener("click", () => {
      if(apCount) apCount.textContent = PlayerData.pendingLiveTickets || 0;
      if(apModal) apModal.classList.add("show");
    });
  }

  if(btnApClose) {
    btnApClose.addEventListener("click", () => {
        if(apModal) apModal.classList.remove("show");
    });
  }

  if(btnApClaim) {
    btnApClaim.addEventListener("click", () => {
      const tickets = PlayerData.pendingLiveTickets || 0;
      if(tickets > 0) {
        PlayerData.items["Item_003"] = (PlayerData.items["Item_003"] || 0) + tickets;
        PlayerData.pendingLiveTickets = 0;
        alert(`라이브 티켓 ${tickets}개를 회수했습니다.`);
        if(apModal) apModal.classList.remove("show");
      } else {
        alert("회수할 라이브 티켓이 없습니다.");
      }
    });
  }

  const loginBg = document.getElementById("login-bg");
  const images = [ 
    "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Login_01.png", 
    "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Login_02.png", 
    "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Login_03.png", 
    "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Login_04.png", 
    "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Login_05.png"
  ];
  if(loginBg) loginBg.style.backgroundImage = `url('${images[Math.floor(Math.random() * images.length)]}')`;

  // 메뉴 이동 버튼
  const menuButtons = document.querySelectorAll(".menu-btn[data-target]");
  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;

      // 기능 잠금 검사 (미해금 시 진입 차단 및 안내)
      if (!isFeatureUnlocked(targetId)) {
        const info = FEATURE_UNLOCKS[targetId];
        if (info) {
          alert(`'${info.name}' 기능은 [${info.storyName}]을(를) 클리어하면 해금됩니다.`);
        }
        return;
      }
      btn.classList.remove('menu-btn-new-unlocked');

      const targetScene = document.getElementById(targetId);
      
      if (targetId === "scene-5") {
          currentSortMode = 'default';
          const lbl = document.getElementById('holomem-sort-label');
          if (lbl) lbl.textContent = "기본 정렬";
          renderHoloMemList(true);
      }
      if (targetId === "scene-unowned") {
          currentSortMode = 'default';
          const lbl = document.getElementById('unowned-sort-label');
          if (lbl) lbl.textContent = "기본 정렬";
          renderHoloMemList(false);
      }
      if (targetId === "scene-8") renderWarehouseList();
      if (targetId === "scene-shop") openShopScene();
      if (targetId === "scene-core") openCoreScene();
      if (targetId === "scene-13") renderAuditionSlots();
      if (targetId === "scene-deck") {
          window.pendingBattleContext = null;
          try {
              if (window.resetDeckSort) window.resetDeckSort();
              if (window.initDeckUI) {
                  window.initDeckUI();
              } else if (window.updateDeckStartButtonVisibility) {
                  window.updateDeckStartButtonVisibility();
              }
          } catch (err) {
              console.error("Error initializing deck UI:", err);
          }
      }
      if (targetId === "scene-7") {
          const listTabBtn = document.querySelector('.kizuna-tab-btn[data-tab="list"]');
          if (listTabBtn) listTabBtn.click();
      }
      if (targetId === "scene-10") {
          if (typeof window.refreshStudioUI === 'function') window.refreshStudioUI();
      }
      if (targetId === "scene-11") {
          if (typeof window.initOfficeUI === 'function') window.initOfficeUI();
          else if (typeof window.updateOfficeUI === 'function') window.updateOfficeUI();
      }

      changeSceneWipe(document.getElementById("main-scene"), targetScene);
    });
  });

  const navButtons = document.querySelectorAll(".btn-back, .btn-home");
  navButtons.forEach(btn => {
    btn.addEventListener("click", function() {
      const currentScene = this.closest('.scene');
      if (currentScene && currentScene.id === 'scene-battle') {
        if (typeof window.stopBattleBgm === 'function') window.stopBattleBgm();
      }
      if (currentScene && currentScene.id === 'scene-deck') {
        if (btn.classList.contains('btn-back') && window.pendingBattleContext && window.pendingBattleContext.returnScene) {
          const retId = window.pendingBattleContext.returnScene;
          window.pendingBattleContext = null;
          if (window.updateDeckStartButtonVisibility) window.updateDeckStartButtonVisibility();
          const returnScene = document.getElementById(retId);
          if (returnScene) {
            changeSceneWipe(currentScene, returnScene);
            return;
          }
        }
        window.pendingBattleContext = null;
        if (window.updateDeckStartButtonVisibility) window.updateDeckStartButtonVisibility();
      }
      changeSceneWipe(currentScene, document.getElementById("main-scene"));
    });
  });

  const warehouseTabs = document.querySelectorAll("#warehouse-tabs .tab-btn");
  warehouseTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      warehouseTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentWarehouseFilter = btn.getAttribute("data-type");
      renderWarehouseList();
    });
  });


  // 도움말 모달 페이지 이동 및 닫기 바인딩
  document.getElementById("btn-help-prev")?.addEventListener("click", () => {
    openHelpModal(currentHelpSceneId, currentHelpPageIndex - 1);
  });
  document.getElementById("btn-help-next")?.addEventListener("click", () => {
    openHelpModal(currentHelpSceneId, currentHelpPageIndex + 1);
  });
  const handleCloseHelpModal = () => {
    const totalPages = (window.HELP_CONTENT && window.HELP_CONTENT[currentHelpSceneId]?.pages?.length) || 1;
    if (isHelpMandatoryFirstTime && currentHelpPageIndex < totalPages - 1) {
      return;
    }
    isHelpMandatoryFirstTime = false;
    document.getElementById("help-modal")?.classList.remove("show");
  };
  document.getElementById("btn-close-help")?.addEventListener("click", handleCloseHelpModal);
  document.getElementById("btn-close-help-x")?.addEventListener("click", handleCloseHelpModal);
  document.getElementById("help-modal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("help-modal")) {
      handleCloseHelpModal();
    }
  });

  // 신규 기능 해금 팝업 닫기 바인딩
  document.getElementById("btn-close-unlock")?.addEventListener("click", () => {
    document.getElementById("unlock-modal")?.classList.remove("show");
  });
  document.getElementById("unlock-modal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("unlock-modal")) {
      document.getElementById("unlock-modal")?.classList.remove("show");
    }
  });

  // 각 씬의 도움말 버튼 (? 아이콘) 클릭 시 모달 오픈 (임의 오픈이므로 언제든 닫기 가능)
  document.querySelectorAll(".btn-help, #btn-gacha-main-help, .gacha-help-btn").forEach(btn => {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      const currentScene = this.closest('.scene');
      const currentSceneId = currentScene ? currentScene.id : "scene-1";
      openHelpModal(currentSceneId, 0, false);
    });
  });

  // 시스템 리셋
  const btnAccountReset = document.getElementById("btn-account-reset");
  const resetConfirmModal = document.getElementById("reset-confirm-modal");
  let resetStep = 0;
  
  if (btnAccountReset) {
    btnAccountReset.addEventListener("click", () => {
      resetStep = 1;
      document.getElementById("reset-confirm-text").innerHTML = "계정을 초기화합니다.<br>진행하시겠습니까?";
      resetConfirmModal.classList.add("show");
    });
  }
  
  document.getElementById("btn-reset-cancel")?.addEventListener("click", () => {
    resetConfirmModal.classList.remove("show");
    resetStep = 0;
  });
  
  document.getElementById("btn-reset-execute")?.addEventListener("click", () => {
    if (resetStep === 1) {
      resetStep = 2;
      document.getElementById("reset-confirm-text").innerHTML = "초기화된 계정은 복구할 수 없습니다.<br>정말로 진행하시겠습니까?";
    } else if (resetStep === 2) {
      resetPlayerData();
      resetConfirmModal.classList.remove("show");
      resetStep = 0;
      document.getElementById("reset-alert-text").innerHTML = "계정이 초기화되었습니다.";
      document.getElementById("reset-alert-modal").classList.add("show");
      updateTopCurrencies();
      updateAPUI();
      updateAccountLevelUI();
      showAccountCreationModal();
      updateMainCharacterImage();

      // 전역 및 UI 데이터 완전 초기화
      window.activeRehearsalIssues = {};
      window.pendingBattleContext = null;
      window.activeBattleContext = null;
      window.currentLiveMode = null;

      // 메인 메뉴 기능 잠금 및 신규 해금 강조 클래스 완전 초기화
      document.querySelectorAll('.menu-btn-new-unlocked').forEach(b => b.classList.remove('menu-btn-new-unlocked'));
      updateMainMenuFeatureLocks();

      if (typeof window.renderDonationBox === 'function') window.renderDonationBox();
      if (typeof window.renderOfficeSupplies === 'function') window.renderOfficeSupplies();
      if (typeof window.refreshStudioUI === 'function') window.refreshStudioUI();
      if (typeof window.updateOfficeUI === 'function') window.updateOfficeUI();
      if (typeof window.initDeckUI === 'function') window.initDeckUI();
      if (typeof window.renderWarehouseList === 'function') window.renderWarehouseList();
      if (typeof window.renderAuditionSlots === 'function') window.renderAuditionSlots();

      const dList = document.getElementById('studio-donation-list');
      if (dList) dList.innerHTML = '<div style="color:rgba(255,255,255,0.5); text-align:center; padding-top:20px;">적립된 아이템이 없습니다.</div>';
      const sList = document.getElementById('office-supplies-list');
      if (sList) sList.innerHTML = '<div style="color:#7f8c8d; text-align:center; margin-top:20px;">비품 창고가 비어있습니다.</div>';
    }
  });

  document.getElementById("btn-reset-ok")?.addEventListener("click", () => {
    document.getElementById("reset-alert-modal").classList.remove("show");
  });

  // 정렬 및 스크롤 UI 공통 설정
  const setupSortUI = (prefix, isOwned) => {
    const btn = document.getElementById(`${prefix}-sort-btn`);
    const options = document.getElementById(`${prefix}-sort-options`);
    const label = document.getElementById(`${prefix}-sort-label`);
    const scrollTopBtn = document.getElementById(`btn-${prefix}-scroll-top`);
    const scene = document.getElementById(isOwned ? "scene-5" : "scene-unowned");
    
    if (btn && options) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        options.classList.toggle("show");
      });
      options.querySelectorAll(".sort-option").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentSortMode = opt.getAttribute("data-sort");
          label.textContent = opt.textContent;
          options.classList.remove("show");
          renderHoloMemList(isOwned);
        });
      });
      document.addEventListener("click", () => {
        options.classList.remove("show");
      });
    }
    
    if (scrollTopBtn && scene) {
      scrollTopBtn.addEventListener("click", () => {
        scene.scrollTo({ top: 0, behavior: 'smooth' });
      });
      scene.addEventListener("scroll", () => {
        if (scene.scrollTop > 300) {
          scrollTopBtn.classList.add("show");
        } else {
          scrollTopBtn.classList.remove("show");
        }
      });
    }
  };
  
  setupSortUI("holomem", true);
  setupSortUI("unowned", false);

  // 메인 캐릭터 변경 모달
  const btnChangeMain = document.getElementById("btn-change-main");
  const mainCharModal = document.getElementById("main-char-modal");
  const btnConfirmMainChar = document.getElementById("btn-confirm-main-char");
  let tempSelected = new Set();
  

  const btnChangeBgm = document.getElementById("btn-change-bgm");
  const bgmModal = document.getElementById("bgm-modal");
  const btnCloseBgm = document.getElementById("btn-close-bgm");
  const btnConfirmBgm = document.getElementById("btn-confirm-bgm");
  
  let tempSelectedBgm = new Set();

  if (btnChangeBgm && bgmModal) {
    // 롱클릭 로직
    let pressTimer = null;
    let isLongPress = false;
    
    const startPress = (e) => {
      if (e.button && e.button !== 0) return; // 좌클릭만
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        // BGM 강제 변경
        playNextRandomBgm();
        const nextSongName = GameData.songs ? GameData.songs.find(s => s.Song_ID === PlayerData.currentBgm)?.Song_Name : PlayerData.currentBgm;
        
        // 커스텀 토스트 메시지 띄우기
        const toast = document.createElement("div");
        toast.textContent = `▶ ${nextSongName}`;
        toast.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #00a8ff; padding: 10px 20px; border-radius: 20px; font-weight: bold; z-index: 10000; animation: fadeOut 2s forwards; pointer-events: none; border: 1px solid #00a8ff; box-shadow: 0 0 10px rgba(0,168,255,0.5);";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
      }, 1000);
    };

    const cancelPress = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    
    btnChangeBgm.addEventListener("mousedown", startPress);
    btnChangeBgm.addEventListener("touchstart", startPress, {passive: true});
    btnChangeBgm.addEventListener("mouseup", cancelPress);
    btnChangeBgm.addEventListener("mouseleave", cancelPress);
    btnChangeBgm.addEventListener("touchend", cancelPress);

    btnChangeBgm.addEventListener("click", (e) => {
      if (isLongPress) return; // 롱클릭 후 클릭이벤트 무시
      
      bgmModal.classList.add("show");
      const chkMute = document.getElementById("chk-bgm-modal-mute");
      if (chkMute) {
        if (!PlayerData.options) PlayerData.options = {};
        chkMute.checked = !!PlayerData.options.muteBgm;
      }
      const listContainer = document.getElementById("bgm-list-container");
      listContainer.innerHTML = "";
      
      const allSongs = GameData.songs || [];
      const ownedSongs = PlayerData.songs || [];
      
      tempSelectedBgm = new Set(PlayerData.bgmPlaylist || (PlayerData.currentBgm ? [PlayerData.currentBgm] : ["Song_000"]));
      if (tempSelectedBgm.size === 0) tempSelectedBgm.add("Song_000");

      const updateConfirmBgmBtn = () => {
        if (btnConfirmBgm) btnConfirmBgm.textContent = `등록 확인 : ${tempSelectedBgm.size}곡`;
      };
      updateConfirmBgmBtn();
      
      allSongs.forEach(song => {
          if (!ownedSongs.includes(song.Song_ID)) return;
          
          const isSelected = tempSelectedBgm.has(song.Song_ID);
          const row = document.createElement("div");
          row.style.cssText = `
              display: flex; align-items: center; justify-content: space-between;
              padding: 15px; border-radius: 8px; background: rgba(0,0,0,0.05);
              border: 2px solid ${isSelected ? '#00a8ff' : '#ccc'};
              cursor: pointer; transition: 0.2s;
              box-shadow: ${isSelected ? '0 0 10px rgba(0,168,255,0.4)' : 'none'};
          `;
          
          let badgeColor = "#3498db";
          if (song.Song_Type == "1") badgeColor = "#f1c40f";
          else if (song.Song_Type == "2") badgeColor = "#e84393";
          
          row.innerHTML = `
              <div style="display: flex; align-items: center; gap: 15px;">
                  <div style="font-size: 24px;">🎵</div>
                  <div style="display: flex; flex-direction: row; align-items: center; gap: 10px;">
                      <div style="font-weight: bold; font-size: 1.1rem;">${song.Song_Name}</div>
                      ${(song.Song_Singer || "미상").split("/").map(s => `<div style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.3); margin-right: 5px;">${s.trim()}</div>`).join("")}
                  </div>
              </div>
              <div>
                  ${isSelected ? '<span style="color: #00a8ff; font-weight: bold;">[선택됨]</span>' : '<span style="color: transparent; font-weight: bold;">[선택됨]</span>'}
              </div>
          `;
          
          row.addEventListener("click", () => {
              if (tempSelectedBgm.has(song.Song_ID)) {
                  if (tempSelectedBgm.size > 1) { // 최소 1곡은 선택 유지
                      tempSelectedBgm.delete(song.Song_ID);
                      row.style.borderColor = "#ccc";
                      row.style.boxShadow = "none";
                      row.querySelector("span").style.color = "transparent";
                  }
              } else {
                  tempSelectedBgm.add(song.Song_ID);
                  row.style.borderColor = "#00a8ff";
                  row.style.boxShadow = "0 0 10px rgba(0,168,255,0.4)";
                  row.querySelector("span").style.color = "#00a8ff";
              }
              updateConfirmBgmBtn();
          });
          
          listContainer.appendChild(row);
      });
    });
    
    if (btnConfirmBgm) {
        btnConfirmBgm.addEventListener("click", () => {
            const newList = Array.from(tempSelectedBgm);
            PlayerData.bgmPlaylist = newList;
            
            // 리스트 변경 시 큐 초기화 및 새로운 곡으로 즉시 변경
            playedSongsQueue = [];
            const nextId = newList[Math.floor(Math.random() * newList.length)];
            
            if (PlayerData.currentBgm === nextId) {
                updateMainBgmPlayer(true); // 강제 재시작
            } else {
                PlayerData.currentBgm = nextId;
            }
            
            bgmModal.classList.remove("show");
            
            // 토스트로 바뀐 곡 알림
            const songName = GameData.songs ? GameData.songs.find(s => s.Song_ID === nextId)?.Song_Name : nextId;
            const toast = document.createElement("div");
            toast.textContent = `▶ ${songName} (셔플 됨)`;
            toast.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #00a8ff; padding: 10px 20px; border-radius: 20px; font-weight: bold; z-index: 10000; animation: fadeOut 2s forwards; pointer-events: none; border: 1px solid #00a8ff; box-shadow: 0 0 10px rgba(0,168,255,0.5);";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        });
    }

    if (btnCloseBgm) {
        btnCloseBgm.addEventListener("click", () => {
            bgmModal.classList.remove("show");
        });
    }

    const chkModalBgm = document.getElementById("chk-bgm-modal-mute");
    if (chkModalBgm) {
        chkModalBgm.addEventListener("change", (e) => {
            if (!PlayerData.options) PlayerData.options = {};
            PlayerData.options.muteBgm = e.target.checked;
            if (typeof window.savePlayerData === 'function') {
                window.savePlayerData();
            }
            if (typeof window.applyVolumeSettings === 'function') {
                window.applyVolumeSettings();
            }
        });
    }
  }

  // === 컨디션 즉시 회복 모달 (🍖) ===
  const btnFoodRecovery = document.getElementById("btn-food-recovery");
  const foodModal = document.getElementById("food-modal");
  const btnCloseFoodModal = document.getElementById("btn-close-food-modal");
  let selectedFoodCharId = null;

  const FOOD_TYPES = [
    { id: 'Item_018', name: '치쿠젠니', heal: 40 },
    { id: 'Item_019', name: '오니기리', heal: 20 },
    { id: 'Item_020', name: '쿠키', heal: 10 }
  ];

  function showFloatingConditionText(cardEl, text) {
    if (!cardEl) return;
    const floatEl = document.createElement('div');
    floatEl.className = 'floating-condition-text';
    floatEl.textContent = text;
    floatEl.style.top = '12px';
    floatEl.style.right = '45px';
    cardEl.appendChild(floatEl);
    setTimeout(() => {
      if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl);
    }, 850);
  }

  function renderFoodRecoveryModal() {
    if (!foodModal) return;
    const charListEl = document.getElementById('food-char-list');
    const itemsRowEl = document.getElementById('food-items-row');
    if (!charListEl || !itemsRowEl) return;

    // 보유 캐릭터 목록 (피로도 오름차순: 컨디션 낮은 순서가 상단으로 오도록 정렬하여 편의성 극대화)
    const ownedChars = (GameData.characters || [])
      .filter(c => (PlayerData.characters || []).includes(c.Character_ID))
      .sort((a, b) => {
        const condA = (PlayerData.characterStats && PlayerData.characterStats[a.Character_ID]?.condition !== undefined) ? PlayerData.characterStats[a.Character_ID].condition : 100;
        const condB = (PlayerData.characterStats && PlayerData.characterStats[b.Character_ID]?.condition !== undefined) ? PlayerData.characterStats[b.Character_ID].condition : 100;
        return condA - condB;
      });

    if (ownedChars.length === 0) {
      charListEl.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px;">보유한 캐릭터가 없습니다.</div>';
    } else {
      // 선택된 캐릭터가 없으면 가장 컨디션이 낮은 첫 번째 캐릭터 자동 선택
      if (!selectedFoodCharId || !ownedChars.some(c => c.Character_ID === selectedFoodCharId)) {
        selectedFoodCharId = ownedChars[0].Character_ID;
      }

      charListEl.innerHTML = '';
      ownedChars.forEach(c => {
        const stats = (PlayerData.characterStats && PlayerData.characterStats[c.Character_ID]) || { level: 1, star: 1, condition: 100 };
        const cond = stats.condition !== undefined ? stats.condition : 100;
        
        // 25이하는 빨강, 50이하는 주황, 그 이상은 초록
        let condColor = '#10b981';
        let condBg = 'rgba(16, 185, 129, 0.15)';
        if (cond <= 25) {
          condColor = '#ef4444';
          condBg = 'rgba(239, 68, 68, 0.2)';
        } else if (cond <= 50) {
          condColor = '#f59e0b';
          condBg = 'rgba(245, 158, 11, 0.2)';
        }

        const isSelected = (selectedFoodCharId === c.Character_ID);
        const tier = c.Character_Tier || 'R';
        const tierColor = tier === 'SSR' ? '#ff9ff3' : (tier === 'SR' ? '#f1c40f' : '#00a8ff');
        const imgUrl = c.Character_Image_Square || c.Character_Image_Full || '';

        const card = document.createElement('div');
        card.className = `food-char-card ${isSelected ? 'selected' : ''}`;
        card.dataset.charId = c.Character_ID;
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="position: relative; width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0;">
              ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="${c.Character_Name}">` : ''}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 0.72rem; font-weight: 900; color: ${tierColor}; background: rgba(0,0,0,0.5); padding: 1px 5px; border-radius: 4px; border: 1px solid ${tierColor};">${tier}</span>
                <span style="font-weight: bold; font-size: 0.95rem; color: #fff;">${c.Character_Name}</span>
              </div>
              <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 3px; display: flex; gap: 8px;">
                <span style="color: #facc15; font-weight: bold;">⭐ ${stats.star || 1}</span>
                <span style="color: #38bdf8; font-weight: bold;">Lv.${stats.level || 1}</span>
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="char-cond-badge" style="display: inline-block; padding: 3px 8px; border-radius: 6px; background: ${condBg}; border: 1px solid ${condColor}; color: ${condColor}; font-weight: 900; font-size: 0.88rem;">
              컨디션: <span class="char-cond-val">${Number(cond).toFixed(1)}</span> / 100
            </div>
            <div style="width: 90px; height: 5px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden; margin-top: 4px; margin-left: auto;">
              <div class="char-cond-bar" style="width: ${Math.min(100, cond)}%; height: 100%; background: ${condColor}; transition: width 0.3s ease;"></div>
            </div>
          </div>
        `;

        card.addEventListener('click', () => {
          selectedFoodCharId = c.Character_ID;
          charListEl.querySelectorAll('.food-char-card').forEach(el => el.classList.remove('selected'));
          card.classList.add('selected');
          renderFoodButtons();
        });

        charListEl.appendChild(card);
      });
    }

    renderFoodButtons();
  }

  function renderFoodButtons() {
    const itemsRowEl = document.getElementById('food-items-row');
    if (!itemsRowEl) return;
    itemsRowEl.innerHTML = '';

    const selCharStats = selectedFoodCharId ? ((PlayerData.characterStats && PlayerData.characterStats[selectedFoodCharId]) || { condition: 100 }) : null;
    const curCond = selCharStats ? (selCharStats.condition !== undefined ? selCharStats.condition : 100) : 100;
    const isCondFull = curCond >= 100;

    FOOD_TYPES.forEach(food => {
      const myQty = (PlayerData.items && PlayerData.items[food.id]) || 0;
      let itemData = Array.isArray(GameData.items) ? GameData.items.find(i => i.Item_ID === food.id) : null;
      const iconUrl = itemData && itemData.Item_Icon ? itemData.Item_Icon : '';
      
      const btn = document.createElement('button');
      btn.className = 'food-item-btn';
      btn.disabled = (!selectedFoodCharId || myQty <= 0 || isCondFull);
      btn.title = isCondFull ? '이미 컨디션이 최대입니다.' : (myQty <= 0 ? '보유 수량이 부족합니다.' : `${food.name} 먹이기 (+${food.heal})`);
      
      btn.innerHTML = `
        <div style="width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); border-radius: 6px;">
          ${iconUrl ? `<img src="${iconUrl}" style="width: 36px; height: 36px; object-fit: contain;" alt="${food.name}">` : `<span style="font-size: 1.5rem;">🍱</span>`}
        </div>
        <div style="font-size: 0.85rem; font-weight: bold; color: #f8fafc; margin-top: 2px;">
          ${food.name} <span style="color: #22c55e; font-size: 0.78rem;">(+${food.heal})</span>
        </div>
        <div style="font-size: 0.8rem; color: ${myQty > 0 ? '#38bdf8' : '#64748b'}; font-weight: bold;">
          보유: ${myQty}개
        </div>
      `;

      btn.addEventListener('click', () => {
        if (!selectedFoodCharId) return;
        const currentQty = (PlayerData.items && PlayerData.items[food.id]) || 0;
        if (currentQty <= 0) return;

        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        if (!PlayerData.characterStats[selectedFoodCharId]) {
          PlayerData.characterStats[selectedFoodCharId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
        }
        
        let cStat = PlayerData.characterStats[selectedFoodCharId];
        let cCond = cStat.condition !== undefined ? cStat.condition : 100;
        if (cCond >= 100) return;

        // 아이템 1개 소모
        PlayerData.items[food.id] = currentQty - 1;
        const healedCond = Math.min(100, cCond + food.heal);
        const actualGain = healedCond - cCond;
        cStat.condition = healedCond;

        if (typeof window.savePlayerData === 'function') {
          window.savePlayerData();
        }

        // 대상 캐릭터 카드 시각적 피드백 (+n 플로팅 애니메이션 및 컨디션 즉시 갱신)
        const targetCard = document.querySelector(`.food-char-card[data-char-id="${selectedFoodCharId}"]`);
        if (targetCard) {
          showFloatingConditionText(targetCard, `+${Number(actualGain).toFixed(1)} 🍖`);
          
          const valEl = targetCard.querySelector('.char-cond-val');
          const barEl = targetCard.querySelector('.char-cond-bar');
          const badgeEl = targetCard.querySelector('.char-cond-badge');
          
          if (valEl) valEl.textContent = Number(healedCond).toFixed(1);
          if (barEl) barEl.style.width = `${Math.min(100, healedCond)}%`;
          
          let newColor = '#10b981';
          let newBg = 'rgba(16, 185, 129, 0.15)';
          if (healedCond <= 25) {
            newColor = '#ef4444';
            newBg = 'rgba(239, 68, 68, 0.2)';
          } else if (healedCond <= 50) {
            newColor = '#f59e0b';
            newBg = 'rgba(245, 158, 11, 0.2)';
          }
          
          if (badgeEl) {
            badgeEl.style.background = newBg;
            badgeEl.style.borderColor = newColor;
            badgeEl.style.color = newColor;
          }
          if (barEl) {
            barEl.style.background = newColor;
          }
        }

        // 사운드 재생
        if (typeof window.playAssetSound === 'function') {
          window.playAssetSound('asset_018');
        }

        // 음식 버튼 상태 및 보유량 재계산
        renderFoodButtons();
      });

      itemsRowEl.appendChild(btn);
    });
  }

  function openFoodRecoveryModal() {
    if (!foodModal) return;
    renderFoodRecoveryModal();
    foodModal.classList.add('show');
  }
  window.openFoodRecoveryModal = openFoodRecoveryModal;

  if (btnFoodRecovery) {
    btnFoodRecovery.addEventListener('click', openFoodRecoveryModal);
  }
  if (btnCloseFoodModal) {
    btnCloseFoodModal.addEventListener('click', () => {
      if (foodModal) foodModal.classList.remove('show');
    });
  }

  if (btnChangeMain && mainCharModal) {
    btnChangeMain.addEventListener("click", () => {
      mainCharModal.classList.add("show");
      const listContainer = document.getElementById("main-char-list-container");
      listContainer.innerHTML = "";
      
      tempSelected = new Set(PlayerData.mainCharacters || ["C_ID_01"]);
      
      const updateConfirmBtn = () => {
        if (btnConfirmMainChar) btnConfirmMainChar.textContent = `등록 확인 : ${tempSelected.size}명`;
      };
      updateConfirmBtn();

      const ownedChars = (GameData.characters || []).filter(c => 
        PlayerData.characters.includes(c.Character_ID) && c.Character_Image_Full
      );

      const tiers = ["SSR", "SR", "R"];
      const tierColors = { "SSR": "#ff9ff3", "SR": "#f1c40f", "R": "#00a8ff" };

      tiers.forEach(tier => {
        const tierChars = ownedChars.filter(c => c.Character_Tier === tier).sort((a, b) => {
          return (a.Character_ID || "").localeCompare(b.Character_ID || "");
        });

        if (tierChars.length > 0) {
          const header = document.createElement("h3");
          header.textContent = `${tier} 등급`;
          header.style.cssText = `display: block; width: 100%; margin: 15px 0 10px 5px; border-bottom: 2px solid ${tierColors[tier]}; padding-bottom: 5px; color: ${tierColors[tier]}; text-align: left;`;
          listContainer.appendChild(header);

          const grid = document.createElement("div");
          grid.className = "main-char-grid";
          grid.style.cssText = "display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; width: 100%; max-height: none; overflow-y: visible; margin-bottom: 20px;";

          tierChars.forEach(char => {
            const card = document.createElement("div");
            const isSelected = tempSelected.has(char.Character_ID);
            card.className = `main-char-card card-${char.Character_Tier.toLowerCase()} ${isSelected ? 'selected' : ''}`;
            card.innerHTML = `<img class="main-char-card-bg" src="${char.Character_Image_Full}" loading="lazy" style="object-fit: cover; object-position: center 20%; pointer-events: none;">`;
            
            card.addEventListener("click", () => {
              if (tempSelected.has(char.Character_ID)) {
                if (tempSelected.size > 1) {
                  tempSelected.delete(char.Character_ID);
                  card.classList.remove('selected');
                } else {
                  alert("최소 1명의 캐릭터는 등록되어야 합니다.");
                }
              } else {
                tempSelected.add(char.Character_ID);
                card.classList.add('selected');
              }
              updateConfirmBtn();
            });
            grid.appendChild(card);
          });
          
          listContainer.appendChild(grid);
        }
      });
    });

    if (btnConfirmMainChar) {
      btnConfirmMainChar.addEventListener("click", () => {
        if (tempSelected.size === 0) return;
        PlayerData.mainCharacters = Array.from(tempSelected); // Auto proxy save
        updateMainCharacterImage();
        mainCharModal.classList.remove("show");
      });
    }
  }
  document.getElementById("btn-close-main-char")?.addEventListener("click", () => {
    mainCharModal.classList.remove("show");
  });
}

// =========================================
// Scene 5: Holomem List
// =========================================
export function renderHoloMemList(isOwnedScene = true) {
  const containerId = isOwnedScene ? "holomem-list-container" : "unowned-holomem-list-container";
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = ""; 

  const chars = GameData.characters || [];
  chars.forEach(char => {
    if (!char._isLevelAssigned) {
      char._demoStars = 1; 
      char._demoLevel = 1; 
      char._maxLevel = 60 + (char._demoStars * 10); 
      char._isLevelAssigned = true; 
    }
  });

  const filteredChars = chars.filter(char => {
    if (!char.Character_ID || !char.Character_Name) return false;
    if (String(char.Character_Gacha).trim() === "0") return false;
    
    const isOwned = PlayerData.characters.includes(char.Character_ID);
    return isOwnedScene ? isOwned : !isOwned;
  });

  if (!isOwnedScene && currentSortMode === "level") {
    currentSortMode = "default";
  }

  const sortedChars = [...filteredChars].sort((a, b) => {
    const statA = (isOwnedScene && PlayerData && PlayerData.characterStats && PlayerData.characterStats[a.Character_ID]) || { star: 1, level: 1 };
    const statB = (isOwnedScene && PlayerData && PlayerData.characterStats && PlayerData.characterStats[b.Character_ID]) || { star: 1, level: 1 };
    const lvlA = isOwnedScene ? statA.level : (a._demoLevel || 1);
    const lvlB = isOwnedScene ? statB.level : (b._demoLevel || 1);
    const starA = isOwnedScene ? statA.star : 3;
    const starB = isOwnedScene ? statB.star : 3;
    
    const levelSort = () => {
        if (lvlB !== lvlA) return lvlB - lvlA;
        const tierWeights = { "SSR": 3, "SR": 2, "R": 1, "N": 0 };
        const tierA = tierWeights[a.Character_Tier] || 0;
        const tierB = tierWeights[b.Character_Tier] || 0;
        if (tierA !== tierB) return tierB - tierA;
        return (a.Character_ID || "").localeCompare(b.Character_ID || "");
    };
    
    const defaultSort = () => {
        const tierWeights = { "SSR": 3, "SR": 2, "R": 1, "N": 0 };
        const tierA = tierWeights[a.Character_Tier] || 0;
        const tierB = tierWeights[b.Character_Tier] || 0;
        if (tierA !== tierB) return tierB - tierA;
        if (lvlB !== lvlA) return lvlB - lvlA;
        return (a.Character_ID || "").localeCompare(b.Character_ID || "");
    };

    if (currentSortMode === "level") {
      return levelSort();
    } else if (currentSortMode === "type") {
      const typeWeights = { "청초": 1, "게닌": 2, "쿨": 3, "아티스트": 4, "큐트": 5, "광기": 6, "에로": 7 };
      const wA = typeWeights[a.Character_Type] || 99;
      const wB = typeWeights[b.Character_Type] || 99;
      if (wA !== wB) return wA - wB;
      return defaultSort();
    } else if (currentSortMode === "class") {
      const clsA = (a.Character_Role || "").split('/')[0].replace(/\s/g, "").trim();
      const clsB = (b.Character_Role || "").split('/')[0].replace(/\s/g, "").trim();
      const roleWeights = { "근거리딜러": 1, "원거리딜러": 2, "마법딜러": 3, "탱커": 4, "암살자": 5, "버퍼": 6, "디버퍼": 7, "힐러": 8 };
      const wA = roleWeights[clsA] || 99;
      const wB = roleWeights[clsB] || 99;
      if (wA !== wB) return wA - wB;
      return defaultSort();
    } else {
      return defaultSort();
    }});

  const attrIcons = {
    "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
    "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
    "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
    "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
    "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
    "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
    "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
  };

  const groups = {};
  
  sortedChars.forEach(char => {
    let groupKey = "";
    if (currentSortMode === "level") {
      groupKey = `Lv. ${char._demoLevel || 1}`;
    } else if (currentSortMode === "type") {
      groupKey = char.Character_Type || "기타 속성";
    } else if (currentSortMode === "class") {
      groupKey = (char.Character_Role || "").split('/')[0].trim() || "기타 클래스";
    } else {
      groupKey = `${char.Character_Tier || "ETC"} 랭크`;
    }
    
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(char);
  });

  Object.keys(groups).forEach(key => {
    if (currentSortMode !== "level") {
      const header = document.createElement("div");
      header.className = "sort-group-header";
      header.id = 'holomem-group-' + key;
      if (currentSortMode === "type" && attrIcons[key]) {
        header.innerHTML = `<img src="${attrIcons[key]}" alt="${key}" style="width:36px; height:36px; vertical-align:middle; margin-right:12px;">${key} 속성`;
      } else {
        header.textContent = key;
      }
      container.appendChild(header);
    }

    const groupGrid = document.createElement("div");
    groupGrid.className = "holomem-grid";
    
    groups[key].forEach(char => {
      const classes = (char.Character_Class || "").split('/').map(s => s.trim()).filter(Boolean);
      const roles = (char.Character_Role || "").split('/').map(s => s.trim()).filter(Boolean);
      
      let rolesHtml = "";
      roles.forEach(r => {
        const rRaw = r.replace(/ /g, '');
        rolesHtml += `<div class="holomem-card-class-badge card-class-${rRaw}">${r}</div>`;
      });
      let classesHtml = "";
      classes.forEach(c => {
        const cRaw = c.replace(/ /g, '');
        classesHtml += `<div class="holomem-card-class-badge card-class-${cRaw}">${c}</div>`;
      });

      const card = document.createElement("div");
      card.className = `holomem-card card-${char.Character_Tier.toLowerCase()} ${isOwnedScene ? "" : "unowned"}`;
      
      const typeIcon = attrIcons[char.Character_Type] || "";
      const typeBadgeHtml = typeIcon ? `<div class="holomem-card-type-badge"><img src="${typeIcon}" alt="${char.Character_Type}"></div>` : "";

      let starBadgeHtml = "";
      let levelHtml = "";
      if (isOwnedScene) {
        let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
        if (GameData && GameData.assets) {
          const assetObj = GameData.assets.find(a => a.Asset_ID === 'asset_010');
          if (assetObj && assetObj.Asset_Link) starIconUrl = assetObj.Asset_Link;
        }
        const charStats = (PlayerData && PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) || { star: 1, level: 1 };
        const stars = Math.max(1, charStats.star || 1);
        let starsHtml = "";
        for(let i = 0; i < stars; i++) {
          starsHtml += `<img src="${starIconUrl}" style="width: 24px; height: 24px; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8)); margin-left: -2px;">`;
        }
        starBadgeHtml = `
          <div style="position: absolute; top: -10px; right: 10px; z-index: 10; display:flex;">
            ${starsHtml}
          </div>
        `;
        levelHtml = `<span class="holomem-card-level">Lv. ${charStats.level || 1}</span>`;
      } else {
        levelHtml = `<span class="holomem-card-level" style="font-weight: bold;">미보유</span>`;
      }

      card.innerHTML = `
        ${typeBadgeHtml}
        ${starBadgeHtml}
        <div class="holomem-card-inner">
          <img class="holomem-card-bg" src="${char.Character_Image_Full}" loading="lazy" style="object-fit: cover; object-position: center 20%;">
          <div class="holomem-card-gradient"></div>
          <div class="holomem-card-info" style="padding-bottom: 8px;">
            <div class="holomem-card-subname" style="margin-bottom: 0;">${char.Character_SubName || ''}</div>
            <div class="holomem-card-name" style="margin-bottom: 2px;">${char.Character_Name}</div>
            <div class="holomem-card-bottom-row" style="position: relative;">
              ${levelHtml}
              <div style="position: absolute; right: 0; bottom: 0; text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                <div class="holomem-card-rarity ui-rarity-${char.Character_Tier.toLowerCase()}">${char.Character_Tier}</div>
                <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                  <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:flex-end;">${rolesHtml}</div>
                  <div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:flex-end;">${classesHtml}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      card.addEventListener("click", () => {
        openCharInfoModal(char, isOwnedScene);
      });
      groupGrid.appendChild(card);
    });
    
    container.appendChild(groupGrid);
  });
  
  // Render Shortcuts
  const sceneEl = document.getElementById(isOwnedScene ? "scene-5" : "scene-unowned");
  if (sceneEl) {
      let oldBar = sceneEl.querySelector(".shortcut-sidebar");
      if (oldBar) oldBar.remove();

      if (currentSortMode === "type" || currentSortMode === "class") {
          const sidebar = document.createElement("div");
          sidebar.className = "shortcut-sidebar";
          sidebar.style.cssText = "position: fixed; top: 50%; left: 30px; transform: translateY(-50%); display: flex; flex-direction: column; gap: 10px; z-index: 1000;";
          
          Object.keys(groups).forEach(key => {
              const btn = document.createElement("div");
              btn.style.cssText = "width: 50px; height: 50px; border-radius: 50%; background: rgba(255, 255, 255, 0.85); border: 2px solid #3498db; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 0.8rem; font-weight: bold; color: #333; transition: transform 0.2s; text-align: center; line-height: 1.1; white-space: pre-line;";
              
              const roleBg = {
                  "근거리딜러": "linear-gradient(135deg, #e74c3c, #c0392b)",
                  "원거리딜러": "linear-gradient(135deg, #f1c40f, #e67e22)",
                  "마법딜러": "linear-gradient(135deg, #3498db, #2980b9)",
                  "탱커": "linear-gradient(135deg, #95a5a6, #7f8c8d)",
                  "힐러": "linear-gradient(135deg, #2ecc71, #27ae60)",
                  "버퍼": "linear-gradient(135deg, #e67e22, #d35400)",
                  "디버퍼": "linear-gradient(135deg, #1abc9c, #16a085)",
                  "암살자": "linear-gradient(135deg, #9b59b6, #8e44ad)"
              };
              const roleText = {
                  "근거리딜러": "근거리",
                  "원거리딜러": "원거리",
                  "마법딜러": "마법",
                  "탱커": "탱커",
                  "힐러": "힐러",
                  "버퍼": "버퍼",
                  "디버퍼": "디버퍼",
                  "암살자": "암살자"
              };
              if (currentSortMode === "type" && attrIcons[key]) {
                  btn.innerHTML = `<img src="${attrIcons[key]}" alt="${key}" style="width:30px; height:30px;">`;
              } else {
                  const rKey = key.replace(" 클래스", "").replace(/\s/g, "").trim();
                  btn.textContent = roleText[rKey] || rKey.substring(0, 4);
                  if (roleBg[rKey]) {
                      btn.style.background = roleBg[rKey];
                      btn.style.color = "#fff";
                      btn.style.border = "2px solid rgba(255,255,255,0.5)";
                  }
              }
              
              btn.onmouseover = () => btn.style.transform = "scale(1.1)";
              btn.onmouseout = () => btn.style.transform = "scale(1)";
              
              btn.onclick = () => {
                  const header = document.getElementById("holomem-group-" + key);
                  if (header) {
                      sceneEl.scrollTo({ top: header.offsetTop - 150, behavior: 'smooth' });
                  }
              };
              sidebar.appendChild(btn);
          });
          sceneEl.appendChild(sidebar);
      }
  }
}

export function openCharInfoModal(char, isOwnedScene, hideGrowthButtons = false, battleChar = null) {
  const modal = document.getElementById('char-info-modal');
  if (!modal) return;
  currentCharInModal = char;
  window._currentCharInModal = char;
  currentBattleChar = battleChar;

  const tabsContainer = document.getElementById('char-info-tabs-container');
  const battleStatusBox = document.getElementById('char-info-battle-status-container');

  if (battleChar) {
    currentBattleTabMode = 'standard';
    if (tabsContainer) {
      tabsContainer.innerHTML = `
        <button class="char-info-tab active" id="tab-battle-standard" data-battle-tab="standard">표준</button>
        <button class="char-info-tab" id="tab-battle-buffed" data-battle-tab="buffed">버프반영</button>
      `;
    }
    updateBattleCharInfoStats(battleChar, 'standard');
    const scrollArea = modal.querySelector('.char-info-scroll-area');
    if (scrollArea) scrollArea.scrollTop = 0;
    modal.scrollTop = 0;
    modal.classList.add('show');
    return;
  }

  // Restore default tabs if opened from deck/inventory/etc.
  if (tabsContainer && !tabsContainer.querySelector('#tab-my-char')) {
    tabsContainer.innerHTML = `
      <button class="char-info-tab active" id="tab-my-char" data-mychar="true">내 캐릭터</button>
      <button class="char-info-tab" data-star="1" data-level="1">1★01</button>
      <button class="char-info-tab" data-star="2" data-level="30">2★30</button>
      <button class="char-info-tab" data-star="3" data-level="60">3★60</button>
      <button class="char-info-tab" data-star="3" data-level="max">3★MAX</button>
    `;
  }
  if (battleStatusBox) {
    battleStatusBox.style.display = 'none';
    battleStatusBox.innerHTML = '';
  }

  const stats = PlayerData.characterStats && PlayerData.characterStats[char.Character_ID];
  let level = 1;
  let star = 1;
  
  if (tabsContainer) {
    tabsContainer.querySelectorAll('.char-info-tab').forEach(t => t.classList.remove('active'));
    if (isOwnedScene) {
      const myTab = document.getElementById('tab-my-char');
      if (myTab) myTab.classList.add('active');
      level = stats ? (stats.level || 1) : 1;
      star = stats ? (stats.star || 1) : 1;
    } else {
      const maxTab = tabsContainer.querySelector('[data-level="max"]');
      if (maxTab) maxTab.classList.add('active');
      star = 3;
      level = getMaxLvl(char.Character_Tier, 3);
    }
  }
  
  updateCharInfoStats(char, level, star, isOwnedScene, hideGrowthButtons);
  const scrollArea = modal.querySelector('.char-info-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  modal.scrollTop = 0;
  modal.classList.add('show');
}

/**
 * Update and render Character Info Modal for Battle Field Characters (Item 4)
 * Supports 'standard' (pre-combat baseline) and 'buffed' (dynamic live combat) modes
 */
export function updateBattleCharInfoStats(battleChar, mode = 'standard') {
  if (!battleChar) return;
  const char = battleChar.raw || currentCharInModal;
  if (!char) return;

  const star = battleChar.star || 3;
  const level = battleChar.level || 90;
  const maxLvl = getMaxLvl(char.Character_Tier, star);

  // 1. Level text
  const textElem = document.getElementById('lvl-info-text');
  if (textElem) {
    if (mode === 'buffed' && battleChar.isBreaking) {
      textElem.innerHTML = `Lv. ${level} <span style="font-size:1.1rem; color:#fbbf24; font-weight:bold; margin-left:6px;">⚡ BREAKING (${battleChar.breakingTurnsRemaining || 0}T)</span>`;
    } else if (mode === 'buffed' && battleChar.isDead) {
      textElem.innerHTML = `Lv. ${level} <span style="font-size:1.1rem; color:#f87171; font-weight:bold; margin-left:6px;">☠️ 사망</span>`;
    } else {
      textElem.innerHTML = `Lv. ${level} <span style="font-size:1.2rem; color:#7f8c8d; font-weight:normal;">/ ${maxLvl}</span>`;
    }
    textElem.style.display = 'inline-block';
  }

  // 2. Hide growth buttons (레벨업, 승급)
  const btnLvlUp = document.getElementById('btn-lvl-up');
  const btnRankUp = document.getElementById('btn-rank-up');
  if (btnLvlUp) btnLvlUp.style.display = 'none';
  if (btnRankUp) btnRankUp.style.display = 'none';

  // 3. Condition section hidden during battle
  const condSection = document.getElementById('char-info-condition-section');
  if (condSection) condSection.style.display = 'none';

  // 4. Bloom badge
  const bloomBadgeContainer = document.getElementById('bloom-badge-container');
  const bloomBadgeLvl = document.getElementById('bloom-badge-level');
  const isPlayerChar = (battleChar.teamId === 'TEAM_A');
  const bloom = (isPlayerChar && PlayerData?.characterStats?.[char.Character_ID]?.bloom) || 0;
  if (bloomBadgeContainer) {
    if (bloom > 0) {
      if (bloomBadgeLvl) bloomBadgeLvl.textContent = bloom;
      bloomBadgeContainer.className = `bloom-badge bloom-badge-${bloom}`;
      bloomBadgeContainer.style.display = 'flex';
      bloomBadgeContainer.onclick = null;
      bloomBadgeContainer.style.cursor = 'default';
    } else {
      bloomBadgeContainer.style.display = 'none';
    }
  }

  // 5. Stars
  let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
  if (GameData.assets) {
    const assetObj = GameData.assets.find(a => a.Asset_ID === 'asset_010');
    if (assetObj && assetObj.Asset_Link) starIconUrl = assetObj.Asset_Link;
  }
  let starsHtml = '';
  for (let i = 0; i < star; i++) {
    starsHtml += `<img src="${starIconUrl}" class="star-icon" alt="Star">`;
  }
  const starsEl = document.getElementById('char-info-stars');
  if (starsEl) starsEl.innerHTML = starsHtml;

  // 6. Header identity info
  const tierBadge = document.getElementById('char-info-tier-badge');
  if (tierBadge) {
    tierBadge.textContent = char.Character_Tier;
    tierBadge.className = 'holomem-card-rarity ui-rarity-' + (char.Character_Tier || '').toLowerCase();
    tierBadge.style.display = 'flex';
  }

  const nameEl = document.getElementById('char-info-name');
  if (nameEl) nameEl.textContent = char.Character_Name;

  const subnameEl = document.getElementById('char-info-subname');
  if (subnameEl) subnameEl.textContent = char.Character_SubName || '';

  const rawTags = (char.Character_MainTag || '').split('/');
  const mainTagsHtml = rawTags.filter(t => t.trim()).map(t => '<span class="tag-main">' + t.trim() + '</span>').join('');
  const mainTagEl = document.getElementById('char-info-maintag');
  if (mainTagEl) mainTagEl.innerHTML = mainTagsHtml;

  const keywords = [char.Character_Keyword_1, char.Character_Keyword_2, char.Character_Keyword_3, char.Character_Keyword_4].filter(k => k && k.trim());
  const keywordsHtml = keywords.map(k => '<span class="tag-keyword">' + k + '</span>').join('');
  const keywordsEl = document.getElementById('char-info-keywords');
  if (keywordsEl) keywordsEl.innerHTML = keywordsHtml;

  const imgEl = document.getElementById('char-info-img');
  if (imgEl) imgEl.src = char.Character_Image_Full || char.Character_Image || '';

  const typeIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/' + 
    (char.Character_Type === '청초' ? 'Seiso_icon.png' : 
     char.Character_Type === '쿨' ? 'Cool_icon.png' : 
     char.Character_Type === '게닌' ? 'Genin_icon.png' : 
     char.Character_Type === '아티스트' ? 'Artist_icon.png' : 
     char.Character_Type === '큐트' ? 'Cute_icon.png' : 
     char.Character_Type === '광기' ? 'Crazy_icon.png' : 
     char.Character_Type === '에로' ? 'Ero_icon.png' : '');

  const typeIconEl = document.getElementById('char-info-type-icon');
  if (typeIconEl) {
    if (typeIconUrl && !typeIconUrl.endsWith('/icon/')) {
      typeIconEl.src = typeIconUrl;
      typeIconEl.style.display = 'block';
    } else {
      typeIconEl.style.display = 'none';
    }
  }

  const classes = (char.Character_Class || "").split('/').map(s => s.trim()).filter(Boolean);
  const roles = (char.Character_Role || "").split('/').map(s => s.trim()).filter(Boolean);
  let rolesHtml = "";
  roles.forEach(r => {
    const rRaw = r.replace(/ /g, '');
    rolesHtml += `<div class="holomem-card-class-badge card-class-${rRaw}">${r}</div>`;
  });
  let classesHtml = "";
  classes.forEach(c => {
    const cRaw = c.replace(/ /g, '');
    classesHtml += `<div class="holomem-card-class-badge card-class-${cRaw}">${c}</div>`;
  });
  const badgesContainer = document.getElementById('char-info-role-badges');
  if (badgesContainer) {
    badgesContainer.innerHTML = `
      <div style="display:flex; gap:4px; flex-wrap:wrap;">${rolesHtml}</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">${classesHtml}</div>
    `;
    badgesContainer.style.flexDirection = 'column';
    badgesContainer.style.alignItems = 'flex-start';
  }

  // 7. Core Slot (read-only view in battle)
  const coreSlot = document.getElementById('char-info-core-slot');
  if (coreSlot) {
    const equippedCoreUid = isPlayerChar ? PlayerData?.characterStats?.[char.Character_ID]?.equippedCoreUid : null;
    let core = equippedCoreUid ? (PlayerData.cores || []).find(c => c.uid === equippedCoreUid) : null;
    if (core) {
      const map = {
        '청초': 'Seiso_icon.png', '쿨': 'Cool_icon.png', '게닌': 'Genin_icon.png',
        '아티스트': 'Artist_icon.png', '큐트': 'Cute_icon.png', '광기': 'Crazy_icon.png', '에로': 'Ero_icon.png'
      };
      const icon = map[core.element] || 'Seiso_icon.png';
      const assetUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/' + icon;
      let slotsHtml = '';
      if (core.slots) {
        core.slots.forEach(slot => {
          const optDef = (GameData.coreOptions || []).find(o => o.Core_E_ID === slot.optionId);
          if (optDef) {
            slotsHtml += `<div style="font-size:0.8rem; color:#4ade80;">• ${optDef.Core_E_Desc} +${slot.value}</div>`;
          }
        });
      }
      coreSlot.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; width:100%;">
          <img src="${assetUrl}" style="width:36px; height:36px;" alt="${core.element}">
          <div style="text-align:left;">
            <div style="font-weight:bold; color:#f1c40f; font-size:0.95rem;">${core.name || '장착 코어'}</div>
            ${slotsHtml}
          </div>
        </div>
      `;
      coreSlot.style.cursor = 'default';
      coreSlot.onclick = null;
    } else {
      coreSlot.innerHTML = `<div style="color: #7f8c8d; font-size:0.9rem;">장착된 코어 없음</div>`;
      coreSlot.style.cursor = 'default';
      coreSlot.onclick = null;
    }
  }

  // 8. Combat Skills & Passives
  renderCombatSkillsUI(char, star, true);
  const btnMastery = document.querySelector('#char-skills-container #btn-skill-mastery');
  if (btnMastery) btnMastery.style.display = 'none';

  // 9. Stats Grid & Battle Status Box
  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const battleStatusBox = document.getElementById('char-info-battle-status-container');

  if (mode === 'standard') {
    // Mode: 표준 (Standard baseline stats at combat entry)
    const baseDefRed = Math.round((battleChar.def / (100 + Math.abs(battleChar.def))) * 100);
    const baseMdefRed = Math.round((battleChar.mdef / (100 + Math.abs(battleChar.mdef))) * 100);

    setHtml('stat-hp', `${battleChar.maxHp}`);
    setHtml('stat-bp', `${battleChar.maxBreak}`);
    setHtml('stat-aggro', `${battleChar.baseAggro ?? battleChar.aggro}`);
    setHtml('stat-def', `${battleChar.def} / <span style="color:#e67e22; font-weight:bold;">-${baseDefRed}%</span>`);
    setHtml('stat-mdef', `${battleChar.mdef} / <span style="color:#4dabf7; font-weight:bold;">-${baseMdefRed}%</span>`);
    setHtml('stat-reg', `${battleChar.reg ?? 0}%`);
    setHtml('stat-atk', `${battleChar.atk}`);
    setHtml('stat-idol', `${battleChar.idolPower}`);
    setHtml('stat-hitrate', `${battleChar.accuracy}%`);
    setHtml('stat-dodge', `${battleChar.evasion}`);
    setHtml('stat-crit', `${battleChar.critChance}%`);
    setHtml('stat-spd', `${battleChar.speed}`);

    if (battleStatusBox) {
      battleStatusBox.style.display = 'none';
      battleStatusBox.innerHTML = '';
    }
  } else {
    // Mode: 버프반영 (Dynamic live stats reflecting keywords, Red Superchat, Tarot, Break)
    const teamObj = battleChar.team || (window.activeArenaEngine?.state?.teamA?.teamId === battleChar.teamId ? window.activeArenaEngine?.state?.teamA : window.activeArenaEngine?.state?.teamB);
    const mods = extractCharacterCombatModifiers(battleChar, { activeTarot: teamObj?.activeTarot });

    const effectiveAtk = Math.max(0, Math.round(battleChar.atk * (1 + (mods.atkPercent || 0) / 100)));
    const effectiveIdol = Math.max(0, Math.round(battleChar.idolPower * (1 + (mods.idolPercent || 0) / 100)));
    const effectiveDef = Math.max(0, battleChar.def + (mods.defDelta || 0));
    const effectiveMdef = Math.max(0, battleChar.mdef + (mods.mdefDelta || 0));
    const effectiveAcc = Math.max(0, Math.min(100, battleChar.accuracy + (mods.accuracyBonus || 0)));
    const effectiveEva = Math.max(0, Math.min(100, battleChar.evasion + (mods.evasionBonus || 0)));
    const effectiveCrit = Math.max(0, Math.min(100, battleChar.critChance + (mods.critBonus || 0)));
    const effectiveAggro = getEffectiveAggro(battleChar);

    let effectiveSpeed = (battleChar.speed || 10) + (battleChar.redSuperchat?.speed || 0);
    if (Array.isArray(battleChar.statusSlots)) {
      for (const s of battleChar.statusSlots) {
        const mult = s.isPower ? (s.stack || 1) : 1;
        const rawK = s.rawKeyword || {};
        let hasSpeedTarget = false;
        for (let i = 1; i <= 5; i++) {
          if (rawK[`Keyword_Stat_Target_${i}`] === '속도') {
            hasSpeedTarget = true;
            effectiveSpeed += (Number(rawK[`Keyword_Stat_Value_${i}`]) || 0) * mult;
          }
        }
        if (!hasSpeedTarget) {
          if (s.keywordId === 'Key_007' || s.name === '압도') effectiveSpeed -= 2 * (s.stack || 1);
        }
        if (s.keywordId === 'Key_009' || s.name === '빙결') effectiveSpeed -= 3;
        if (s.keywordId === 'Key_019' || s.name === '가속') effectiveSpeed += 1 * (s.stack || 1);
      }
    }
    effectiveSpeed = Math.max(1, effectiveSpeed);
    if (battleChar.isBreaking) effectiveSpeed = Math.floor(effectiveSpeed * 0.5);

    let totalResistance = Number(battleChar.reg ?? battleChar.resistance ?? 0);
    if (Array.isArray(battleChar.statusSlots)) {
      for (const slot of battleChar.statusSlots) {
        const rawK = slot.rawKeyword || {};
        const mult = slot.isPower ? (slot.stack || 1) : 1;
        for (let i = 1; i <= 5; i++) {
          const targetType = rawK[`Keyword_Stat_Target_${i}`];
          const rawVal = rawK[`Keyword_Stat_Value_${i}`];
          if ((targetType === '저항력%' || targetType === '저항력') && rawVal !== undefined && rawVal !== '') {
            const num = Number(rawVal);
            if (!isNaN(num)) totalResistance += num * mult;
          }
        }
      }
    }
    const effectiveRes = Math.max(0, Math.min(100, totalResistance));

    const formatDiff = (eff, base, suffix = '') => {
      const diff = eff - base;
      if (Math.abs(diff) < 0.01) return `${eff}${suffix}`;
      const sign = diff > 0 ? '+' : '';
      const color = diff > 0 ? '#2ecc71' : '#ff6b6b';
      return `${eff}${suffix} <span style="color:${color}; font-weight:800; font-size:0.85em;">(${sign}${diff}${suffix})</span>`;
    };

    const effDefRed = Math.round((effectiveDef / (100 + Math.abs(effectiveDef))) * 100);
    const defDiff = effectiveDef - battleChar.def;
    const defDiffHtml = defDiff !== 0
      ? ` <span style="color:${defDiff > 0 ? '#2ecc71' : '#ff6b6b'}; font-weight:800; font-size:0.85em;">(${defDiff > 0 ? '+' : ''}${defDiff})</span>`
      : '';
    const defHtml = `${effectiveDef} / <span style="color:${effDefRed >= 0 ? '#e67e22' : '#ff6b6b'}; font-weight:bold;">${effDefRed >= 0 ? '-' : '+'}${Math.abs(effDefRed)}%</span>${defDiffHtml}`;

    const effMdefRed = Math.round((effectiveMdef / (100 + Math.abs(effectiveMdef))) * 100);
    const mdefDiff = effectiveMdef - battleChar.mdef;
    const mdefDiffHtml = mdefDiff !== 0
      ? ` <span style="color:${mdefDiff > 0 ? '#2ecc71' : '#ff6b6b'}; font-weight:800; font-size:0.85em;">(${mdefDiff > 0 ? '+' : ''}${mdefDiff})</span>`
      : '';
    const mdefHtml = `${effectiveMdef} / <span style="color:${effMdefRed >= 0 ? '#4dabf7' : '#ff6b6b'}; font-weight:bold;">${effMdefRed >= 0 ? '-' : '+'}${Math.abs(effMdefRed)}%</span>${mdefDiffHtml}`;

    const shieldHtml = battleChar.shield > 0 ? ` <span style="color:#38bdf8; font-weight:bold;">(+${battleChar.shield} 🛡️)</span>` : '';
    const hpColor = battleChar.hp <= battleChar.maxHp * 0.3 ? '#ff6b6b' : (battleChar.hp < battleChar.maxHp ? '#fbbf24' : '#2ecc71');
    const bpHtml = battleChar.isBreaking
      ? `<span style="color:#fbbf24; font-weight:bold;">⚡ BREAKING (${battleChar.breakingTurnsRemaining}T)</span>`
      : `${battleChar.currentBreak} / ${battleChar.maxBreak}`;

    setHtml('stat-hp', `<span style="color:${hpColor}; font-weight:bold;">${battleChar.hp}</span> / ${battleChar.maxHp}${shieldHtml}`);
    setHtml('stat-bp', bpHtml);
    setHtml('stat-aggro', formatDiff(effectiveAggro, battleChar.baseAggro ?? battleChar.aggro));
    setHtml('stat-def', defHtml);
    setHtml('stat-mdef', mdefHtml);
    setHtml('stat-reg', formatDiff(effectiveRes, battleChar.reg ?? 0, '%'));
    setHtml('stat-atk', formatDiff(effectiveAtk, battleChar.atk));
    setHtml('stat-idol', formatDiff(effectiveIdol, battleChar.idolPower));
    setHtml('stat-hitrate', formatDiff(effectiveAcc, battleChar.accuracy, '%'));
    setHtml('stat-dodge', formatDiff(effectiveEva, battleChar.evasion));
    setHtml('stat-crit', formatDiff(effectiveCrit, battleChar.critChance, '%'));
    setHtml('stat-spd', formatDiff(effectiveSpeed, battleChar.speed));

    // Active status effects summary box
    if (battleStatusBox) {
      let statusHtml = '';
      if (battleChar.redSuperchat) {
        statusHtml += `
          <div class="char-info-buff-badge char-info-buff-rsc">
            <span>🔥</span>
            <div><strong>${battleChar.redSuperchat.name || '아카스파 각성'}</strong>: ${battleChar.redSuperchat.description || '능력치 대폭 강화'}</div>
          </div>
        `;
      }
      if (teamObj?.activeTarot) {
        const t = teamObj.activeTarot;
        statusHtml += `
          <div class="char-info-buff-badge char-info-buff-tarot">
            <span>🔮</span>
            <div><strong>${t.name}</strong>: ${t.desc}</div>
          </div>
        `;
      }
      if (Array.isArray(battleChar.statusSlots) && battleChar.statusSlots.length > 0) {
        const getGroup = (kId, kName, rawK) => {
          if (kId === 'Key_002' || kName === '파괴' || rawK?.Keyword_Treat_As === 'Key_002') return 'Key_002';
          if (kId === 'Key_003' || kName === '매료' || rawK?.Keyword_Treat_As === 'Key_003') return 'Key_003';
          if (kId === 'Key_004' || kName === '원소' || kName === '화상' || ['Key_009', 'Key_010', 'Key_011'].includes(kId) || rawK?.Keyword_Treat_As === 'Key_004') return 'Key_004';
          if (kId === 'Key_001' || kName === '출혈') return 'Key_002';
          return null;
        };
        const groupTotals = { Key_002: 0, Key_003: 0, Key_004: 0 };
        battleChar.statusSlots.forEach(s => {
          const g = getGroup(s.keywordId, s.name, s.rawKeyword);
          if (g) groupTotals[g] += (s.stack || 1);
        });

        let chipsHtml = '';
        battleChar.statusSlots.forEach(slot => {
          const isDebuff = (slot.type === 'DEBUFF' || slot.category === 'DEBUFF');
          const slotG = getGroup(slot.keywordId, slot.name, slot.rawKeyword);
          const gTotal = slotG ? (groupTotals[slotG] || 0) : 0;
          const isSyn = Boolean(slotG && gTotal >= 10);
          const synClass = isSyn ? ` status-highlight-10 status-highlight-${slotG.toLowerCase()}` : '';
          const chipClass = (isDebuff ? 'chip-debuff' : 'chip-buff') + synClass;
          const icon = slot.icon || (isDebuff ? '🔻' : '🔼');
          const synExtra = (isSyn && gTotal > (slot.stack || 1)) ? ` (⚡${gTotal})` : (isSyn ? ' ⚡' : '');
          const stackText = (slot.stack > 1 || isSyn) ? ` x${slot.stack || 1}${synExtra}` : '';
          chipsHtml += `<span class="char-info-status-chip ${chipClass}">${icon} ${slot.name}${stackText} (${slot.duration}T)</span>`;
        });
        statusHtml += `
          <div style="font-size:0.85rem; font-weight:bold; color:#475569; margin-top:4px;">적용 중인 상태이상:</div>
          <div class="char-info-status-chips-wrap">${chipsHtml}</div>
        `;
      }
      if (!statusHtml) {
        statusHtml = `<div style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:4px 0;">현재 적용 중인 특수 버프/상태이상이 없습니다.</div>`;
      }
      battleStatusBox.innerHTML = statusHtml;
      battleStatusBox.style.display = 'flex';
    }
  }
}

export function renderWarehouseList() {
  const grid = document.getElementById("warehouse-grid");
  if (!grid) return;
  grid.innerHTML = "";
  
  const items = GameData.items || [];
  const ownedItemsData = items.filter(item => {
    if ((PlayerData.items[item.Item_ID] || 0) <= 0) return false;
    if (currentWarehouseFilter !== "all" && item.Item_Type !== currentWarehouseFilter) return false;
    return true;
  });

  ownedItemsData.forEach(item => {
    const qty = PlayerData.items[item.Item_ID] || 0;
    const rarity = item.Item_Rarity || 1;
    const slot = document.createElement("div");
    slot.className = `item-slot item-rarity-${rarity} ${selectedItemId === item.Item_ID ? 'selected' : ''}`;
    slot.innerHTML = `<img src="${item.Item_Icon}" alt="${item.Item_Name}"><div class="item-qty">${qty.toLocaleString()}</div>`;
    
    slot.addEventListener("click", () => {
      selectedItemId = item.Item_ID;
      renderWarehouseList(); 
      updateWarehouseDetail(item, qty);
    });
    grid.appendChild(slot);
  });
}

function updateWarehouseDetail(item, qty) {
  const emptyView = document.getElementById("warehouse-detail-empty");
  const contentView = document.getElementById("warehouse-detail-content");
  emptyView.style.display = "none";
  contentView.classList.remove("hidden");
  
  document.getElementById("detail-item-bg").className = `detail-icon-wrapper item-rarity-${item.Item_Rarity || 1}`;
  document.getElementById("detail-item-icon").src = item.Item_Icon;
  document.getElementById("detail-item-type").textContent = item.Item_Type;
  document.getElementById("detail-item-name").textContent = item.Item_Name;
  document.getElementById("detail-item-owned").textContent = `보유량: ${qty.toLocaleString()}`;
  document.getElementById("detail-item-desc").innerHTML = (item.Item_Desc || "").replace(/\n/g, '<br>');

  const sourcesContainer = document.getElementById("detail-item-sources");
  if (sourcesContainer) {
    sourcesContainer.innerHTML = "";
    const sources = [];
    if (item.Item_Get_1) sources.push(item.Item_Get_1);
    if (item.Item_Get_2) sources.push(item.Item_Get_2);

    const sceneMap = {
      "메인 스토리 진행": "scene-1",
      "메인 스토리": "scene-1",
      "리허설 스테이지": "scene-2",
      "리허설": "scene-2",
      "라이브 스테이지": "scene-3",
      "라이브": "scene-3",
      "상점": "scene-shop",
      "코어": "scene-core",
      "스튜디오": "scene-10",
      "가공소": "scene-11",
      "사무소": "scene-11",
      "캐스팅": "scene-12",
      "오디션": "scene-13"
    };

    if (sources.length === 0) {
      sourcesContainer.innerHTML = '<span style="color:#aaa;">획득처 없음</span>';
    } else {
      sources.forEach(src => {
        const btn = document.createElement("button");
        btn.textContent = src;
        btn.style.cssText = "padding: 5px 10px; margin-right: 5px; margin-bottom: 5px; border-radius: 5px; background-color: #3498db; color: white; border: none; cursor: pointer; font-size: 0.9rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);";
        const targetSceneId = sceneMap[src];
        
        btn.addEventListener("click", () => {
          if (targetSceneId) {
            const targetScene = document.getElementById(targetSceneId);
            if (targetScene) {
              if (targetSceneId === "scene-shop") openShopScene();
              if (targetSceneId === "scene-core") openCoreScene();
              changeSceneWipe(document.getElementById("scene-8"), targetScene);
            }
          } else {
            // No action if scene is not mapped
          }
        });
        sourcesContainer.appendChild(btn);
      });
    }
  }
}


// 오디션 렌더링 생략 방지
export function updateAuditionUI() {
  const ticketCountDisplay = document.getElementById("audition-ticket-count");
  if(ticketCountDisplay) ticketCountDisplay.textContent = (PlayerData.items["Item_004"] || 0).toLocaleString();
}


export function updateCharInfoStats(char, level, star, isMyChar = false, hideGrowthButtons = false) {
  const maxLvl = getMaxLvl(char.Character_Tier, star);
  const textElem = document.getElementById('lvl-info-text');
  
  const maxTab = document.querySelector('.char-info-tab[data-level="max"]');
  if (maxTab) {
    const tierMaxLvl = getMaxLvl(char.Character_Tier, 3);
    maxTab.textContent = `3★${tierMaxLvl}`;
  }
  
  if (textElem) {
    textElem.innerHTML = `Lv. ${level} <span style="font-size:1.2rem; color:#7f8c8d; font-weight:normal;">/ ${maxLvl}</span>`;
    textElem.style.display = isMyChar ? 'inline-block' : 'none';
  }
  
  const condSection = document.getElementById('char-info-condition-section');
  if (condSection) {
    condSection.style.display = (isMyChar && !hideGrowthButtons) ? 'block' : 'none';
    if (isMyChar && PlayerData && PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) {
      const stats = PlayerData.characterStats[char.Character_ID];
      const condition = stats.condition !== undefined ? stats.condition : 100;
      const conditionPct = Math.min(100, Math.max(0, condition));
      
      const barFill = condSection.querySelector('.condition-bar-fill');
      const textSpan = condSection.querySelector('.condition-text');
      if (barFill) barFill.style.width = conditionPct + '%';
      if (textSpan) textSpan.textContent = Math.floor(condition) + ' / 100';

      // Update condition penalty tooltip
      const tooltipCur = document.getElementById('cond-tooltip-cur-text');
      if (tooltipCur) tooltipCur.textContent = `현재: ${Math.floor(condition)} / 100`;

      const rowNormal = document.getElementById('cond-tier-row-normal');
      const rowTired = document.getElementById('cond-tier-row-tired');
      const rowDanger = document.getElementById('cond-tier-row-danger');

      if (rowNormal) rowNormal.classList.toggle('active', condition > 50);
      if (rowTired) rowTired.classList.toggle('active', condition >= 26 && condition <= 50);
      if (rowDanger) rowDanger.classList.toggle('active', condition <= 25);
    }
  }
  
  const isActuallyOwned = PlayerData && PlayerData.characterStats && PlayerData.characterStats[char.Character_ID];
  const tabMyChar = document.getElementById('tab-my-char');
  if (tabMyChar) tabMyChar.style.display = isActuallyOwned ? 'inline-block' : 'none';

  const bloomBadgeContainer = document.getElementById('bloom-badge-container');
  const bloomBadgeLvl = document.getElementById('bloom-badge-level');
  
  if (bloomBadgeContainer) {
      if (isMyChar && isActuallyOwned) {
          const stats = PlayerData.characterStats[char.Character_ID];
          const bloom = stats.bloom || 0;
          bloomBadgeLvl.textContent = bloom;
          bloomBadgeContainer.className = `bloom-badge bloom-badge-${bloom}`;
          bloomBadgeContainer.style.display = 'flex';
          bloomBadgeContainer.onclick = () => openBloomModal(char, bloom);
      } else {
          bloomBadgeContainer.style.display = 'none';
      }
  }

  const btnLvlUp = document.getElementById('btn-lvl-up');
  const btnRankUp = document.getElementById('btn-rank-up');
  if (btnLvlUp) btnLvlUp.style.display = (isMyChar && !hideGrowthButtons) ? 'inline-block' : 'none';
  if (btnRankUp) btnRankUp.style.display = (isMyChar && !hideGrowthButtons) ? 'inline-block' : 'none';
  
  if (btnLvlUp && btnRankUp) {
    if (level >= maxLvl) {
      btnLvlUp.disabled = true;
      btnRankUp.disabled = (star >= 3);
    } else {
      btnLvlUp.disabled = false;
      btnRankUp.disabled = true;
    }
  }

  const atkUp = parseInt(char.Character_ATK_UP || 1, 10);
  const idolUp = parseInt(char.Character_Idol_UP || 1, 10);
  const hpUp = parseInt(char.Character_HP_UP || 1, 10);
  
  const levelDiff = level === 1 ? 0 : Math.floor(level / 10);
  
  const hp = (parseInt(char.Character_HP, 10) || 0) + (levelDiff * hpUp);
  const atk = (parseInt(char.Character_ATK, 10) || 0) + (levelDiff * atkUp);
  const idol = (parseInt(char.Character_Idol, 10) || 0) + (levelDiff * idolUp);
  
  const bp = parseInt(char.Character_BP, 10) || 0;
  const aggro = parseInt(char.Character_Aggro, 10) || 0;
  
  const defVal = parseInt(char.Character_DEF || char.Character_Physical_DEF, 10) || 0;
  const mdefVal = parseInt(char.Character_MDEF || char.Character_Magical_DEF, 10) || 0;
  
  const reg = parseInt(char.Character_REG, 10) || 0;
  const hitrate = parseInt(char.Character_HitRate, 10) || 0;
  const dodge = parseInt(char.Character_Dodge, 10) || 0;
  const crit = parseInt(char.Character_Crit, 10) || 0;
  const spd = parseInt(char.Character_Spd, 10) || 0;

  // Calculate bloom bonuses
  let bloomLevel = (isMyChar && isActuallyOwned) ? (PlayerData.characterStats[char.Character_ID].bloom || 0) : 0;
  let bloomBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0 };
  
  if (GameData.bloom && bloomLevel > 0) {
      const roles = (char.Character_Role || "").split(/[,/]/).map(s => s.trim()).filter(Boolean);
      const validBloomRoles = new Set(GameData.bloom.map(b => b.Role));
      const primaryRole = roles.find(r => validBloomRoles.has(r)) || roles[0] || "";
      GameData.bloom.forEach(effect => {
          if (effect.Role === primaryRole && effect.Level <= bloomLevel) {
              const val = effect.Value;
              switch (effect.Type) {
                  case 'HP_PCT': bloomBonus.HP += Math.floor(hp * (val / 100)); break;
                  case 'HP_ADD': bloomBonus.HP += val; break;
                  case 'ATK_PCT': bloomBonus.ATK += Math.floor(atk * (val / 100)); break;
                  case 'ATK_ADD': bloomBonus.ATK += val; break;
                  case 'IDOL_PCT': bloomBonus.IDOL += Math.floor(idol * (val / 100)); break;
                  case 'IDOL_ADD': bloomBonus.IDOL += val; break;
                  case 'BP_ADD': bloomBonus.BP += val; break;
                  case 'HIT_PCT': bloomBonus.HIT += val; break;
                  case 'AVOID_PCT': bloomBonus.DODGE += val; break;
                  case 'CRIT_PCT': bloomBonus.CRIT += val; break;
                  case 'SPD_ADD': bloomBonus.SPD += val; break;
                  case 'RES_ADD': bloomBonus.REG += val; break;
              }
          }
      });
  }

  
  let coreBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };
  let kizunaBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };
  if (isMyChar && isActuallyOwned) {
      const stats = PlayerData.characterStats[char.Character_ID];
      if (stats.equippedCoreUid) {
          const core = (PlayerData.cores || []).find(c => c.uid === stats.equippedCoreUid);
          if (core && core.slots) {
              core.slots.forEach(slot => {
                  const optDef = (GameData.coreOptions || []).find(o => o.Core_E_ID === slot.optionId);
                  if (optDef) {
                      const statName = optDef.Core_E_Desc;
                      if (statName === 'HP') coreBonus.HP += slot.value;
                      else if (statName === '공격력') coreBonus.ATK += slot.value;
                      else if (statName === '아이돌력') coreBonus.IDOL += slot.value;
                      else if (statName === '방어력') coreBonus.DEF += slot.value;
                      else if (statName === '마법방어력') coreBonus.MDEF += slot.value;
                      else if (statName === '저항력') coreBonus.REG += slot.value;
                      else if (statName === '어그로') coreBonus.AGGRO += slot.value;
                      else if (statName === '명중') coreBonus.HIT += slot.value;
                      else if (statName === '회피') coreBonus.DODGE += slot.value;
                      else if (statName === '치명타') coreBonus.CRIT += slot.value;
                      else if (statName === '속도') coreBonus.SPD += slot.value;
                      else if (statName === '치명타 피해량') coreBonus.CRIT_DMG += slot.value;
                      else if (statName === '브레이킹') coreBonus.BP += slot.value;
                  }
              });
          }
      }

    if (isMyChar && isActuallyOwned && GameData.kizuna) {
        const charTags = [
            ...(char.Character_MainTag || "").split(/[,/]/),
            ...(char.Character_SubTag || "").split(/[,/]/),
            ...(char.Character_Type || "").split(/[,/]/)
        ].map(t => t.trim()).filter(t => t);
        for (let [nodeId, level] of Object.entries(PlayerData.kizunaTree || {})) {
            if (level > 0) {
                const kNode = GameData.kizuna.find(k => k.Kizuna_ID === nodeId);
                if (kNode) {
                    let isMatch = true;
                    const target = (kNode.Kizuna_Target || "").trim();
                    if (target && target !== '전체' && target !== '모든' && target.toLowerCase() !== 'all') {
                        if (!charTags.includes(target)) {
                            isMatch = false;
                        }
                    }
                    
                    if (isMatch) {
                        const statMap = {
                            'HP': 'HP', '체력': 'HP',
                            '공격력': 'ATK', 'ATK': 'ATK',
                            '아이돌력': 'IDOL', 'IDOL': 'IDOL',
                            '방어력': 'DEF', '물리방어': 'DEF', 'DEF': 'DEF',
                            '마법방어력': 'MDEF', '마법방어': 'MDEF', 'MDEF': 'MDEF',
                            '명중': 'HIT', 'HIT': 'HIT',
                            '회피': 'DODGE', 'DODGE': 'DODGE',
                            '치명타': 'CRIT', 'CRIT': 'CRIT',
                            '치명타피해량': 'CRIT_DMG', '치명타 피해량': 'CRIT_DMG', '치피': 'CRIT_DMG'
                        };
                        
                        const addStat = (statName, statVal) => {
                            if (statName && statVal) {
                                const field = statMap[statName.trim()];
                                if (field) {
                                    kizunaBonus[field] += (parseFloat(statVal) || 0) * level;
                                }
                            }
                        };
                        
                        addStat(kNode.Kizuna_Stat_1, kNode.Kizuna_Value_1);
                        addStat(kNode.Kizuna_Stat_2, kNode.Kizuna_Value_2);
                    }
                }
            }
        }
    }
    
  }
    
    const fDefVal = defVal + bloomBonus.DEF + coreBonus.DEF + kizunaBonus.DEF;
    const fMdefVal = mdefVal + bloomBonus.MDEF + coreBonus.MDEF + kizunaBonus.MDEF;
  
  const defRed = Math.round((fDefVal / (100 + Math.abs(fDefVal))) * 100);
  const mdefRed = Math.round((fMdefVal / (100 + Math.abs(fMdefVal))) * 100);
  const defColor = defRed >= 0 ? '#e67e22' : '#ff6b6b';
  const mdefColor = mdefRed >= 0 ? '#4dabf7' : '#ff6b6b';
  
  let defHtml = fDefVal + ' / <span style="color:' + defColor + '; font-weight:bold;">' + (defRed >= 0 ? '-' : '+') + Math.abs(defRed) + '%</span>';
  let mdefHtml = fMdefVal + ' / <span style="color:' + mdefColor + '; font-weight:bold;">' + (mdefRed >= 0 ? '-' : '+') + Math.abs(mdefRed) + '%</span>';
  const totalDef = bloomBonus.DEF + coreBonus.DEF + kizunaBonus.DEF;
  if (totalDef > 0) defHtml += ` <span style="color:#2ecc71;font-size:0.85em;font-weight:bold;">(+${totalDef})</span>`;
  const totalMdef = bloomBonus.MDEF + coreBonus.MDEF + kizunaBonus.MDEF;
  if (totalMdef > 0) mdefHtml += ` <span style="color:#2ecc71;font-size:0.85em;font-weight:bold;">(+${totalMdef})</span>`;
  
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  
  const formatStat = (base, bonus, suffix="") => {
      if (bonus > 0) return `${base + bonus}${suffix} <span style="color:#2ecc71;font-size:0.85em;font-weight:bold;">(+${bonus}${suffix})</span>`;
      return `${base}${suffix}`;
  };

  setHtml('stat-hp', formatStat(hp, (bloomBonus.HP + coreBonus.HP + kizunaBonus.HP)));
  setHtml('stat-atk', formatStat(atk, (bloomBonus.ATK + coreBonus.ATK + kizunaBonus.ATK)));
  setHtml('stat-idol', formatStat(idol, (bloomBonus.IDOL + coreBonus.IDOL + kizunaBonus.IDOL)));
  setHtml('stat-bp', formatStat(bp, (bloomBonus.BP + coreBonus.BP + kizunaBonus.BP)));
  setHtml('stat-aggro', formatStat(aggro, (bloomBonus.AGGRO + coreBonus.AGGRO + kizunaBonus.AGGRO)));
  setHtml('stat-def', defHtml);
  setHtml('stat-mdef', mdefHtml);
  setHtml('stat-reg', formatStat(reg, (bloomBonus.REG + coreBonus.REG + kizunaBonus.REG)));
  setHtml('stat-hitrate', formatStat(hitrate, (bloomBonus.HIT + coreBonus.HIT + kizunaBonus.HIT), '%'));
  setHtml('stat-dodge', formatStat(dodge, (bloomBonus.DODGE + coreBonus.DODGE + kizunaBonus.DODGE)));
  setHtml('stat-crit', formatStat(crit, (bloomBonus.CRIT + coreBonus.CRIT + kizunaBonus.CRIT), '%'));
  setHtml('stat-spd', formatStat(spd, (bloomBonus.SPD + coreBonus.SPD + kizunaBonus.SPD)));
  
  setTxt('d-stat-game', parseInt(char.Character_M_Game, 10) || 0);
  setTxt('d-stat-talk', parseInt(char.Character_M_Talk, 10) || 0);
  setTxt('d-stat-sing', parseInt(char.Character_M_Sing, 10) || 0);
  setTxt('d-stat-sexy', parseInt(char.Character_M_Sexy, 10) || 0);
  setTxt('d-stat-plan', parseInt(char.Character_M_Plan, 10) || 0);
  setTxt('d-stat-passion', parseInt(char.Character_M_Passion, 10) || 0);
  
  const tierBadge = document.getElementById('char-info-tier-badge');
  if (tierBadge) {
    tierBadge.textContent = char.Character_Tier;
    tierBadge.className = 'holomem-card-rarity ui-rarity-' + char.Character_Tier.toLowerCase();
    tierBadge.style.display = 'flex';
  }
  
  document.getElementById('char-info-name').textContent = char.Character_Name;
  document.getElementById('char-info-subname').textContent = char.Character_SubName || '';
  
  const rawTags = (char.Character_MainTag || '').split('/');
  const mainTagsHtml = rawTags.filter(t => t.trim()).map(t => '<span class="tag-main">' + t.trim() + '</span>').join('');
  document.getElementById('char-info-maintag').innerHTML = mainTagsHtml;
  
  const keywords = [char.Character_Keyword_1, char.Character_Keyword_2, char.Character_Keyword_3, char.Character_Keyword_4].filter(k => k && k.trim());
  const keywordsHtml = keywords.map(k => '<span class="tag-keyword">' + k + '</span>').join('');
  document.getElementById('char-info-keywords').innerHTML = keywordsHtml;
  
  document.getElementById('char-info-img').src = char.Character_Image_Full;
  
  const typeIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/' + 
    (char.Character_Type === '청초' ? 'Seiso_icon.png' : 
     char.Character_Type === '쿨' ? 'Cool_icon.png' : 
     char.Character_Type === '게닌' ? 'Genin_icon.png' : 
     char.Character_Type === '아티스트' ? 'Artist_icon.png' : 
     char.Character_Type === '큐트' ? 'Cute_icon.png' : 
     char.Character_Type === '광기' ? 'Crazy_icon.png' : 
     char.Character_Type === '에로' ? 'Ero_icon.png' : '');
  
  if (typeIconUrl && typeIconUrl !== 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/') {
    document.getElementById('char-info-type-icon').src = typeIconUrl;
    document.getElementById('char-info-type-icon').style.display = 'block';
  } else {
    document.getElementById('char-info-type-icon').style.display = 'none';
  }

  const classes = (char.Character_Class || "").split('/').map(s => s.trim()).filter(Boolean);
  const roles = (char.Character_Role || "").split('/').map(s => s.trim()).filter(Boolean);
  
  let rolesHtml = "";
  roles.forEach(r => {
    const rRaw = r.replace(/ /g, '');
    rolesHtml += `<div class="holomem-card-class-badge card-class-${rRaw}">${r}</div>`;
  });
  let classesHtml = "";
  classes.forEach(c => {
    const cRaw = c.replace(/ /g, '');
    classesHtml += `<div class="holomem-card-class-badge card-class-${cRaw}">${c}</div>`;
  });
  
  const badgesContainer = document.getElementById('char-info-role-badges');
  if (badgesContainer) {
    badgesContainer.innerHTML = `
      <div style="display:flex; gap:4px; flex-wrap:wrap;">${rolesHtml}</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">${classesHtml}</div>
    `;
    badgesContainer.style.flexDirection = 'column';
    badgesContainer.style.alignItems = 'flex-start';
  }
  
  let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
  if (GameData.assets) {
    const assetObj = GameData.assets.find(a => a.Asset_ID === 'asset_010');
    if (assetObj && assetObj.Asset_Link) starIconUrl = assetObj.Asset_Link;
  }
  let starsHtml = '';
  for (let i = 0; i < star; i++) {
    starsHtml += `<img src="${starIconUrl}" class="star-icon" alt="Star">`;
  }
  const starsEl = document.getElementById('char-info-stars');
  if (starsEl) starsEl.innerHTML = starsHtml;

  // Render Core Equip UI
  const coreSlot = document.getElementById('char-info-core-slot');
  if (coreSlot) {
      const coreSection = coreSlot.closest('.char-info-section');
      if (coreSection) {
          coreSection.style.display = hideGrowthButtons ? 'none' : 'block';
      }
      
      if (isMyChar && isActuallyOwned) {
          const stats = PlayerData.characterStats[char.Character_ID];
          if (star < 2) {
              coreSlot.innerHTML = `
                  <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#7f8c8d;">
                      <div style="font-size:2em; margin-bottom:5px;">🔒</div>
                      <div style="font-size:0.9em; font-weight:bold;">★2 해금</div>
                  </div>
              `;
              coreSlot.onclick = null;
              coreSlot.style.cursor = 'not-allowed';
              coreSlot.style.background = '#2c3e50';
              coreSlot.style.border = '1px solid #34495e';
          } else {
              coreSlot.style.cursor = 'pointer';
          const equippedCoreUid = stats.equippedCoreUid;
          let core = null;
          if (equippedCoreUid) {
              core = (PlayerData.cores || []).find(c => c.uid === equippedCoreUid);
          }
          
          if (core) {
              // Show equipped core
              let maxTier = 1;
              if (core.slots && core.slots.length > 0) {
                  const tiers = core.slots.map(s => {
                      const o = (GameData.coreOptions||[]).find(opt => opt.Core_E_ID === s.optionId);
                      return o ? parseInt(o.Core_E_Tier, 10) : 1;
                  });
                  maxTier = Math.max(...tiers);
              }
                            const map = {
                  '청초': 'Seiso_icon.png', '쿨': 'Cool_icon.png', '게닌': 'Genin_icon.png',
                  '아티스트': 'Artist_icon.png', '큐트': 'Cute_icon.png', '광기': 'Crazy_icon.png', '에로': 'Ero_icon.png'
              };
              const icon = map[core.element] || 'Seiso_icon.png';
              const assetUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/' + icon;
              
              const tierValues = { 1:1, 2:3, 3:6 };
              let totalVp = 0;
              let slotsHtml = '';
              if (core.slots) {
                  core.slots.forEach(slot => {
                      const optDef = (GameData.coreOptions||[]).find(o => o.Core_E_ID === slot.optionId);
                      const tier = optDef ? parseInt(optDef.Core_E_Tier, 10) : 1;
                      totalVp += (tierValues[tier] || 0);
                      
                      const colors = { 1: '#bdc3c7', 2: '#3498db', 3: '#9b59b6' };
                      const color = colors[tier] || '#bdc3c7';
                      const roman = ["I", "II", "III"][tier - 1] || "I";
                      const optName = optDef ? optDef.Core_E_Name : '옵션';
                      slotsHtml += `<span style="font-size: 0.75rem; background: ${color}; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; white-space: nowrap;">${optName} ${roman}</span>`;
                  });
              }
              
              coreSlot.innerHTML = `
                <div style="display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: center; padding: 4px; box-sizing: border-box;">
                    <div style="display: flex; align-items: center; font-weight: bold; color: #333; margin-bottom: 6px;">
                        <img src="${assetUrl}" style="width: 24px; height: 24px; margin-right: 6px; object-fit: contain;">
                        <span style="font-size: 1.1rem; color: #009a9a;">${core.element} 코어</span>
                        <span style="color: #f39c12; font-size: 0.9rem; margin-left: auto;">(VP: ${totalVp.toFixed(1)})</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; justify-content: flex-start; max-height: 48px; overflow: hidden;">
                        ${slotsHtml}
                    </div>
                </div>
              `;
              coreSlot.style.borderColor = '#00d2d3';
              coreSlot.style.borderStyle = 'solid';
              coreSlot.style.background = 'rgba(0, 210, 211, 0.05)';
          } else {
              // Empty slot
              coreSlot.innerHTML = `
                <div id="char-info-core-slot-plus" style="font-size: 1.5rem; color: #888; margin-bottom: 5px;">+</div>
                <div id="char-info-core-slot-text" style="color: #aaa; font-weight: bold;">코어 장착</div>
              `;
              coreSlot.style.borderColor = '#444';
              coreSlot.style.borderStyle = 'dashed';
              coreSlot.style.background = 'transparent';
          }
          
          coreSlot.onclick = () => {
              import('./ui_equip.js?v=004276').then(module => {
                  module.openCoreEquipModal(char);
              }).catch(err => {
                  console.error("Failed to load ui_equip.js:", err);
              });
          };
          }
      } else {
          coreSlot.innerHTML = `<div style="color: #555; font-weight: bold;">장착 불가</div>`;
          coreSlot.style.border = '2px dashed #333';
          coreSlot.style.background = 'transparent';
          coreSlot.onclick = null;
      }
  }

  // Render Tag Info
  const tagsContainer = document.getElementById('char-info-tags-container');
  if (tagsContainer) {
      const createTagHtml = (tagStr, colorType) => {
          if (!tagStr) return '';
          const tags = String(tagStr).split('/').map(t => t.trim()).filter(t => t);
          const bg = colorType === 'black' ? '#2d3436' : '#7f8c8d';
          return tags.map(t => `<span style="background: ${bg}; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem; font-weight: bold; display: inline-block;">${t}</span>`).join('');
      };
      
      const mainTagsHtml = createTagHtml(char.Character_MainTag, 'black');
      
      let keywordTagsHtml = '';
      keywordTagsHtml += createTagHtml(char.Character_Keyword_1, 'black');
      keywordTagsHtml += createTagHtml(char.Character_Keyword_2, 'black');
      keywordTagsHtml += createTagHtml(char.Character_Keyword_3, 'black');
      keywordTagsHtml += createTagHtml(char.Character_Keyword_4, 'black');
      
      const subTagsHtml = createTagHtml(char.Character_SubTag, 'gray');
      
      let finalHtml = '';
      finalHtml += `<div style="display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px;">${mainTagsHtml || '<span style="color: #777; font-size: 0.85rem; padding: 4px 0;">메인 태그 없음</span>'}</div>`;
      finalHtml += `<div style="display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px;">${keywordTagsHtml || '<span style="color: #777; font-size: 0.85rem; padding: 4px 0;">키워드 없음</span>'}</div>`;
      finalHtml += `<div style="display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px;">${subTagsHtml || '<span style="color: #777; font-size: 0.85rem; padding: 4px 0;">서브 태그 없음</span>'}</div>`;
      
      tagsContainer.innerHTML = finalHtml;
      
      const tagsSection = document.getElementById('char-info-tags-section');
      if (tagsSection) {
          tagsSection.style.display = 'block';
      }
  }
  // Update Domestic Skill (Management Passive)
  const domesticNameElem = document.getElementById('skill-domestic-name');
  const domesticDescElem = document.getElementById('skill-domestic');
  const domesticContainer = domesticNameElem ? domesticNameElem.closest('.skill-box') : null;
  if (domesticNameElem && domesticDescElem) {
      const mSkillId = char.Character_M_Skill;
      const mSkillData = window.GameData.m_skill || window.GameData.M_Skill || window.GameData.m_skills;
      
      let nameText = '내정 패시브';
      let descHtml = '(비어있음)';
      
      if (mSkillId && mSkillData) {
          const mSkill = mSkillData.find(s => s.M_Skill_ID === mSkillId || s.m_skill_id === mSkillId);
          if (mSkill) {
              nameText = mSkill.M_Skill_Name || mSkill.m_skill_name || mSkillId;
              descHtml = (mSkill.M_Skill_Desc || mSkill.m_skill_desc || '').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
          } else {
              descHtml = '(스킬 정보 없음)';
          }
      }
      
      const domesticHeader = domesticNameElem.parentElement;
      let existingLock = domesticHeader.querySelector('.domestic-lock-text');
      if (!existingLock) {
          existingLock = document.createElement('span');
          existingLock.className = 'domestic-lock-text skill-id';
          domesticHeader.appendChild(existingLock);
      }
      
      if (star < 2) {
          domesticNameElem.innerHTML = nameText;
          existingLock.innerHTML = '<span style="color:#e74c3c;">🔒 ★2 해금</span>';
          domesticDescElem.innerHTML = descHtml;
          if (domesticContainer) {
              domesticContainer.style.opacity = '0.5';
              domesticContainer.style.filter = 'grayscale(100%)';
          }
      } else {
          domesticNameElem.textContent = nameText;
          existingLock.innerHTML = '';
          domesticDescElem.innerHTML = descHtml;
          if (domesticContainer) {
              domesticContainer.style.opacity = '1';
              domesticContainer.style.filter = 'none';
          }
      }
  }

  renderCombatSkillsUI(char, star, isMyChar);
}

let lvlupModalState = { char: null, stats: null, expAdds: {}, addExp: 0, creditCost: 0, previewLevel: 0, previewExp: 0, overflowExp: 0 };

function renderLevelUpModal() {
  const { char, stats, addExp } = lvlupModalState;
  const currentLvl = stats.level;
  const currentExp = stats.exp || 0;
  const tier = char.Character_Tier;
  const maxLvl = getMaxLvl(tier, stats.star);
  
  let simulatedLevel = currentLvl;
  let simulatedExp = currentExp + addExp;
  let simulatedCreditReq = 0;
  
  while (true) {
    const nextTarget = simulatedLevel === 1 ? 10 : simulatedLevel + 10;
    if (nextTarget > maxLvl) break;
    const req = EXP_TABLE[nextTarget];
    if (!req) break;
    if (simulatedExp >= req.exp) {
      simulatedExp -= req.exp;
      simulatedLevel = nextTarget;
      simulatedCreditReq += req.credit;
    } else {
      break;
    }
  }
  
  let overflowExp = 0;
  if (simulatedLevel === maxLvl) {
    overflowExp = simulatedExp;
  }
  
  lvlupModalState.previewLevel = simulatedLevel;
  lvlupModalState.previewExp = simulatedExp;
  lvlupModalState.creditCost = simulatedCreditReq;
  lvlupModalState.overflowExp = overflowExp;
  
  const curLvlEl = document.getElementById('lvlup-current-lvl');
  if (curLvlEl) curLvlEl.textContent = currentLvl;
  const tgtLvlEl = document.getElementById('lvlup-target-lvl');
  if (tgtLvlEl) tgtLvlEl.textContent = simulatedLevel;
  
  const myCredit = PlayerData.items['Item_002'] || 0;
  const myCreditEl = document.getElementById('lvlup-my-credit');
  if (myCreditEl) myCreditEl.textContent = myCredit.toLocaleString();
  const reqCreditEl = document.getElementById('lvlup-req-credit');
  if (reqCreditEl) {
    reqCreditEl.textContent = simulatedCreditReq.toLocaleString();
    if (myCredit < simulatedCreditReq) {
      reqCreditEl.style.color = '#ff6b6b';
    } else {
      reqCreditEl.style.color = '#ffa94d';
    }
  }
  
  const nextTargetForBar = simulatedLevel === 1 ? 10 : simulatedLevel + 10;
  const reqForBar = EXP_TABLE[nextTargetForBar] ? EXP_TABLE[nextTargetForBar].exp : 1; 
  
  const basePct = simulatedLevel > currentLvl ? 0 : Math.min(100, (currentExp / reqForBar) * 100);
  const totalPct = simulatedLevel === maxLvl ? 100 : Math.min(100, (simulatedExp / reqForBar) * 100);
  
  const expBar = document.getElementById('lvlup-exp-bar');
  if (expBar) expBar.style.width = basePct + '%';
  const expBarPrev = document.getElementById('lvlup-exp-bar-preview');
  if (expBarPrev) expBarPrev.style.width = totalPct + '%';
  const expText = document.getElementById('lvlup-exp-text');
  if (expText) expText.textContent = simulatedLevel === maxLvl ? 'MAX' : `${simulatedExp} / ${reqForBar}`;
  
  const container = document.getElementById('lvlup-items-container');
  if (!container) return;
  container.innerHTML = '';
  
  ['Item_006', 'Item_007', 'Item_008'].forEach(itemId => {
    const itemData = GameData.items && GameData.items.find(i => i.Item_ID === itemId);
    const itemName = itemData ? itemData.Item_Name : itemId;
    const itemIcon = itemData ? itemData.Item_Icon : '';
    const expVal = EXP_ITEMS[itemId];
    const myQty = PlayerData.items[itemId] || 0;
    const useQty = lvlupModalState.expAdds[itemId] || 0;
    
    const disablePlus = (myQty - useQty <= 0) || (simulatedLevel === maxLvl);
    const disableMinus = useQty <= 0;
    const disableMin = useQty <= 0;
    const disableMax = disablePlus;
    
    const itemHtml = `
      <div class="lvlup-item" style="text-align: center; background: rgba(0,0,0,0.3); padding: 10px 6px; border-radius: 8px; width: 135px;">
        <img src="${itemIcon}" style="width: 50px; height: 50px; object-fit: contain; display: block; margin: 0 auto;" alt="${itemName}"/>
        <div style="font-size: 0.8rem; margin: 5px 0; color: #4dabf7; font-weight: bold;">+${expVal} EXP</div>
        <div style="font-size: 0.82rem; color: #ffffff; font-weight: bold; background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; margin: 5px 0;">창고 보유: <span style="color: #38bdf8; font-weight: 900; font-size: 0.92rem;">${myQty.toLocaleString()}</span>개</div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 10px;">
          <button class="btn-min" data-item="${itemId}" style="padding: 2px 5px; font-size: 11px; border-radius: 4px; background: rgba(255,255,255,0.15); color: #ccc; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;" ${disableMin ? 'disabled' : ''}>최소</button>
          <button class="btn-minus circle-btn" data-item="${itemId}" style="width:22px;height:22px;line-height:22px;padding:0;font-size:12px;" ${disableMinus ? 'disabled' : ''}>-</button>
          <span style="font-weight: bold; min-width: 24px; text-align: center; color: #fff; font-size: 0.95rem;">${useQty}</span>
          <button class="btn-plus circle-btn" data-item="${itemId}" style="width:22px;height:22px;line-height:22px;padding:0;font-size:12px;" ${disablePlus ? 'disabled' : ''}>+</button>
          <button class="btn-max" data-item="${itemId}" style="padding: 2px 5px; font-size: 11px; border-radius: 4px; background: rgba(59,130,246,0.3); color: #93c5fd; border: 1px solid rgba(59,130,246,0.5); cursor: pointer;" ${disableMax ? 'disabled' : ''}>최대</button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });

  container.querySelectorAll('.btn-min').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itm = e.target.dataset.item || (e.target.closest && e.target.closest('button').dataset.item);
      if (!itm) return;
      lvlupModalState.expAdds[itm] = 0;
      lvlupModalState.addExp = Object.entries(lvlupModalState.expAdds).reduce((acc, [k, v]) => acc + (v * (EXP_ITEMS[k] || 0)), 0);
      renderLevelUpModal();
    });
  });

  container.querySelectorAll('.btn-max').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itm = e.target.dataset.item || (e.target.closest && e.target.closest('button').dataset.item);
      if (!itm) return;
      const myQty = PlayerData.items[itm] || 0;
      const currentMaxLvl = getMaxLvl(lvlupModalState.char.Character_Tier, lvlupModalState.stats.star);
      
      // Calculate total EXP needed to reach currentMaxLvl from base state
      let totalExpNeeded = 0;
      let checkLvl = lvlupModalState.stats.level;
      while (checkLvl < currentMaxLvl) {
        const nextTarget = checkLvl === 1 ? 10 : checkLvl + 10;
        if (nextTarget > currentMaxLvl) break;
        const req = EXP_TABLE[nextTarget];
        if (!req) break;
        totalExpNeeded += req.exp;
        checkLvl = nextTarget;
      }
      const netExpNeeded = Math.max(0, totalExpNeeded - (lvlupModalState.stats.exp || 0));
      
      // EXP provided by other items already added
      let otherExp = 0;
      for (const [k, v] of Object.entries(lvlupModalState.expAdds)) {
        if (k !== itm) {
          otherExp += (v || 0) * (EXP_ITEMS[k] || 0);
        }
      }
      
      const remainingExpNeeded = Math.max(0, netExpNeeded - otherExp);
      const expVal = EXP_ITEMS[itm] || 1;
      const countNeeded = Math.ceil(remainingExpNeeded / expVal);
      const targetQty = Math.min(myQty, countNeeded);
      
      lvlupModalState.expAdds[itm] = targetQty;
      lvlupModalState.addExp = Object.entries(lvlupModalState.expAdds).reduce((acc, [k, v]) => acc + (v * (EXP_ITEMS[k] || 0)), 0);
      renderLevelUpModal();
    });
  });
  
  const handleHold = (e, isPlus) => {
    if (e.button !== 0 && e.type !== 'touchstart') return;
    const itm = e.target.dataset.item || (e.target.closest && e.target.closest('button').dataset.item);
    if (!itm) return;
    
    let delay = 400;
    const action = () => {
      if (isPlus) {
        const myQty = PlayerData.items[itm] || 0;
        const currentMaxLvl = getMaxLvl(lvlupModalState.char.Character_Tier, lvlupModalState.stats.star);
        if (lvlupModalState.expAdds[itm] < myQty && lvlupModalState.previewLevel < currentMaxLvl) {
          lvlupModalState.expAdds[itm] = (lvlupModalState.expAdds[itm] || 0) + 1;
          lvlupModalState.addExp += EXP_ITEMS[itm];
          renderLevelUpModal();
          return true;
        }
      } else {
        if (lvlupModalState.expAdds[itm] > 0) {
          lvlupModalState.expAdds[itm]--;
          lvlupModalState.addExp -= EXP_ITEMS[itm];
          renderLevelUpModal();
          return true;
        }
      }
      return false;
    };
    
    if (action()) {
      const loop = () => {
        if (action()) {
          delay = Math.max(100, delay - 25);
          lvlupHoldTimer = setTimeout(loop, delay);
        }
      };
      lvlupHoldTimer = setTimeout(loop, delay);
    }
  };

  container.querySelectorAll('.btn-minus').forEach(btn => {
    btn.addEventListener('mousedown', (e) => handleHold(e, false));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleHold(e, false); }, {passive: false});
    btn.addEventListener('mouseleave', () => clearTimeout(lvlupHoldTimer));
    btn.addEventListener('touchcancel', () => clearTimeout(lvlupHoldTimer));
  });
  
  container.querySelectorAll('.btn-plus').forEach(btn => {
    btn.addEventListener('mousedown', (e) => handleHold(e, true));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleHold(e, true); }, {passive: false});
    btn.addEventListener('mouseleave', () => clearTimeout(lvlupHoldTimer));
    btn.addEventListener('touchcancel', () => clearTimeout(lvlupHoldTimer));
  });
}

function openLevelUpModal(char, stats) {
  const modal = document.getElementById('levelup-modal');
  if (!modal) {
    console.error('levelup-modal not found');
    return;
  }
  lvlupModalState = { char, stats, expAdds: { 'Item_006': 0, 'Item_007': 0, 'Item_008': 0 }, addExp: 0, creditCost: 0, previewLevel: stats.level, previewExp: stats.exp || 0, overflowExp: 0 };
  try {
    renderLevelUpModal();
  } catch (err) {
    console.error('renderLevelUpModal error:', err);
  }
  
  const confirmBtn = document.getElementById('btn-lvlup-confirm');
  if (confirmBtn) {
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
      const myCredit = PlayerData.items['Item_002'] || 0;
      if (myCredit < lvlupModalState.creditCost) {
        alert('크레딧이 부족합니다.');
        return;
      }
      if (lvlupModalState.addExp === 0) {
        alert('경험치 아이템을 선택해주세요.');
        return;
      }
      if (lvlupModalState.overflowExp > 0) {
        if (!confirm(`${lvlupModalState.overflowExp} 경험치가 최대 레벨을 초과하여 소멸됩니다. 계속하시겠습니까?`)) {
          return;
        }
      }
      
      PlayerData.items['Item_002'] -= lvlupModalState.creditCost;
      Object.keys(lvlupModalState.expAdds).forEach(k => { PlayerData.items[k] -= lvlupModalState.expAdds[k]; });
      
      const charId = lvlupModalState.char.Character_ID;
      const oldLevel = lvlupModalState.stats.level;
      const newLevel = lvlupModalState.previewLevel;
      
      PlayerData.characterStats[charId].level = newLevel;
      PlayerData.characterStats[charId].exp = newLevel === getMaxLvl(lvlupModalState.char.Character_Tier, lvlupModalState.stats.star) ? 0 : lvlupModalState.previewExp;
      PlayerData.characterStats = { ...PlayerData.characterStats };
      
      updateCharInfoStats(lvlupModalState.char, PlayerData.characterStats[charId].level, PlayerData.characterStats[charId].star, true);
      modal.classList.remove('show');
      
      // 레벨업 시 asset_019 사운드 출력 (경험치만 먹고 레벨업하지 않은 경우 사운드 미출력)
      if (newLevel > oldLevel) {
        if (typeof window.playAssetSound === 'function') {
          window.playAssetSound('asset_019');
        }
      }

      const oldDecade = Math.floor(oldLevel / 10);
      const newDecade = Math.floor(newLevel / 10);
      if (newDecade > oldDecade && newLevel > oldLevel) {
          playEffect('levelup', oldLevel, newLevel);
      }
    });
  }
  
  const cancelBtn = document.getElementById('btn-lvlup-cancel');
  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => modal.classList.remove('show'));
  }
  
  modal.classList.add('show');
}

function openRankUpModal(char, stats) {
  const modal = document.getElementById('rankup-modal');
  document.getElementById('rankup-current-star').textContent = stats.star;
  document.getElementById('rankup-next-star').textContent = stats.star + 1;
  
  const reqs = [];
  const typeMap = {
      '청초': 'Item_011', '게닌': 'Item_012', '쿨': 'Item_013',
      '아티스트': 'Item_014', '큐트': 'Item_015', '광기': 'Item_016', '에로': 'Item_017'
  };
  
  const role12 = {
      '근거리딜러': 'Item_022', '원거리딜러': 'Item_037', '마법딜러': 'Item_025', '암살자': 'Item_031',
      '탱커': 'Item_022', '버퍼': 'Item_028', '디버퍼': 'Item_034', '힐러': 'Item_025'
  };
  
  const role8 = {
      '근거리딜러': 'Item_037', '원거리딜러': 'Item_031', '마법딜러': 'Item_031', '암살자': 'Item_037',
      '탱커': 'Item_034', '버퍼': 'Item_022', '디버퍼': 'Item_028', '힐러': 'Item_034'
  };
  
  const role12_star3 = {
      '근거리딜러': 'Item_021', '원거리딜러': 'Item_036', '마법딜러': 'Item_024', '암살자': 'Item_030',
      '탱커': 'Item_021', '버퍼': 'Item_027', '디버퍼': 'Item_033', '힐러': 'Item_024'
  };
  
  const role8_star3 = {
      '근거리딜러': 'Item_036', '원거리딜러': 'Item_030', '마법딜러': 'Item_030', '암살자': 'Item_036',
      '탱커': 'Item_033', '버퍼': 'Item_021', '디버퍼': 'Item_027', '힐러': 'Item_033'
  };

  const mainType = (char.Character_Type || '').split('/')[0].replace(/\s/g, '').trim();
  const mainRole = (char.Character_Role || '').split('/')[0].replace(/\s/g, '').trim();
  
  console.log('RANKUP DEBUG', char.Character_Name, char.Character_Type, char.Character_Role, mainType, mainRole);
  if (stats.star === 1) { // Star 2 UP
      if (typeMap[mainType]) reqs.push({ itemId: typeMap[mainType], qty: 6 });
      if (role12[mainRole]) reqs.push({ itemId: role12[mainRole], qty: 12 });
      if (role8[mainRole]) reqs.push({ itemId: role8[mainRole], qty: 8 });
  } else if (stats.star === 2) { // Star 3 UP
      if (typeMap[mainType]) reqs.push({ itemId: typeMap[mainType], qty: 24 });
      if (role12_star3[mainRole]) reqs.push({ itemId: role12_star3[mainRole], qty: 12 });
      if (role8_star3[mainRole]) reqs.push({ itemId: role8_star3[mainRole], qty: 8 });
  }
  
  const container = document.getElementById('rankup-materials');
  container.innerHTML = '';
  let canRankUp = true;
  
  if (reqs.length === 0) {
    container.innerHTML = '<div style="color: #aaa;">요구 재료 없음</div>';
  } else {
    reqs.forEach(req => {
      const myQty = PlayerData.items[req.itemId] || 0;
      const isEnough = myQty >= req.qty;
      if (!isEnough) canRankUp = false;
      const itemData = GameData.items && GameData.items.find(i => i.Item_ID === req.itemId);
      const itemName = itemData ? itemData.Item_Name : req.itemId;
      const itemIcon = itemData ? itemData.Item_Icon : '';
      
      const html = `
        <div style="display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px; width: 95px; text-align: center; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
          ${itemIcon ? `<img src="${itemIcon}" style="width:40px;height:40px; object-fit:contain; margin-bottom: 5px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.2));" alt="${itemName}"/>` : ''}
          <div style="font-size: 0.8rem; font-weight: bold; color: #333; margin-bottom: 8px; line-height: 1.2; word-break: keep-all;">${itemName}</div>
          <div style="font-size: 0.85rem; font-weight: bold; color: #555; background: rgba(255,255,255,0.7); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1);">
            <span style="color: ${isEnough ? '#28a745' : '#ff4d4f'};">${req.qty}</span> / ${myQty}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    });
  }
  
  const confirmBtn = document.getElementById('btn-rankup-confirm');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  
  newConfirmBtn.addEventListener('click', () => {
    if (!canRankUp) {
      alert('재료가 부족합니다.');
      return;
    }
    
    reqs.forEach(req => {
      PlayerData.items[req.itemId] -= req.qty;
    });
    const charId = char.Character_ID;
    const oldStar = PlayerData.characterStats[charId].star;
    PlayerData.characterStats[charId].star++;
    const newStar = PlayerData.characterStats[charId].star;
    
    PlayerData.characterStats = { ...PlayerData.characterStats };
    updateCharInfoStats(char, stats.level, PlayerData.characterStats[charId].star, true);
    modal.classList.remove('show');
    
    // 승급 시 asset_019 사운드 출력
    if (typeof window.playAssetSound === 'function') {
      window.playAssetSound('asset_019');
    }

    playEffect('starup', oldStar, newStar);
  });
  
  const cancelBtn = document.getElementById('btn-rankup-cancel');
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  newCancelBtn.addEventListener('click', () => modal.classList.remove('show'));
  
  modal.classList.add('show');
}

export function initCharInfoModal() {
  const modal = document.getElementById('char-info-modal');
  const closeBtn = document.getElementById('btn-char-info-close');
  const tabsContainer = document.getElementById('char-info-tabs-container');
  
  const handleModalClose = () => {
    modal.classList.remove('show');
    currentBattleChar = null;
    if (typeof window._onCharInfoModalClosed === 'function') {
      window._onCharInfoModalClosed();
    }
  };
  if (closeBtn) closeBtn.addEventListener('click', handleModalClose);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) handleModalClose(); });
  
  const btnLvlUp = document.getElementById('btn-lvl-up');
  const btnRankUp = document.getElementById('btn-rank-up');
  
  if (btnLvlUp) {
    btnLvlUp.addEventListener('click', () => {
      const activeChar = currentCharInModal || window._currentCharInModal;
      if (!activeChar) return;
      if (!PlayerData.characterStats) PlayerData.characterStats = {};
      if (!PlayerData.characterStats[activeChar.Character_ID]) {
        PlayerData.characterStats[activeChar.Character_ID] = { level: 1, star: 1, exp: 0 };
      }
      const stats = PlayerData.characterStats[activeChar.Character_ID];
      const maxLvl = getMaxLvl(activeChar.Character_Tier, stats.star);
      if (stats.level < maxLvl) openLevelUpModal(activeChar, stats);
      else alert('최대 레벨입니다.');
    });
  }
  
  if (btnRankUp) {
    btnRankUp.addEventListener('click', () => {
      const activeChar = currentCharInModal || window._currentCharInModal;
      if (!activeChar) return;
      if (!PlayerData.characterStats) PlayerData.characterStats = {};
      if (!PlayerData.characterStats[activeChar.Character_ID]) {
        PlayerData.characterStats[activeChar.Character_ID] = { level: 1, star: 1, exp: 0 };
      }
      const stats = PlayerData.characterStats[activeChar.Character_ID];
      if (stats.star < 3) openRankUpModal(activeChar, stats);
      else alert('최대 성급입니다.');
    });
  }
  
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.char-info-tab');
      if (!tab || !currentCharInModal) return;
      tabsContainer.querySelectorAll('.char-info-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.dataset.battleTab && currentBattleChar) {
        currentBattleTabMode = tab.dataset.battleTab; // 'standard' | 'buffed'
        updateBattleCharInfoStats(currentBattleChar, currentBattleTabMode);
        return;
      }

      if (tab.dataset.mychar) {
        const stats = PlayerData.characterStats && PlayerData.characterStats[currentCharInModal.Character_ID];
        const lvl = stats ? (stats.level || 1) : 1;
        const st = stats ? (stats.star || 1) : 1;
        updateCharInfoStats(currentCharInModal, lvl, st, true);
      } else {
        const star = parseInt(tab.dataset.star, 10) || 1;
        let level;
        if (tab.dataset.level === 'max') {
          level = getMaxLvl(currentCharInModal.Character_Tier, star);
        } else {
          level = parseInt(tab.dataset.level, 10) || 1;
        }
        updateCharInfoStats(currentCharInModal, level, star, false);
      }
    });
  }

  const bloomModal = document.getElementById('bloom-modal');
  const btnBloomClose = document.getElementById('btn-bloom-close');
  if (btnBloomClose) {
    btnBloomClose.addEventListener('click', () => {
      if (bloomModal) bloomModal.classList.remove('show');
    });
  }
  if (bloomModal) {
    bloomModal.addEventListener('click', (e) => {
      if (e.target === bloomModal) bloomModal.classList.remove('show');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCharInfoModal();
});

function playEffect(type, oldVal, newVal) {
    const overlay = document.getElementById('effect-overlay');
    if (!overlay) return;
    const title = document.getElementById('effect-title');
    const subtitle = document.getElementById('effect-subtitle');
    const stars = document.getElementById('effect-stars');
    
    stars.innerHTML = '';
    
    if (type === 'levelup') {
        title.textContent = 'Level Up!';
        title.style.color = '#fff';
        title.style.textShadow = '0 0 20px rgba(0, 168, 255, 0.8), 0 0 40px rgba(0, 168, 255, 0.6), 2px 4px 10px rgba(0,0,0,0.8)';
        subtitle.textContent = `${oldVal} → ${newVal}`;
        subtitle.style.borderColor = '#00a8ff';
    } else if (type === 'starup') {
        title.textContent = 'Star Up!';
        title.style.color = '#fff';
        title.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.6), 2px 4px 10px rgba(0,0,0,0.8)';
        subtitle.textContent = `⭐ 승급 완료! ⭐`;
        subtitle.style.borderColor = '#ffd700';
        
        let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
        if (GameData && GameData.assets) {
            const assetObj = GameData.assets.find(a => a.Asset_ID === 'asset_010');
            if (assetObj && assetObj.Asset_Link) starIconUrl = assetObj.Asset_Link;
        }
        for (let i = 0; i < newVal; i++) {
            stars.innerHTML += `<img src="${starIconUrl}" class="effect-star" style="animation-delay: ${i * 0.15}s;">`;
        }
    }
    
    if (typeof window.playAssetSound === 'function') {
      window.playAssetSound('asset_019');
    }

    overlay.classList.add('show');
    setTimeout(() => {
        overlay.classList.remove('show');
    }, 3000);
}

export function openBloomModal(char, currentLevel) {
  const modal = document.getElementById('bloom-modal');
  if (!modal) return;
  
  document.getElementById('bloom-current-stage').textContent = `🌸 ${currentLevel}`;
  const listEl = document.getElementById('bloom-effect-list');
  listEl.innerHTML = "";
  
  if (GameData.bloom) {
      const roles = (char.Character_Role || "").split(/[,/]/).map(s => s.trim()).filter(Boolean);
      const validBloomRoles = new Set(GameData.bloom.map(b => b.Role));
      const primaryRole = roles.find(r => validBloomRoles.has(r)) || roles[0] || "";
      for (let level = 1; level <= 5; level++) {
          const effects = GameData.bloom.filter(e => e.Role === primaryRole && e.Level === level);
          if (effects.length > 0) {
              const effectText = effects.map(e => `• ${e.Desc}`).join("<br>");
              
              const itemDiv = document.createElement("div");
              itemDiv.style.padding = "10px 12px";
              itemDiv.style.borderRadius = "6px";
              itemDiv.style.fontSize = "0.95rem";
              
              if (level <= currentLevel) {
                  // 누적된 효과: 파란색 계열
                  itemDiv.style.backgroundColor = "#e3f2fd";
                  itemDiv.style.color = "#1565c0";
                  itemDiv.style.border = "1px solid #90caf9";
                  itemDiv.innerHTML = `<strong>🌸 ${level} (적용됨)</strong><br><div style="margin-top: 4px;">${effectText}</div>`;
              } else if (level === currentLevel + 1) {
                  // 다음 효과: 주황색 계열
                  itemDiv.style.backgroundColor = "#fff3e0";
                  itemDiv.style.color = "#e65100";
                  itemDiv.style.border = "1px solid #ffcc80";
                  itemDiv.innerHTML = `<strong>🌸 ${level} (다음 효과)</strong><br><div style="margin-top: 4px;">${effectText}</div>`;
              } else {
                  // 남은 효과: 짙은 회색 계열
                  itemDiv.style.backgroundColor = "#f5f5f5";
                  itemDiv.style.color = "#616161";
                  itemDiv.style.border = "1px solid #e0e0e0";
                  itemDiv.innerHTML = `<strong>🌸 ${level}</strong><br><div style="margin-top: 4px;">${effectText}</div>`;
              }
              
              listEl.appendChild(itemDiv);
          }
      }
      
      // 만약 표시할 효과가 전혀 없다면 안내 문구 표시
      if (listEl.innerHTML === "") {
          listEl.innerHTML = "<div style='color: #888; text-align: center; padding: 10px;'>해당 역할군에 대한 개화 데이터가 없습니다.</div>";
      }
  }
  
  const progressTextEl = document.getElementById('bloom-progress-text');
  const infoTextEl = document.getElementById('bloom-info-text');

  if (currentLevel >= 5) {
      if(progressTextEl) progressTextEl.textContent = "MAX 🌸";
      if(infoTextEl) infoTextEl.textContent = "최대 도달 (이후 중복 획득 시 루비로 변환됩니다)";
  } else {
      if(progressTextEl) progressTextEl.textContent = `${currentLevel} / 5 🌸`;
      if(infoTextEl) infoTextEl.textContent = "같은 캐릭터를 획득할 때마다 자동으로 개화 레벨이 오릅니다.";
  }
  
  modal.classList.add('show');
}
export function updateMainPickupBanner() {
    const banner = document.getElementById("main-special-banner");
    if (!banner) return;
    
    // Clicking the banner goes to scene-12 and sets type to special
    banner.onclick = () => {
        // Find special button and click it to set state
        const specialBtn = document.querySelector('.gacha-side-btn[data-type="special"]');
        if (specialBtn) specialBtn.click();
        
        // Find casting menu button and click it to switch scene
        const castingMenuBtn = document.querySelector('.menu-btn[data-target="scene-12"]');
        if (castingMenuBtn) castingMenuBtn.click();
    };
    
    // Set background to a special character
    const chars = GameData.characters || [];
    const specialChars = chars.filter(c => String(c.Character_Gacha).startsWith("3"));
    if (specialChars.length > 0) {
        let idx = 0;
        
        // Find text element inside the banner
        const textElement = banner.querySelector('div:last-child');
        
        const updateBannerContent = (char) => {
            banner.style.backgroundImage = "url(" + char.Character_Image_Full + ")";
            
            // Extract text after '/'
            const gachaStr = String(char.Character_Gacha);
            const textMatch = gachaStr.indexOf('/');
            if (textElement) {
                if (textMatch !== -1) {
                    textElement.textContent = gachaStr.substring(textMatch + 1).trim();
                } else {
                    textElement.textContent = "진행중인 스페셜!";
                }
            }
        };
        
        setInterval(() => {
            const char = specialChars[idx];
            updateBannerContent(char);
            
            const glaze = banner.querySelector('.gacha-banner-glaze');
            if(glaze) {
                glaze.classList.remove('animate');
                void glaze.offsetWidth;
                glaze.classList.add('animate');
            }
            idx = (idx + 1) % specialChars.length;
        }, 4000);
        
        updateBannerContent(specialChars[0]);
    }
}


export function showMessage(msg) {
    alert(msg);
}

export function showConfirmModal(msg, onConfirm) {
    if (confirm(msg)) {
        onConfirm();
    }
}






function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatSkillTextWithKeywords(rawText) {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // 1. Run formatSkillDescriptionText if available
  if (typeof window.formatSkillDescriptionText === 'function') {
    text = window.formatSkillDescriptionText(text);
  }

  // Protect already-formatted keyword spans and existing bracketed blocks from double wrapping
  const protectedBlocks = [];
  text = text.replace(/<span[^>]*class="[^"]*kw-desc-highlight[^"]*"[^>]*>[\s\S]*?<\/span>|\[[^\]]*\]/g, (match) => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(match);
    return `@@KW_PROT_${idx}@@`;
  });

  // 2. Also detect keyword names from GameData.keyword for any keywords not enclosed in brackets
  const keywords = (GameData.keyword || []).filter(k => k && k.Keyword_Name && k.Keyword_Name.length >= 2);
  if (keywords.length > 0) {
    const sortedKw = [...keywords].sort((a, b) => b.Keyword_Name.length - a.Keyword_Name.length);
    sortedKw.forEach(kw => {
      const name = kw.Keyword_Name;
      const isDebuff = kw.Keyword_Type === '디버프';
      const icon = kw.Keyword_Icon || (isDebuff ? '🔻' : '✨');
      const desc = String(kw.Keyword_Desc || '').replace(/"/g, '&quot;');
      const color = isDebuff ? '#ef4444' : '#38bdf8';
      const cls = isDebuff ? 'desc-highlight-debuff' : 'desc-highlight-buff';

      // Split text by HTML tags to safely operate only on text outside HTML tags
      const parts = text.split(/(<[^>]*>)/);
      for (let i = 0; i < parts.length; i += 2) {
        if (parts[i] && parts[i].includes(name)) {
          const regex = new RegExp(`(?<!\\[\\s*)(${escapeRegExp(name)})(?!\\s*\\])`, 'g');
          parts[i] = parts[i].replace(regex, `<span class="${cls} kw-desc-highlight" data-kw-name="${name}" data-kw-icon="${icon}" data-kw-desc="${desc}" data-kw-type="${kw.Keyword_Type || ''}" data-kw-color="${color}" style="cursor:help; font-weight:bold; text-decoration:underline dotted ${color};">[ ${icon} $1 ]</span>`);
        }
      }
      text = parts.join('');
    });
  }

  // Restore protected blocks
  text = text.replace(/@@KW_PROT_(\d+)@@/g, (m, idx) => protectedBlocks[parseInt(idx, 10)] || m);

  return text.replace(/\\n/g, '<br>');
}

function renderSkillTagBadges(tagsStr) {
  const clean = (tagsStr || '').trim();
  if (!clean || clean === '없음' || clean === '없음.') return '';
  const tagList = clean.split(/[,/]/).map(t => t.trim()).filter(Boolean);
  return tagList.map(t => {
    let kwInfo = null;
    if (typeof window.getKeywordInfo === 'function') {
      kwInfo = window.getKeywordInfo(t);
    }
    if (!kwInfo && GameData.keyword) {
      kwInfo = GameData.keyword.find(k => k.Keyword_Name === t || k.Keyword_ID === t);
    }
    if (kwInfo) {
      const isDebuff = kwInfo.Keyword_Type === '디버프';
      const icon = kwInfo.Keyword_Icon || (isDebuff ? '🔻' : '✨');
      const safeDesc = String(kwInfo.Keyword_Desc || '').replace(/"/g, '&quot;');
      const bg = isDebuff ? '#e74c3c' : '#2ecc71';
      return `<span class="kw-desc-highlight" data-kw-name="${kwInfo.Keyword_Name || t}" data-kw-icon="${icon}" data-kw-desc="${safeDesc}" data-kw-type="${kwInfo.Keyword_Type || ''}" style="background: ${bg}; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold; cursor: help; display: inline-flex; align-items: center; gap: 4px;">${icon} ${t}</span>`;
    }
    return `<span style="background: #2ecc71; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold;">${t}</span>`;
  }).join(' ');
}

function renderCombatSkillsUI(char, star = 3, isMyChar = false) {
  const skillsContainer = document.getElementById('char-skills-container');
  if (!skillsContainer) return;
  skillsContainer.innerHTML = '';
  
  if (typeof window.initKeywordFloatingTooltip === 'function') {
    window.initKeywordFloatingTooltip();
  }
  
  const pSkillsData = GameData.p_skill || [];
  const aSkillsData = GameData.skills || [];

  const charStats = (isMyChar && PlayerData && PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) || null;
  const rawMastery = charStats ? charStats.skillMastery : null;
  const ssMastery = (rawMastery && typeof rawMastery === 'object') ? (rawMastery.SS || 0) : (typeof rawMastery === 'number' ? rawMastery : 0);
  const asMastery = (rawMastery && typeof rawMastery === 'object') ? (rawMastery.AS || 0) : 0;
  const isMasteryAvailable = Boolean(isMyChar && charStats);
  
  const renderPassive = (skillId, label, isLocked = false) => {
      if (!skillId || skillId.trim() === '') return;
      const sObj = pSkillsData.find(s => s.P_Skill_ID === skillId);
      
      const box = document.createElement('div');
      box.className = 'skill-box skill-passive';
      box.style.position = 'relative';
      box.style.boxSizing = 'border-box';
      box.style.marginBottom = '12px';
      if (isLocked) {
          box.style.opacity = '0.5';
          box.style.filter = 'grayscale(100%)';
      }
      
      if (!sObj) {
          box.innerHTML = `
              <div style="position: absolute; top: 12px; right: 15px; font-size: 0.85em; color: #95a5a6; font-weight: bold;">${label}${isLocked ? ' (🔒 ★3 해금)' : ''}</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2c3e50; margin-bottom: 8px;">임시 스킬명</div>
              <div class="skill-desc" style="color: #555; line-height: 1.4;">(데이터 미구현: ${skillId})</div>
          `;
      } else {
          box.innerHTML = `
              <div style="position: absolute; top: 12px; right: 15px; font-size: 0.85em; color: #95a5a6; font-weight: bold;">${label}${isLocked ? ' (🔒 ★3 해금)' : ''}</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2c3e50; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                  ${sObj.P_Skill_Name || '임시 스킬명'} <span style="font-size: 0.8em; color: #7f8c8d; margin-left: 5px;">${sObj.P_Skill_Tier || ''}</span>
              </div>
              <div style="margin-bottom: 10px;">
                  <span style="background: #3498db; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold;">${sObj.P_Skill_Type || '패시브'}</span>
              </div>
              <div class="skill-desc" style="color: #444; line-height: 1.5; font-size: 0.95em;">
                  ${formatSkillTextWithKeywords(sObj.P_Skill_Desc || '')}
              </div>
          `;
      }
      skillsContainer.appendChild(box);
  };
  
  const renderActive = (skillId, label, className, isLocked = false) => {
      if (!skillId || skillId.trim() === '') return;
      const sObj = aSkillsData.find(s => s.Skill_ID === skillId);
      
      const box = document.createElement('div');
      box.className = `skill-box ${className}`;
      box.style.position = 'relative';
      box.style.boxSizing = 'border-box';
      box.style.marginBottom = '12px';
      if (isLocked) {
          box.style.opacity = '0.5';
          box.style.filter = 'grayscale(100%)';
      }
      
      const lockText = label === '궁극기' ? ' (🔒 ★2 해금)' : ' (🔒 ★3 해금)';
      if (!sObj) {
          box.innerHTML = `
              <div style="position: absolute; top: 12px; right: 15px; font-size: 0.85em; color: #95a5a6; font-weight: bold;">${label}${isLocked ? lockText : ''}</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2c3e50; margin-bottom: 8px;">임시 스킬명</div>
              <div class="skill-desc" style="color: #555; line-height: 1.4;">(데이터 미구현: ${skillId})</div>
          `;
      } else {
          const mLevel = label === '고유기' ? ssMastery : (label === '궁극기' ? asMastery : 0);

          // 숙련도 적용 함수 호출 (Act1/Act2 계수 및 오버히트, 설명문 자동 갱신)
          const masteryFunc = (typeof applyMasteryToSkill === 'function') 
              ? applyMasteryToSkill 
              : (typeof window !== 'undefined' ? window.applyMasteryToSkill : null);

          const effectiveSkill = (mLevel > 0 && typeof masteryFunc === 'function')
              ? masteryFunc(sObj, mLevel)
              : sObj;

          const tagsHtml = renderSkillTagBadges(effectiveSkill.Skill_Tags);
          
          // 오버히트: 결과값만 깔끔하게 단일 표시
          let ohHtml = '';
          const finalOh = Number(effectiveSkill.Skill_Overheat) || 0;
          const hasOh = (sObj.Skill_Overheat !== undefined && String(sObj.Skill_Overheat).trim() !== '');

          if (hasOh) {
              ohHtml = `<span style="background: #e67e22; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold;">오버히트: ${finalOh}</span>`;
          }

          let masteryBadge = '';
          if (mLevel > 0) {
              masteryBadge = `<span style="background:linear-gradient(135deg, #f39c12, #e67e22); color:#fff; padding:2px 7px; border-radius:4px; font-size:0.75em; font-weight:bold; box-shadow:0 1px 4px rgba(0,0,0,0.2);">숙련 Lv.${mLevel}</span>`;
          }
          
          box.innerHTML = `
              <div style="position: absolute; top: 12px; right: 15px; font-size: 0.85em; color: #95a5a6; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                  ${masteryBadge}
                  <span>${label}${isLocked ? lockText : ''}</span>
              </div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2c3e50; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                  ${effectiveSkill.Skill_Name || '임시 스킬명'}
              </div>
              <div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
                  ${ohHtml}
                  ${tagsHtml}
              </div>
              <div class="skill-desc" style="color: #444; line-height: 1.5; font-size: 0.95em;">
                  ${formatSkillTextWithKeywords(effectiveSkill.Skill_Desc || '')}
              </div>
          `;
      }
      skillsContainer.appendChild(box);

  // Skill Mastery (★2 이상 해금)
  const charStar = (charStats && charStats.star) ? charStats.star : (star || 1);
  const isMasteryUnlocked = isMasteryAvailable && (charStar >= 2);
  let masterySubText = '보유 캐릭터 전용';
  let masteryBtnText = '스킬 숙련';
  if (isMasteryAvailable) {
    if (isMasteryUnlocked) {
      masterySubText = `고유기: Lv.${ssMastery}/7 ｜ 궁극기: Lv.${asMastery}/7`;
      masteryBtnText = '스킬 숙련';
    } else {
      masterySubText = '🔒 ★2 달성 시 해금됩니다';
      masteryBtnText = '🔒 ★2 해금';
    }
  }

  let masteryHtml = `
      <div style="background:#2c3e50; border-radius:8px; padding:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; border: 1px solid rgba(243, 156, 18, 0.35);">
          <div>
              <div style="font-weight:bold; color:#ecf0f1; font-size:1.05em; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span>⭐</span> 스킬 숙련도
              </div>
              <div style="font-size:0.88em; color:${isMasteryUnlocked ? '#f1c40f' : '#7f8c8d'};">
                ${masterySubText}
              </div>
          </div>
          <button id="btn-skill-mastery" ${isMasteryUnlocked ? '' : 'disabled'} style="background:${isMasteryUnlocked ? 'linear-gradient(135deg, #f39c12, #d35400)' : '#7f8c8d'}; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-weight:bold; cursor:${isMasteryUnlocked ? 'pointer' : 'not-allowed'}; box-shadow:${isMasteryUnlocked ? '0 2px 8px rgba(243,156,18,0.4)' : 'none'};">${masteryBtnText}</button>
      </div>
  `;
  skillsContainer.insertAdjacentHTML('beforeend', masteryHtml);
  
  const btnMastery = skillsContainer.querySelector('#btn-skill-mastery');
  if (btnMastery && isMasteryUnlocked) {
      btnMastery.onclick = () => {
          openSkillMasteryModal(char);
      };
  }

  // 패시브 1, 2
  renderPassive(char.Character_P1, '패시브 1', false);
  renderPassive(char.Character_P2, '패시브 2', star < 3);
  
  // 궁극기, 고유기
  renderActive(char.Character_AS, '궁극기', 'skill-ult', star < 2);
  renderActive(char.Character_SS, '고유기', 'skill-active', false);
  
  // 기본기 1, 2, 3
  const basicGrid = document.createElement('div');
  basicGrid.className = 'skill-basic-grid';
  basicGrid.style.display = 'grid';
  basicGrid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  basicGrid.style.gap = '8px';
  basicGrid.style.width = '100%';
  basicGrid.style.boxSizing = 'border-box';
  
  const renderBasic = (skillId, label) => {
      if (!skillId || skillId.trim() === '') return;
      const sObj = aSkillsData.find(s => s.Skill_ID === skillId);
      
      const box = document.createElement('div');
      box.className = 'skill-box skill-basic';
      box.style.position = 'relative';
      box.style.margin = '0';
      box.style.padding = '12px';
      box.style.boxSizing = 'border-box';
      box.style.minWidth = '0';
      
      if (!sObj) {
          box.innerHTML = `
              <div style="position: absolute; top: 10px; right: 10px; font-size: 0.75em; color: #95a5a6; font-weight: bold;">${label}</div>
              <div style="font-size: 0.95em; font-weight: bold; color: #2c3e50; margin-bottom: 8px;">임시 스킬명</div>
              <div class="skill-desc" style="color: #555; font-size: 0.85em; line-height: 1.3;">(데이터 미구현)</div>
          `;
      } else {
          const tagsHtml = renderSkillTagBadges(sObj.Skill_Tags);
          
          let ohHtml = '';
          const ohVal = (sObj.Skill_Overheat || '').trim();
          if (ohVal) {
              ohHtml = `<span style="background: #e67e22; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; font-weight: bold;">오버히트: ${ohVal}</span>`;
          }
          
          box.innerHTML = `
              <div style="position: absolute; top: 10px; right: 10px; font-size: 0.75em; color: #95a5a6; font-weight: bold;">${label}</div>
              <div style="font-size: 0.95em; font-weight: bold; color: #2c3e50; margin-bottom: 8px; padding-right: 45px; word-break: keep-all;">
                  ${sObj.Skill_Name || '임시 스킬명'}
              </div>
              <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
                  ${ohHtml}
                  ${tagsHtml}
              </div>
              <div class="skill-desc" style="color: #444; font-size: 0.85em; line-height: 1.4; word-break: break-word;">
                  ${formatSkillTextWithKeywords(sObj.Skill_Desc || '')}
              </div>
          `;
      }
      basicGrid.appendChild(box);
  };
  
  renderBasic(char.Character_S1, '기본기 1');
  renderBasic(char.Character_S2, '기본기 2');
  renderBasic(char.Character_S3, '기본기 3');
  
  if (basicGrid.children.length > 0) {
      skillsContainer.appendChild(basicGrid);
  }
}


window.applyVolumeSettings = function() {
    if (!PlayerData.options) PlayerData.options = {};
    const opt = PlayerData.options;
    
    // Default values if undefined
    if(opt.volMaster === undefined) opt.volMaster = 100;
    if(opt.volBgm === undefined) opt.volBgm = 70;
    if(opt.volSfx === undefined) opt.volSfx = 100;
    if(opt.muteMaster === undefined) opt.muteMaster = false;
    if(opt.muteBgm === undefined) opt.muteBgm = false;
    if(opt.muteSfx === undefined) opt.muteSfx = false;

    // [추가] 구버전 settings 객체와 완벽 동기화 (전투 시스템 누락 방지)
    if (!PlayerData.settings) PlayerData.settings = {};
    PlayerData.settings.sound = { master: opt.volMaster, bgm: opt.volBgm, sfx: opt.volSfx };
    
    // Calculate final volumes (기본 70% 축소 적용)
    const masterMult = opt.muteMaster ? 0 : (opt.volMaster / 100);
    const bgmMult = opt.muteBgm ? 0 : ((opt.volBgm / 100) * 0.7);
    const sfxMult = opt.muteSfx ? 0 : (opt.volSfx / 100);
    
    const finalBgmVol = Math.max(0, Math.min(1, masterMult * bgmMult));
    const finalSfxVol = Math.max(0, Math.min(1, masterMult * sfxMult));
    
    // Apply to BGM elements
    const bgmLogin = document.getElementById("bgm-login");
    const bgmMain = document.getElementById("bgm-main");
    const bgmBattle = document.getElementById("bgm-battle");
    if(bgmLogin) bgmLogin.volume = finalBgmVol;
    if(bgmMain) bgmMain.volume = finalBgmVol;
    if(bgmBattle) bgmBattle.volume = finalBgmVol;
    
    // Store sfx volume globally so other scripts can use it when playing SFX
    window.SFX_VOLUME = finalSfxVol;
    
    // Sync UI if open
    const elVolMaster = document.getElementById("vol-master");
    if(elVolMaster) {
        elVolMaster.value = opt.volMaster;
        document.getElementById("mute-master").checked = opt.muteMaster;
        document.getElementById("vol-bgm").value = opt.volBgm;
        document.getElementById("mute-bgm").checked = opt.muteBgm;
        document.getElementById("vol-sfx").value = opt.volSfx;
        document.getElementById("mute-sfx").checked = opt.muteSfx;
    }
    const chkModalBgm = document.getElementById("chk-bgm-modal-mute");
    if(chkModalBgm) chkModalBgm.checked = !!opt.muteBgm;
    const btnArenaMute = document.getElementById("btn-arena-mute-bgm");
    if(btnArenaMute) btnArenaMute.textContent = opt.muteBgm ? '🔇' : '🔊';
};

// Bind events for Audio Options UI
setTimeout(() => {
    const ids = ['master', 'bgm', 'sfx'];
    ids.forEach(type => {
        const slider = document.getElementById(`vol-${type}`);
        const chk = document.getElementById(`mute-${type}`);
        if(slider) {
            slider.addEventListener('input', (e) => {
                if(!PlayerData.options) PlayerData.options = {};
                PlayerData.options[`vol${type.charAt(0).toUpperCase() + type.slice(1)}`] = parseInt(e.target.value, 10);
                window.applyVolumeSettings();
            });
        }
        if(chk) {
            chk.addEventListener('change', (e) => {
                if(!PlayerData.options) PlayerData.options = {};
                PlayerData.options[`mute${type.charAt(0).toUpperCase() + type.slice(1)}`] = e.target.checked;
                window.applyVolumeSettings();
            });
        }
    });
    // Initial apply
    if(window.PlayerData && window.PlayerData.options) {
        window.applyVolumeSettings();
    }
}, 1000);

// 게임 내 모든 '버튼' 클릭 시 asset_018 사운드 출력 (커서 호버/마우스오버 시에는 절대 출력되지 않음)
export function initGlobalButtonSound() {
  let lastSoundTime = 0;
  document.addEventListener('click', (e) => {
    if (e.type !== 'click') return;
    const btn = e.target.closest('button, .execute-btn, .cancel-btn, .modal-close-btn, .circle-btn, .arena-circle-btn, .lobby-btn, .nav-item, .arena-deck-mini-card, [role="button"]');
    if (!btn) return;
    if (btn.disabled || btn.classList.contains('disabled')) return;
    const now = Date.now();
    if (now - lastSoundTime < 60) return; // 연속 중복 재생 방지 (60ms)
    lastSoundTime = now;
    if (typeof window.playAssetSound === 'function') {
      window.playAssetSound('asset_018');
    }
  }, true);
}

initGlobalButtonSound();

window.getCharMSkillEffect = function(charId, effectType, currentRoom) {
    if (!window.GameData || !window.GameData.m_skill || !window.GameData.characters) return 0;
    const char = window.GameData.characters.find(c => c.Character_ID === charId);
    if (!char || !char.Character_M_Skill) return 0;
    
    // Check if star >= 2
    const pChar = window.PlayerData.characterStats[charId] || {};
    const starVal = pChar.star || char.Character_Star || 1;
    if (starVal < 2) return 0;

    const skill = window.GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill || s.m_skill_id === char.Character_M_Skill);
    if (!skill) return 0;
    
    const sType = skill.M_Skill_Effect_Type || skill.m_skill_effect_type;
    const sRoom = skill.M_Skill_Target_Room || skill.m_skill_target_room;
    const sVal = parseFloat(skill.M_Skill_Value || skill.m_skill_value) || 0;
    
    if (sType === effectType) {
        if (sRoom === 'ALL' || sRoom === currentRoom) {
            return sVal;
        }
    }
    return 0;
};

window.showRosterTooltip = function(e, charId, targetRoomId) {
  let ct = document.getElementById('roster-char-tooltip');
  if (!ct) {
    ct = document.createElement('div');
    ct.id = 'roster-char-tooltip';
    ct.style.position = 'fixed';
    ct.style.background = 'rgba(15, 20, 25, 0.95)';
    ct.style.border = '1px solid #34495e';
    ct.style.borderRadius = '8px';
    ct.style.padding = '8px';
    ct.style.color = '#ecf0f1';
    ct.style.fontSize = '12px';
    ct.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    ct.style.pointerEvents = 'none';
    ct.style.zIndex = '99999';
    ct.style.lineHeight = '1.6';
    ct.style.whiteSpace = 'nowrap';
    document.body.appendChild(ct);
    
    document.addEventListener('mousemove', (e) => {
      if (ct.style.display === 'block') {
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        if (x + ct.offsetWidth > window.innerWidth) x = e.clientX - ct.offsetWidth - 15;
        if (y + ct.offsetHeight > window.innerHeight) y = e.clientY - ct.offsetHeight - 15;
        ct.style.left = x + 'px';
        ct.style.top = y + 'px';
      }
    });
  }

  const char = window.GameData.characters.find(c => c.Character_ID === charId);
  if (!char) return;
  const pChar = PlayerData.characterStats[charId] || {};
  const starVal = pChar.star || char.Character_Star || 1;
  
  // Need to find which stat is needed for the target room
  let targetStat = null;
  const sType = window.STUDIO_TYPES ? window.STUDIO_TYPES.find(t => t.id === targetRoomId) : null;
  const oType = window.OFFICE_TYPES ? window.OFFICE_TYPES.find(t => t.id === targetRoomId) : null;
  if (sType && sType.stat) targetStat = sType.stat;
  if (oType && oType.stat) targetStat = oType.stat;
  if (targetRoomId === 'kitchen' || targetRoomId === 'dismantle') targetStat = 'kitchen'; // exception
  
  const mStats = [
    { key: 'Character_M_Game', label: '🎮 게임' },
    { key: 'Character_M_Talk', label: '💬 잡담' },
    { key: 'Character_M_Sing', label: '🎤 노래' },
    { key: 'Character_M_Sexy', label: '💋 ASMR' },
    { key: 'Character_M_Plan', label: '💡 기획' },
    { key: 'Character_M_Passion', label: '🔥 내구' }
  ];
  
  let statsHtml = `<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px 8px; margin-top:6px; background:rgba(0,0,0,0.3); padding:6px; border-radius:5px; text-align:center;">`;
  mStats.forEach(st => {
      let isTarget = (st.key === targetStat);
      let sColor = isTarget ? '#f1c40f' : '#ecf0f1';
      let sWeight = isTarget ? 'bold' : 'normal';
      let val = window.getCharMgmtStat(char.Character_ID, st.key);
      // Extract emoji from label
      let emoji = st.label.split(' ')[0];
      if (!['🎮', '💬', '🎤', '💋', '💡', '🔥'].includes(emoji)) {
          if (st.label.includes('게임')) emoji = '🎮';
          else if (st.label.includes('잡담')) emoji = '💬';
          else if (st.label.includes('노래')) emoji = '🎤';
          else if (st.label.includes('ASMR')) emoji = '💋';
          else if (st.label.includes('기획')) emoji = '💡';
          else if (st.label.includes('내구')) emoji = '🔥';
      }
      statsHtml += `<div style="color: ${sColor}; font-weight: ${sWeight}; font-size: 11px;">${emoji} ${val}</div>`;
  });
  statsHtml += `</div>`;
  
  // Passive info
  let passiveHtml = '';
  if (window.GameData.m_skill && char.Character_M_Skill) {
      const mSkill = window.GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill);
      if (mSkill) {
          const sRoom = mSkill.M_Skill_Target_Room;
          let isActive = (sRoom === 'ALL' || sRoom === targetRoomId);
          let pColor = isActive ? '#3498db' : '#95a5a6';
          let pName = mSkill.M_Skill_Name || char.Character_M_Skill;
          
          if (starVal < 2) {
              passiveHtml = `<div style="margin-top: 6px; border-top: 1px dashed #7f8c8d; padding-top: 4px; opacity: 0.5; filter: grayscale(100%);">
                  <div style="font-weight: bold; color: #e74c3c; font-size: 11px;">🔒 [미해금] ${pName} (★2 해금)</div>
                  <div style="font-size: 10px; color: #95a5a6; white-space: normal; margin-top: 1px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          } else {
              passiveHtml = `<div style="margin-top: 6px; border-top: 1px dashed #7f8c8d; padding-top: 4px;">
                  <div style="font-weight: bold; color: ${pColor}; font-size: 11px;">✨ ${pName}</div>
                  <div style="font-size: 10px; color: ${pColor}; white-space: normal; margin-top: 1px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          }
      }
  }

  ct.innerHTML = `
    <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #fff;">${char.Character_Name}</div>
    <div style="font-size: 12px; color: #bdc3c7;">등급: ${char.Character_Tier} | 성급: ${'★'.repeat(starVal)}</div>
    ${statsHtml}
    ${passiveHtml}
  `;
  ct.style.display = 'block';
};

window.hideRosterTooltip = function() {
  const ct = document.getElementById('roster-char-tooltip');
  if (ct) ct.style.display = 'none';
};
window.getCharMgmtStat = function(charId, statKey) {
    if (!window.GameData || !window.GameData.characters) return 0;
    const char = window.GameData.characters.find(c => c.Character_ID === charId);
    if (!char) return 0;
    
    let baseVal = parseInt(char[statKey], 10) || 0;
    if (baseVal === 0) return 0; // if 0, do not boost
    
    const pChar = (window.PlayerData && window.PlayerData.characterStats) ? window.PlayerData.characterStats[charId] : null;
    const starVal = pChar ? (pChar.star || 1) : (char.Character_Star || 1);
    
    if (starVal >= 3) {
        baseVal += 1;
    }
    return baseVal;
};

export function updateAPUI() {
    let maxAP = 120;
    if (window.GameData && window.GameData.levels && window.PlayerData) {
        const lvlData = window.GameData.levels.find(l => parseInt((l.Account_Level || l.Level || l['레벨'] || 1)) === (window.PlayerData.level || 1));
        if (lvlData && lvlData.Account_Max_AP) {
            maxAP = parseInt(lvlData.Account_Max_AP);
        }
    }

    if (!window.PlayerData) return;
    if (window.PlayerData.ap === undefined) window.PlayerData.ap = maxAP;
    
    const apTextEls = [document.getElementById("ap-text"), document.getElementById("rehearsal-ap-text")];
    const isFull = window.PlayerData.ap >= maxAP;
    apTextEls.forEach(apText => {
        if (apText) {
            apText.textContent = `${window.PlayerData.ap} / ${maxAP}`;
            if (isFull) {
                apText.classList.add('ap-full');
            } else {
                apText.classList.remove('ap-full');
            }
            const panel = apText.closest('.time-system-panel') || apText.parentElement;
            if (panel) {
                if (panel.style.position !== 'relative') panel.style.position = 'relative';
                toggleMenuRedDot(panel, isFull);
            }
        }
    });
}

export function updateAccountLevelUI() {
    if (!window.PlayerData) return;
    const lvl = window.PlayerData.level || 1;
    const exp = window.PlayerData.exp || 0;
    const maxLvl = window.GameData.levels ? window.GameData.levels.length : 100;
    
    let maxExp = 0;
    if (window.GameData.levels) {
        const lvlData = window.GameData.levels.find(l => parseInt((l.Account_Level || l.Level || l['레벨'] || 1)) === lvl + 1);
        if (lvlData) {
            maxExp = parseInt(String(lvlData.Account_Exp).replace(/,/g, '')) || 0;
        }
    }
    
    const lvlElem = document.getElementById("player-level-text");
    if (lvlElem) {
        lvlElem.textContent = lvl;
        const titleStr = maxExp > 0 ? `현재 경험치: ${exp} / ${maxExp}` : `현재 경험치: MAX`;
        lvlElem.title = titleStr;
        // Also apply to parent just in case
        if (lvlElem.parentElement) {
            lvlElem.parentElement.title = titleStr;
            lvlElem.parentElement.style.cursor = 'help';
        }
    }
}

export function addAccountExp(amount) {
    if (!window.PlayerData || !window.GameData.levels) return;
    if (window.PlayerData.level === undefined) window.PlayerData.level = 1;
    if (window.PlayerData.exp === undefined) window.PlayerData.exp = 0;
    
    window.PlayerData.exp += amount;
    
    let leveledUp = false;
    let newLevel = window.PlayerData.level;
    let rewards = {};
    let totalApGained = 0;
    
    while (true) {
        const nextLvlData = window.GameData.levels.find(l => parseInt((l.Account_Level || l.Level || l['레벨'] || 1)) === newLevel + 1);
        if (!nextLvlData) break; // Max level reached
        
        const reqExp = parseInt(String((nextLvlData.Account_Req_EXP || nextLvlData.Account_Exp || nextLvlData.Req_EXP || nextLvlData['요구경험치'])).replace(/,/g, '')) || 0;
        if (reqExp === 0) break; // Invalid exp
        
        if (window.PlayerData.exp >= reqExp) {
            // Level Up
            window.PlayerData.exp -= reqExp;
            newLevel++;
            leveledUp = true;
            
            // Accumulate rewards
            const rwdId = (nextLvlData.Account_Reward || nextLvlData.Reward || nextLvlData['보상ID']);
            const rwdVal = parseInt(String((nextLvlData.Account_Reward_Value || nextLvlData.Reward_Value || nextLvlData['보상수량'])).replace(/,/g, '')) || 0;
            const apVal = parseInt(String((nextLvlData.Account_Max_AP || nextLvlData.Max_AP || nextLvlData['최대AP'])).replace(/,/g, '')) || 120; // usually gives AP equal to Max AP
            
            totalApGained += apVal;
            if (rwdId && rwdVal > 0) {
                if (!rewards[rwdId]) rewards[rwdId] = 0;
                rewards[rwdId] += rwdVal;
                
                if (window.PlayerData.items[rwdId] === undefined) window.PlayerData.items[rwdId] = 0;
                window.PlayerData.items[rwdId] += rwdVal;
            }
        } else {
            break;
        }
    }
    
    if (leveledUp) {
        const oldLevel = window.PlayerData.level;
        window.PlayerData.level = newLevel;
        if (typeof window.savePlayerData === 'function') window.savePlayerData();
        if (window.PlayerData.ap === undefined) window.PlayerData.ap = 120;
        window.PlayerData.ap += totalApGained;
        
        if (typeof window.playAssetSound === 'function') {
            window.playAssetSound('asset_019');
        }
        
        
        let rewardValue = 0;
        let rwdId = 'Item_001';
        if (rewards['Item_001']) rewardValue = rewards['Item_001'];
        else {
            const keys = Object.keys(rewards);
            if(keys.length > 0) {
                rwdId = keys[0];
                rewardValue = rewards[rwdId];
            }
        }
        
        let newMaxAp = 120;
        const curLvlData = window.GameData.levels ? window.GameData.levels.find(l => parseInt(l.Account_Level || l.Level || l['레벨'] || 1) === newLevel) : null;
        if (curLvlData && (curLvlData.Account_Max_AP || curLvlData.Max_AP || curLvlData['최대AP'])) {
            newMaxAp = parseInt(curLvlData.Account_Max_AP || curLvlData.Max_AP || curLvlData['최대AP']);
        }

        const accModal = document.getElementById('account-levelup-modal');
        if (accModal) {
            const oldSpan = document.getElementById('account-levelup-old');
            const newSpan = document.getElementById('account-levelup-new');
            const rwdBox = document.getElementById('account-levelup-rewards');
            if (oldSpan) oldSpan.textContent = `Lv.${oldLevel}`;
            if (newSpan) newSpan.textContent = `Lv.${newLevel}`;
            if (rwdBox) {
                rwdBox.innerHTML = `
                    <div style="color: #3498db; margin-bottom: 6px;">최대 AP <span>${newMaxAp}</span></div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                        <img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/홀로다이아.png" style="width: 36px; height: 36px;">
                        <span style="color: #f1c40f; font-size: 1.5rem; font-weight: bold;">+${rewardValue}</span>
                    </div>
                `;
            }
            accModal.classList.add('show');
        }
        
        updateAPUI();
        updateTopCurrencies();
    }
    updateAccountLevelUI();
    if (typeof window.savePlayerData === 'function') window.savePlayerData();
}


export function showAccountCreationModal() {
    const modal = document.getElementById("account-creation-modal");
    const input = document.getElementById("input-account-name");
    const btn = document.getElementById("btn-confirm-account-name");
    
    if (!modal) return;
    
    input.value = "";
    modal.classList.add("show");
    
    btn.onclick = () => {
        let name = input.value.trim();
        if (!name) {
            alert("이름을 입력해주세요.");
            return;
        }
        
        let len = 0;
        for (let i = 0; i < name.length; i++) {
            if (escape(name.charAt(i)).length > 4) {
                len += 2; // Korean/CJK
            } else {
                len += 1;
            }
        }
        
        if (len > 20) {
            alert("이름이 너무 깁니다. (한글 최대 10자, 영문/숫자 최대 20자)");
            return;
        }
        
        PlayerData.name = name;
        
        // Generate UID: 1 uppercase letter + 7 digits
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const randomLetter = letters.charAt(Math.floor(Math.random() * letters.length));
        const timeSeedStr = Date.now().toString();
        const randomDigits = Math.floor(Math.random() * 9000000) + 1000000; // 7 digits
        
        // combine a bit to make it "random"
        let finalDigits = (randomDigits + parseInt(timeSeedStr.slice(-5))).toString().slice(-7);
        if (finalDigits.length < 7) finalDigits = finalDigits.padStart(7, '0');
        
        PlayerData.uid = randomLetter + finalDigits;
        
        modal.classList.remove("show");
        updatePlayerProfileUI();
    };
}

export function updatePlayerProfileUI() {
    const nameEl = document.getElementById("player-name-text");
    const uidEl = document.getElementById("player-uid-text");
    
    if (nameEl) nameEl.textContent = PlayerData.name || "CometP";
    if (uidEl) uidEl.textContent = "UID: " + (PlayerData.uid || "1234567");
    
    const lvlEl = document.getElementById("player-level-text");
    if (lvlEl) {
        lvlEl.style.pointerEvents = 'auto'; // ensure tooltip works
    }
}

window.openEnemyInfoModal = function(charId, level, star) {
    const char = (GameData.characters || GameData.character || []).find(c => c.Character_ID === charId);
    if (!char) return;
    
    // Set global so that modal can reference if needed
    currentCharInModal = char;
    
    // Open modal
    const modal = document.getElementById('char-info-modal');
    if(modal) modal.classList.add('show');
    
    // Update stats using existing function but with isMyChar=false
    updateCharInfoStats(char, level, star, false, true);
    
    // UI cleanups to make it look like an enemy stat view
    const tabsContainer = document.getElementById('char-info-tabs-container');
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.char-info-tab').forEach(t => t.classList.remove('active'));
        // visually, don't show "Max" or "My Char" as active, or maybe we just hide the tabs container?
        // Let's just leave them inactive.
    }
};

window.updateAPUI = updateAPUI;

/* =========================================================================
   Skill Mastery System (스킬 숙련 강화 시스템) - v0.004.244
   ========================================================================= */
export const SKILL_MASTERY_COSTS = [
  // 0 -> 1
  { soulQty: 1, matRarity: 1, matQty: 4, credit: 10000 },
  // 1 -> 2
  { soulQty: 2, matRarity: 1, matQty: 7, credit: 15000 },
  // 2 -> 3
  { soulQty: 3, matRarity: 2, matQty: 4, credit: 20000 },
  // 3 -> 4
  { soulQty: 5, matRarity: 2, matQty: 7, credit: 40000 },
  // 4 -> 5
  { soulQty: 6, matRarity: 3, matQty: 3, credit: 50000 },
  // 5 -> 6
  { soulQty: 7, matRarity: 3, matQty: 5, credit: 60000 },
  // 6 -> 7
  { soulQty: 10, matRarity: 3, matQty: 7, credit: 100000 }
];

export const ROLE_MATERIAL_MAP = {
  '근거리 딜러': { subType: '굿즈', 1: 'Item_035', 2: 'Item_034', 3: 'Item_033' },
  '원거리 딜러': { subType: '게임', 1: 'Item_038', 2: 'Item_037', 3: 'Item_036' },
  '마법 딜러': { subType: '앨범', 1: 'Item_026', 2: 'Item_025', 3: 'Item_024' },
  '탱커': { subType: '소재', 1: 'Item_023', 2: 'Item_022', 3: 'Item_021' },
  '암살자': { subType: '게임', 1: 'Item_038', 2: 'Item_037', 3: 'Item_036' },
  '버퍼': { subType: '화보', 1: 'Item_029', 2: 'Item_028', 3: 'Item_027' },
  '디버퍼': { subType: '앨범', 1: 'Item_026', 2: 'Item_025', 3: 'Item_024' },
  '힐러': { subType: '클립', 1: 'Item_032', 2: 'Item_031', 3: 'Item_030' },
  // Fallbacks
  'MELEE_DPS': { subType: '굿즈', 1: 'Item_035', 2: 'Item_034', 3: 'Item_033' },
  'RANGED_DPS': { subType: '게임', 1: 'Item_038', 2: 'Item_037', 3: 'Item_036' },
  'MAGIC_DPS': { subType: '앨범', 1: 'Item_026', 2: 'Item_025', 3: 'Item_024' },
  'TANK': { subType: '소재', 1: 'Item_023', 2: 'Item_022', 3: 'Item_021' },
  'ASSASSIN': { subType: '게임', 1: 'Item_038', 2: 'Item_037', 3: 'Item_036' },
  'BUFFER': { subType: '화보', 1: 'Item_029', 2: 'Item_028', 3: 'Item_027' },
  'DEBUFFER': { subType: '앨범', 1: 'Item_026', 2: 'Item_025', 3: 'Item_024' },
  'HEALER': { subType: '클립', 1: 'Item_032', 2: 'Item_031', 3: 'Item_030' }
};

export const SKILL_MASTERY_BONUS = {
  A: {
    0: { mult: 0, oh: 0 },
    1: { mult: 3, oh: 0 },
    2: { mult: 6, oh: 0 },
    3: { mult: 6, oh: -5 },
    4: { mult: 9, oh: -5 },
    5: { mult: 12, oh: -5 },
    6: { mult: 12, oh: -10 },
    7: { mult: 20, oh: -10 }
  },
  B: {
    0: { mult: 0, oh: 0 },
    1: { mult: 1, oh: 0 },
    2: { mult: 2, oh: 0 },
    3: { mult: 2, oh: -5 },
    4: { mult: 3, oh: -5 },
    5: { mult: 4, oh: -5 },
    6: { mult: 4, oh: -10 },
    7: { mult: 10, oh: -10 }
  },
  C: {
    0: { mult: 0, oh: 0 },
    1: { mult: 0, oh: -2 },
    2: { mult: 0, oh: -4 },
    3: { mult: 0, oh: -9 },
    4: { mult: 0, oh: -11 },
    5: { mult: 0, oh: -13 },
    6: { mult: 0, oh: -18 },
    7: { mult: 0, oh: -25 }
  }
};

let activeMasteryChar = null;
let activeMasteryTab = 'SS'; // 'SS' or 'AS'

function showMasteryToast(msg) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(30,39,46,0.95); color: #f1c40f; padding: 12px 24px; border-radius: 20px; font-weight: bold; z-index: 10005; pointer-events: none; border: 1px solid #f1c40f; box-shadow: 0 4px 14px rgba(0,0,0,0.5); font-size: 1rem;";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function formatMasteryBonusText(bonus, skillObj = null) {
  if (!bonus || (!bonus.mult && !bonus.oh)) return '기본 상태 (보너스 없음)';
  const parts = [];
  if (bonus.mult) {
    let multLabel = '피해 배율';
    if (skillObj) {
      const tags = String(skillObj.Skill_Tags || '');
      const desc = String(skillObj.Skill_Desc || '');
      const hasHeal = tags.includes('회복') || desc.includes('회복') || desc.includes('체력');
      const hasShield = tags.includes('보호막') || desc.includes('보호막');
      const hasDmg = tags.includes('피해') || desc.includes('피해') || desc.includes('공격');

      if (hasHeal && hasShield && !hasDmg) {
        multLabel = '회복/보호막 배율';
      } else if (hasHeal && !hasDmg) {
        multLabel = '회복 배율';
      } else if (hasShield && !hasDmg) {
        multLabel = '보호막 배율';
      } else if (hasHeal && hasDmg) {
        multLabel = '피해/회복 배율';
      } else if (hasShield && hasDmg) {
        multLabel = '피해/보호막 배율';
      } else {
        multLabel = '피해 배율';
      }
    }
    parts.push(`${multLabel} +${bonus.mult}%`);
  }
  if (bonus.oh) parts.push(`오버히트 ${bonus.oh}`);
  return parts.join(', ');
}

function getItemData(itemId) {
  const item = (GameData.items || []).find(i => i.Item_ID === itemId);
  return {
    id: itemId,
    name: item ? item.Item_Name : itemId,
    icon: item && item.Item_Icon ? item.Item_Icon : `https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/${itemId}.png`,
    rarity: item ? item.Item_Rarity : 1
  };
}

export function openSkillMasteryModal(char) {
  if (!char) return;
  const charStats = (PlayerData && PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) || {};
  const star = charStats.star || char.star || 1;
  if (star < 2) {
    alert('스킬 숙련은 ★2 이상 달성한 캐릭터만 이용할 수 있습니다.');
    return;
  }
  activeMasteryChar = char;
  activeMasteryTab = 'SS';

  const modal = document.getElementById('skill-mastery-modal');
  if (!modal) return;

  modal.classList.add('show');
  bindSkillMasteryModalEvents();
  renderSkillMasteryModalContent();
}

function bindSkillMasteryModalEvents() {
  const modal = document.getElementById('skill-mastery-modal');
  if (!modal || modal._masteryEventsBound) return;
  modal._masteryEventsBound = true;

  const btnClose = document.getElementById('btn-skill-mastery-close');
  if (btnClose) {
    btnClose.onclick = () => closeSkillMasteryModal();
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSkillMasteryModal();
  });

  const tabSS = document.getElementById('tab-mastery-ss');
  const tabAS = document.getElementById('tab-mastery-as');

  if (tabSS) {
    tabSS.onclick = () => {
      activeMasteryTab = 'SS';
      renderSkillMasteryModalContent();
    };
  }

  if (tabAS) {
    tabAS.onclick = () => {
      activeMasteryTab = 'AS';
      renderSkillMasteryModalContent();
    };
  }

  const btnUpgrade = document.getElementById('btn-mastery-do-upgrade');
  if (btnUpgrade) {
    btnUpgrade.onclick = () => handleSkillMasteryUpgrade();
  }
}

export function closeSkillMasteryModal() {
  const modal = document.getElementById('skill-mastery-modal');
  if (modal) modal.classList.remove('show');
}

function renderSkillMasteryModalContent() {
  if (!activeMasteryChar) return;
  const char = activeMasteryChar;
  const charStats = (PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) || {};

  // Tabs
  const tabSS = document.getElementById('tab-mastery-ss');
  const tabAS = document.getElementById('tab-mastery-as');
  if (tabSS) tabSS.classList.toggle('active', activeMasteryTab === 'SS');
  if (tabAS) tabAS.classList.toggle('active', activeMasteryTab === 'AS');

  // Skill resolution
  const skillId = activeMasteryTab === 'SS' ? char.Character_SS : char.Character_AS;
  const allSkills = GameData.skills || [];
  const skillObj = allSkills.find(s => s.Skill_ID === skillId) || {
    Skill_ID: skillId,
    Skill_Name: activeMasteryTab === 'SS' ? '고유기' : '궁극기',
    Skill_Desc: '스킬 정보를 불러올 수 없습니다.',
    Skill_Master: 'A'
  };

  const rawMasterType = (skillObj.Skill_Master || 'A').trim().toUpperCase();
  const masterType = (rawMasterType === 'B' || rawMasterType === 'C') ? rawMasterType : 'A';

  // Mastery level
  const rawMastery = charStats.skillMastery;
  const currentLevel = (rawMastery && typeof rawMastery === 'object')
    ? (rawMastery[activeMasteryTab] || 0)
    : (typeof rawMastery === 'number' && activeMasteryTab === 'SS' ? rawMastery : 0);

  // Skill Name & Type badge
  const nameEl = document.getElementById('mastery-skill-name');
  if (nameEl) nameEl.textContent = `${skillObj.Skill_Name || skillId}`;

  const typeBadgeEl = document.getElementById('mastery-skill-type-badge');
  if (typeBadgeEl) {
    typeBadgeEl.textContent = `타입 ${masterType}`;
    if (masterType === 'A') typeBadgeEl.style.background = '#e74c3c';
    else if (masterType === 'B') typeBadgeEl.style.background = '#3498db';
    else typeBadgeEl.style.background = '#2ecc71';
  }

  // Skill Description
  const descEl = document.getElementById('mastery-skill-desc');
  if (descEl) descEl.innerHTML = (skillObj.Skill_Desc || '').replace(/\\n/g, '<br>');

  // Level & Stepper
  const lvlTextEl = document.getElementById('mastery-level-text');
  if (lvlTextEl) lvlTextEl.textContent = `Lv. ${currentLevel} / 7`;

  const stepper = document.getElementById('mastery-stepper');
  if (stepper) {
    stepper.querySelectorAll('.skill-mastery-step').forEach(stepEl => {
      const stepIdx = parseInt(stepEl.dataset.step, 10);
      stepEl.className = 'skill-mastery-step';
      if (stepIdx <= currentLevel) {
        stepEl.classList.add('filled');
      }
    });
  }

  // Effects preview
  const table = SKILL_MASTERY_BONUS[masterType] || SKILL_MASTERY_BONUS.A;
  const curBonus = table[currentLevel] || { mult: 0, oh: 0 };
  const curEffectEl = document.getElementById('mastery-cur-effect');
  if (curEffectEl) curEffectEl.textContent = formatMasteryBonusText(curBonus, skillObj);

  const nextEffectEl = document.getElementById('mastery-next-effect');
  if (nextEffectEl) {
    if (currentLevel >= 7) {
      nextEffectEl.textContent = '최대 레벨 달성';
      nextEffectEl.style.color = '#f1c40f';
    } else {
      const nextBonus = table[currentLevel + 1] || { mult: 0, oh: 0 };
      nextEffectEl.textContent = formatMasteryBonusText(nextBonus, skillObj);
      nextEffectEl.style.color = '#2ecc71';
    }
  }

  // Materials & Cost Grid
  const matsContainer = document.getElementById('mastery-mats-container');
  const btnUpgrade = document.getElementById('btn-mastery-do-upgrade');

  if (currentLevel >= 7) {
    if (matsContainer) {
      matsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #f1c40f; font-weight: bold; background: rgba(0,0,0,0.35); border-radius: 8px; border: 1px solid rgba(241,196,15,0.3);">
          🎉 최고 숙련도 단계 (Lv. 7)에 도달했습니다!
        </div>
      `;
    }
    if (btnUpgrade) {
      btnUpgrade.disabled = true;
      btnUpgrade.textContent = '최대 레벨 도달';
    }
    return;
  }

  const cost = SKILL_MASTERY_COSTS[currentLevel];
  const role = char.Character_Role || '근거리 딜러';
  const roleMatMap = ROLE_MATERIAL_MAP[role] || ROLE_MATERIAL_MAP['근거리 딜러'];
  const matId = roleMatMap[cost.matRarity] || 'Item_035';

  const soulItem = getItemData('Item_009');
  const roleItem = getItemData(matId);
  const creditItem = getItemData('Item_002');

  const mySoul = PlayerData.items['Item_009'] || 0;
  const myMat = PlayerData.items[matId] || 0;
  const myCredit = PlayerData.items['Item_002'] || 0;

  const hasSoul = mySoul >= cost.soulQty;
  const hasMat = myMat >= cost.matQty;
  const hasCredit = myCredit >= cost.credit;
  const canUpgrade = hasSoul && hasMat && hasCredit;

  if (matsContainer) {
    matsContainer.innerHTML = `
      <div class="mastery-mat-card">
        <img src="${soulItem.icon}" alt="${soulItem.name}" class="mastery-item-icon" onerror="this.src='https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Item_009.png'"/>
        <div class="mastery-item-name" title="${soulItem.name}">${soulItem.name}</div>
        <div class="mastery-item-qty ${hasSoul ? 'ok' : 'short'}">${mySoul.toLocaleString()} / ${cost.soulQty}</div>
      </div>
      <div class="mastery-mat-card">
        <img src="${roleItem.icon}" alt="${roleItem.name}" class="mastery-item-icon" onerror="this.src='https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/${matId}.png'"/>
        <div class="mastery-item-name" title="${roleItem.name}">${roleItem.name} (R${cost.matRarity})</div>
        <div class="mastery-item-qty ${hasMat ? 'ok' : 'short'}">${myMat.toLocaleString()} / ${cost.matQty}</div>
      </div>
      <div class="mastery-mat-card">
        <img src="${creditItem.icon}" alt="${creditItem.name}" class="mastery-item-icon" onerror="this.src='https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Item_002.png'"/>
        <div class="mastery-item-name" title="${creditItem.name}">${creditItem.name}</div>
        <div class="mastery-item-qty ${hasCredit ? 'ok' : 'short'}">${myCredit.toLocaleString()} / ${cost.credit.toLocaleString()}</div>
      </div>
    `;
  }

  if (btnUpgrade) {
    btnUpgrade.disabled = !canUpgrade;
    if (!canUpgrade) {
      btnUpgrade.textContent = '강화 재료 부족';
    } else {
      btnUpgrade.textContent = `스킬 숙련 강화 (Lv. ${currentLevel} → ${currentLevel + 1})`;
    }
  }
}

function handleSkillMasteryUpgrade() {
  if (!activeMasteryChar) return;
  const char = activeMasteryChar;
  const charStats = (PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]) || null;
  if (!charStats) {
    alert('보유 중인 캐릭터만 스킬 숙련을 진행할 수 있습니다.');
    return;
  }

  if (!charStats.skillMastery || typeof charStats.skillMastery !== 'object') {
    const oldVal = typeof charStats.skillMastery === 'number' ? charStats.skillMastery : 0;
    charStats.skillMastery = { SS: oldVal, AS: 0 };
  }

  const currentLevel = charStats.skillMastery[activeMasteryTab] || 0;
  if (currentLevel >= 7) {
    alert('이미 최고 숙련도 단계(Lv. 7)에 도달했습니다.');
    return;
  }

  const cost = SKILL_MASTERY_COSTS[currentLevel];
  const role = char.Character_Role || '근거리 딜러';
  const roleMatMap = ROLE_MATERIAL_MAP[role] || ROLE_MATERIAL_MAP['근거리 딜러'];
  const matId = roleMatMap[cost.matRarity] || 'Item_035';

  const mySoul = PlayerData.items['Item_009'] || 0;
  const myMat = PlayerData.items[matId] || 0;
  const myCredit = PlayerData.items['Item_002'] || 0;

  if (mySoul < cost.soulQty || myMat < cost.matQty || myCredit < cost.credit) {
    alert('강화에 필요한 재료 또는 크레딧이 부족합니다.');
    return;
  }

  // Deduct resources
  PlayerData.items['Item_009'] -= cost.soulQty;
  PlayerData.items[matId] -= cost.matQty;
  PlayerData.items['Item_002'] -= cost.credit;

  // Level up
  charStats.skillMastery[activeMasteryTab] = currentLevel + 1;

  if (window.savePlayerData) {
    window.savePlayerData();
  }

  // Trigger sound effect if available
  if (typeof playSound === 'function') {
    try { playSound('levelup'); } catch (e) {}
  }

  const tabName = activeMasteryTab === 'SS' ? '고유기' : '궁극기';
  showMasteryToast(`[${char.Character_Name}] ${tabName} 숙련도 Lv. ${charStats.skillMastery[activeMasteryTab]} 강화 성공!`);

  // Re-render mastery modal
  renderSkillMasteryModalContent();

  // Re-render character modal skills view
  renderCombatSkillsUI(char, charStats.star || 1, true);
}

window.openSkillMasteryModal = openSkillMasteryModal;
window.closeSkillMasteryModal = closeSkillMasteryModal;

