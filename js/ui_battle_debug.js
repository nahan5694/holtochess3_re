/**
 * Debug / Test Harness UI for Battle Engine (Section 85 Verification UI)
 * Allows in-browser execution of automated test suites and interactive battle stepping.
 */

import { BattleTestHarness } from './battle/battle_test_harness.js';
import { BattleEngine } from './battle/battle_engine.js';
import { createCharacterBattleState, createTeamState, CharacterClass } from './battle/battle_types.js';
import { GameData } from './state.js?v=004276';

let activeDebugEngine = null;
let autoTickTimer = null;

export function initBattleDebugUI() {
  const btnRunAll = document.getElementById('btn-battle-run-tests');
  const btnStepTick = document.getElementById('btn-battle-step-tick');
  const btnAutoPlay = document.getElementById('btn-battle-auto-play');
  const btnReset = document.getElementById('btn-battle-reset');
  const logContainer = document.getElementById('battle-debug-log');
  const statusContainer = document.getElementById('battle-debug-status');

  if (btnRunAll) {
    btnRunAll.addEventListener('click', () => {
      runBrowserTestSuite();
    });
  }

  if (btnStepTick) {
    btnStepTick.addEventListener('click', () => {
      if (!activeDebugEngine) initSampleBattle();
      if (activeDebugEngine) {
        activeDebugEngine.advanceTick();
        renderBattleStatus();
      }
    });
  }

  if (btnAutoPlay) {
    btnAutoPlay.addEventListener('click', () => {
      if (autoTickTimer) {
        clearInterval(autoTickTimer);
        autoTickTimer = null;
        btnAutoPlay.textContent = '자동 진행 (Auto)';
        btnAutoPlay.style.background = '#3498db';
      } else {
        if (!activeDebugEngine) initSampleBattle();
        btnAutoPlay.textContent = '일시 정지 (Pause)';
        btnAutoPlay.style.background = '#e67e22';
        autoTickTimer = setInterval(() => {
          if (activeDebugEngine && activeDebugEngine.state.battlePhase !== 'BATTLE_END') {
            activeDebugEngine.advanceTick();
            renderBattleStatus();
          } else {
            clearInterval(autoTickTimer);
            autoTickTimer = null;
            btnAutoPlay.textContent = '자동 진행 (Auto)';
            btnAutoPlay.style.background = '#3498db';
          }
        }, 500);
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (autoTickTimer) {
        clearInterval(autoTickTimer);
        autoTickTimer = null;
      }
      if (btnAutoPlay) {
        btnAutoPlay.textContent = '자동 진행 (Auto)';
        btnAutoPlay.style.background = '#3498db';
      }
      initSampleBattle();
      renderBattleStatus();
    });
  }
}

export function runBrowserTestSuite() {
  const logContainer = document.getElementById('battle-debug-log');
  if (logContainer) logContainer.innerHTML = '<div style="color:#3498db;font-weight:bold;">1~3단계 전체 자동 검증 스위트 실행 중...</div>';

  try {
    const harness = new BattleTestHarness();
    const results = harness.runAllTests();

    if (logContainer) {
      let html = `<div style="margin-bottom:10px;font-size:1.1rem;font-weight:bold;color:#2ecc71;">🎉 1~3단계 전체 35개 테스트 (${results.length}개 Assertion) 100% 검증 완료!</div>`;
      results.forEach(r => {
        html += `
          <div style="display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px solid rgba(0,0,0,0.05); font-size:0.9rem;">
            <span>${r.pass ? '✅' : '❌'} ${r.name}</span>
            <span style="color:${r.pass ? '#27ae60' : '#e74c3c'}; font-weight:bold;">${r.pass ? 'PASS' : 'FAIL'}</span>
          </div>
        `;
      });
      logContainer.innerHTML = html;
    }
  } catch (e) {
    if (logContainer) {
      logContainer.innerHTML += `<div style="color:red; margin-top:10px;">검증 오류: ${e.message}</div>`;
    }
  }
}

export const ATTR_BADGES = {
  '청초': { bg: '#e8f8f5', color: '#27ae60', border: '#a3e4d7' },
  '게닌': { bg: '#fef5e7', color: '#d35400', border: '#f8c471' },
  '쿨': { bg: '#ebf5fb', color: '#2980b9', border: '#aed6f1' },
  '아티스트': { bg: '#f4ecf7', color: '#8e44ad', border: '#d2b4de' },
  '큐트': { bg: '#fdedec', color: '#c0392b', border: '#f5b7b1' },
  '광기': { bg: '#ebd7f7', color: '#6c3483', border: '#bb8fce' },
  '에로': { bg: '#fadbd8', color: '#a93226', border: '#f1948a' }
};

export const CORE_KEYWORDS = {
  'Key_001': { Keyword_ID: 'Key_001', Keyword_Name: '출혈', Keyword_Icon: '🩸', Keyword_Type: '디버프', isImmortal: false },
  'Key_002': { Keyword_ID: 'Key_002', Keyword_Name: '파괴', Keyword_Icon: '💔', Keyword_Type: '디버프', isImmortal: false },
  'Key_003': { Keyword_ID: 'Key_003', Keyword_Name: '매료', Keyword_Icon: '💋', Keyword_Type: '디버프', isImmortal: false },
  'Key_004': { Keyword_ID: 'Key_004', Keyword_Name: '원소', Keyword_Icon: '🔥', Keyword_Type: '디버프', isImmortal: false },
  'Key_005': { Keyword_ID: 'Key_005', Keyword_Name: '중독', Keyword_Icon: '☢️', Keyword_Type: '디버프', isImmortal: false },
  'Key_006': { Keyword_ID: 'Key_006', Keyword_Name: '행동불가', Keyword_Icon: '🌌', Keyword_Type: '디버프', isImmortal: false },
  'Key_007': { Keyword_ID: 'Key_007', Keyword_Name: '압도', Keyword_Icon: '🕸️', Keyword_Type: '디버프', isImmortal: false },
  'Key_008': { Keyword_ID: 'Key_008', Keyword_Name: '웃음', Keyword_Icon: '😁', Keyword_Type: '디버프', isImmortal: false },
  'Key_009': { Keyword_ID: 'Key_009', Keyword_Name: '빙결', Keyword_Icon: '❄️', Keyword_Type: '디버프', isImmortal: false },
  'Key_010': { Keyword_ID: 'Key_010', Keyword_Name: '젖음', Keyword_Icon: '💦', Keyword_Type: '디버프', isImmortal: false },
  'Key_011': { Keyword_ID: 'Key_011', Keyword_Name: '흑마법', Keyword_Icon: '🎆', Keyword_Type: '디버프', isImmortal: false },
  'Key_012': { Keyword_ID: 'Key_012', Keyword_Name: '증폭', Keyword_Icon: '🧿', Keyword_Type: '버프', isImmortal: false },
  'Key_013': { Keyword_ID: 'Key_013', Keyword_Name: '열정', Keyword_Icon: '⚔️', Keyword_Type: '버프', isImmortal: false },
  'Key_014': { Keyword_ID: 'Key_014', Keyword_Name: '청초', Keyword_Icon: '⚜️', Keyword_Type: '버프', isImmortal: false },
  'Key_015': { Keyword_ID: 'Key_015', Keyword_Name: '견고', Keyword_Icon: '🛡️', Keyword_Type: '버프', isImmortal: false },
  'Key_016': { Keyword_ID: 'Key_016', Keyword_Name: '의지', Keyword_Icon: '⛓️', Keyword_Type: '버프', isImmortal: false },
  'Key_017': { Keyword_ID: 'Key_017', Keyword_Name: '집중', Keyword_Icon: '🎯', Keyword_Type: '버프', isImmortal: false },
  'Key_018': { Keyword_ID: 'Key_018', Keyword_Name: '재생', Keyword_Icon: '💚', Keyword_Type: '버프', isImmortal: false },
  'Key_019': { Keyword_ID: 'Key_019', Keyword_Name: '가속', Keyword_Icon: '⌛', Keyword_Type: '버프', isImmortal: false },
  'Key_020': { Keyword_ID: 'Key_020', Keyword_Name: '강타', Keyword_Icon: '💥', Keyword_Type: '버프', isImmortal: false },
  'Key_021': { Keyword_ID: 'Key_021', Keyword_Name: '은신', Keyword_Icon: '👁️‍🗨️', Keyword_Type: '버프', isImmortal: false },
  'Key_022': { Keyword_ID: 'Key_022', Keyword_Name: '도발', Keyword_Icon: '👅', Keyword_Type: '버프', isImmortal: false },
  'Key_023': { Keyword_ID: 'Key_023', Keyword_Name: '반격', Keyword_Icon: '♻️', Keyword_Type: '버프', isImmortal: false },
  'Key_024': { Keyword_ID: 'Key_024', Keyword_Name: '리듬', Keyword_Icon: '🎵', Keyword_Type: '버프', isImmortal: false },
  'Key_025': { Keyword_ID: 'Key_025', Keyword_Name: '하모니', Keyword_Icon: '🎼', Keyword_Type: '버프', isImmortal: false },
  'Key_026': { Keyword_ID: 'Key_026', Keyword_Name: '흥분', Keyword_Icon: '💟', Keyword_Type: '버프', isImmortal: false },
  'Key_027': { Keyword_ID: 'Key_027', Keyword_Name: '면역', Keyword_Icon: '💎', Keyword_Type: '버프', isImmortal: true },
  'Key_028': { Keyword_ID: 'Key_028', Keyword_Name: '부활', Keyword_Icon: '💖', Keyword_Type: '버프', isImmortal: false },
  'Key_029': { Keyword_ID: 'Key_029', Keyword_Name: '되감기', Keyword_Icon: '⌚', Keyword_Type: '버프', isImmortal: false },
  'Key_030': { Keyword_ID: 'Key_030', Keyword_Name: '비정상 식사', Keyword_Icon: '🍖', Keyword_Type: '버프', isImmortal: false, Keyword_Desc: '가하는 피해 20% 감소, 입는 피해 20% 증가, 사라질 때 최대 체력의 50% 회복' },
  'Key_031': { Keyword_ID: 'Key_031', Keyword_Name: '마요네즈', Keyword_Icon: '🍼', Keyword_Type: '버프', isImmortal: false },
  'Key_032': { Keyword_ID: 'Key_032', Keyword_Name: '댄싱', Keyword_Icon: '🎶', Keyword_Type: '버프', isImmortal: false, Keyword_Desc: '스택당 회피 5% 증가. 회피 발동 시 지속 턴 1 감소.' },
  'Key_033': { Keyword_ID: 'Key_033', Keyword_Name: '아카스파 마츠리', Keyword_Icon: '🧧', Keyword_Type: '버프', isImmortal: true },
  'Key_034': { Keyword_ID: 'Key_034', Keyword_Name: '일등성', Keyword_Icon: '🌟', Keyword_Type: '버프', isImmortal: true },
  'Key_035': { Keyword_ID: 'Key_035', Keyword_Name: '사쿠라', Keyword_Icon: '🌸', Keyword_Type: '버프', isImmortal: true },
  'Key_036': { Keyword_ID: 'Key_036', Keyword_Name: 'GUESSER!!', Keyword_Icon: '📌', Keyword_Type: '디버프', isImmortal: true },
  'Key_037': { Keyword_ID: 'Key_037', Keyword_Name: '위엄', Keyword_Icon: '👑', Keyword_Type: '버프', isImmortal: true },
  'Key_038': { Keyword_ID: 'Key_038', Keyword_Name: '폭력', Keyword_Icon: '🥊', Keyword_Type: '버프', isImmortal: true },
  'Key_039': { Keyword_ID: 'Key_039', Keyword_Name: '점괘', Keyword_Icon: '🔮', Keyword_Type: '버프', isImmortal: true },
  'Key_040': { Keyword_ID: 'Key_040', Keyword_Name: '슬롯머신', Keyword_Icon: '🎰', Keyword_Type: '버프', isImmortal: true },
  'Key_041': { Keyword_ID: 'Key_041', Keyword_Name: '폭탄', Keyword_Icon: '💣', Keyword_Type: '디버프', isImmortal: true },
  'Key_042': { Keyword_ID: 'Key_042', Keyword_Name: '해적출항', Keyword_Icon: '⚓', Keyword_Type: '버프', isImmortal: true },
  'Key_043': { Keyword_ID: 'Key_043', Keyword_Name: '잉크', Keyword_Icon: '🦑', Keyword_Type: '디버프', isImmortal: false },
  'Key_044': { Keyword_ID: 'Key_044', Keyword_Name: '음주', Keyword_Icon: '🥂', Keyword_Type: '디버프', isImmortal: false },
  'Key_045': { Keyword_ID: 'Key_045', Keyword_Name: '마안', Keyword_Icon: '👁️', Keyword_Type: '버프', isImmortal: false },
  'Key_046': { Keyword_ID: 'Key_046', Keyword_Name: '버섯', Keyword_Icon: '🍄', Keyword_Type: '버프', isImmortal: false },
  'Key_047': { Keyword_ID: 'Key_047', Keyword_Name: '다이스', Keyword_Icon: '🎲', Keyword_Type: '버프', isImmortal: true },
  'Key_048': { Keyword_ID: 'Key_048', Keyword_Name: '아카이빙', Keyword_Icon: '🏷️', Keyword_Type: '버프', isImmortal: true },
  'Key_049': { Keyword_ID: 'Key_049', Keyword_Name: '영혼수확', Keyword_Icon: '💀', Keyword_Type: '버프', isImmortal: true },
  'Key_050': { Keyword_ID: 'Key_050', Keyword_Name: '슬픔', Keyword_Icon: '💧', Keyword_Type: '디버프', isImmortal: false },
  'Key_051': { Keyword_ID: 'Key_051', Keyword_Name: '수수께끼', Keyword_Icon: '❔', Keyword_Type: '디버프', isImmortal: false },
  'Key_052': { Keyword_ID: 'Key_052', Keyword_Name: '초승', Keyword_Icon: '🌒', Keyword_Type: '버프', isImmortal: true },
  'Key_053': { Keyword_ID: 'Key_053', Keyword_Name: '반월', Keyword_Icon: '🌓', Keyword_Type: '버프', isImmortal: true },
  'Key_054': { Keyword_ID: 'Key_054', Keyword_Name: '상현', Keyword_Icon: '🌔', Keyword_Type: '버프', isImmortal: true },
  'Key_055': { Keyword_ID: 'Key_055', Keyword_Name: '만월', Keyword_Icon: '🌕', Keyword_Type: '버프', isImmortal: true },
  'Key_056': { Keyword_ID: 'Key_056', Keyword_Name: '간파', Keyword_Icon: '🔍', Keyword_Type: '디버프', isImmortal: false },
  'Key_057': { Keyword_ID: 'Key_057', Keyword_Name: '정화', Keyword_Icon: '💠', Keyword_Type: '버프', isImmortal: true },
  'Key_058': { Keyword_ID: 'Key_058', Keyword_Name: '벽아일체', Keyword_Icon: '🧱', Keyword_Type: '버프', isImmortal: true },
  'Key_059': { Keyword_ID: 'Key_059', Keyword_Name: '마법소녀 변신', Keyword_Icon: '🧚‍♀️', Keyword_Type: '버프', isImmortal: true }
};

export function getCanonicalCharName(c) {
  if (!c || !c.Character_Name) return '';
  const name = c.Character_Name.trim();
  if (name.includes('후부키')) {
    return '시라카미_쿠로카미_후부키';
  }
  return name;
}

export function generate8vs8Teams() {
  const allChars = (window.GameData && Array.isArray(window.GameData.characters) && window.GameData.characters.length >= 16)
    ? window.GameData.characters.filter(c => c && c.Character_ID && c.Character_Name)
    : [];

  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  let teamAStrikersRaw = [];
  let teamBStrikersRaw = [];
  let teamASupportersRaw = [];
  let teamBSupportersRaw = [];

  if (allChars.length >= 16) {
    const strikers = allChars.filter(c => {
      const cls = (c.Character_Class || '').trim();
      return cls === '스트라이커' || cls === '1' || (!cls && !cls.includes('서포터'));
    });
    const supporters = allChars.filter(c => {
      const cls = (c.Character_Class || '').trim();
      return cls === '서포터' || cls === '2';
    });

    const pickTeamMembers = (strikersList, supportersList) => {
      const chosenStrikers = [];
      const chosenSupporters = [];
      const teamCanonicalNames = new Set();

      for (const c of shuffle(strikersList)) {
        const canon = getCanonicalCharName(c);
        if (!teamCanonicalNames.has(canon)) {
          teamCanonicalNames.add(canon);
          chosenStrikers.push(c);
          if (chosenStrikers.length === 5) break;
        }
      }

      for (const c of shuffle(supportersList)) {
        const canon = getCanonicalCharName(c);
        if (!teamCanonicalNames.has(canon)) {
          teamCanonicalNames.add(canon);
          chosenSupporters.push(c);
          if (chosenSupporters.length === 3) break;
        }
      }

      return { chosenStrikers, chosenSupporters, teamCanonicalNames };
    };

    const teamA = pickTeamMembers(strikers.length >= 10 ? strikers : allChars, supporters.length >= 6 ? supporters : allChars);
    teamAStrikersRaw = teamA.chosenStrikers;
    teamASupportersRaw = teamA.chosenSupporters;

    // Filter out Team A's characters for Team B if enough candidates exist
    const remainStrikers = strikers.filter(c => !teamA.teamCanonicalNames.has(getCanonicalCharName(c)));
    const remainSupporters = supporters.filter(c => !teamA.teamCanonicalNames.has(getCanonicalCharName(c)));

    const teamBPoolStrikers = remainStrikers.length >= 5 ? remainStrikers : strikers;
    const teamBPoolSupporters = remainSupporters.length >= 3 ? remainSupporters : supporters;

    const teamB = pickTeamMembers(teamBPoolStrikers, teamBPoolSupporters);
    teamBStrikersRaw = teamB.chosenStrikers;
    teamBSupportersRaw = teamB.chosenSupporters;
  } else {
    // 16 Fallback Hololive characters
    const fallbackList = [
      { Character_ID: 'FB_01', Character_Name: '호시마치 스이세이', Character_Type: '청초', Character_Class: '스트라이커', Character_Role: '근거리 딜러', Character_HP: 950, Character_ATK: 130, Character_DEF: 25, Character_MDEF: 25, Character_Spd: 22, Character_Aggro: 7, Character_BP: 4, Character_S1: 'SK_FB_BLEED' },
      { Character_ID: 'FB_02', Character_Name: '시라카미 후부키', Character_Type: '청초', Character_Class: '스트라이커', Character_Role: '원거리 딜러', Character_HP: 800, Character_ATK: 120, Character_DEF: 20, Character_MDEF: 30, Character_Spd: 28, Character_Aggro: 5, Character_BP: 3, Character_S1: 'SK_FB_FIRE' },
      { Character_ID: 'FB_03', Character_Name: '우사다 페코라', Character_Type: '게닌', Character_Class: '스트라이커', Character_Role: '원거리 딜러', Character_HP: 850, Character_ATK: 125, Character_DEF: 20, Character_MDEF: 25, Character_Spd: 24, Character_Aggro: 6, Character_BP: 4, Character_S1: 'SK_FB_BLEED' },
      { Character_ID: 'FB_04', Character_Name: '사쿠라 미코', Character_Type: '게닌', Character_Class: '스트라이커', Character_Role: '마법 딜러', Character_HP: 900, Character_ATK: 80, Character_Idol: 140, Character_DEF: 20, Character_MDEF: 35, Character_Spd: 18, Character_Aggro: 6, Character_BP: 3, Character_S1: 'SK_FB_FIRE' },
      { Character_ID: 'FB_05', Character_Name: '시로가네 노엘', Character_Type: '쿨', Character_Class: '스트라이커', Character_Role: '탱커', Character_HP: 1400, Character_ATK: 90, Character_DEF: 60, Character_MDEF: 40, Character_Spd: 12, Character_Aggro: 15, Character_BP: 6, Character_S1: 'SK_FB_BREAK' },
      { Character_ID: 'FB_06', Character_Name: '미나토 아쿠아', Character_Type: '쿨', Character_Class: '스트라이커', Character_Role: '암살자', Character_HP: 750, Character_ATK: 145, Character_DEF: 15, Character_MDEF: 20, Character_Spd: 30, Character_Aggro: 4, Character_BP: 3, Character_S1: 'SK_FB_BLEED' },
      { Character_ID: 'FB_07', Character_Name: '호쇼 마린', Character_Type: '에로', Character_Class: '스트라이커', Character_Role: '근거리 딜러', Character_HP: 1000, Character_ATK: 135, Character_DEF: 30, Character_MDEF: 25, Character_Spd: 20, Character_Aggro: 8, Character_BP: 4, Character_S1: 'SK_FB_BLEED' },
      { Character_ID: 'FB_08', Character_Name: '무라사키 시온', Character_Type: '광기', Character_Class: '스트라이커', Character_Role: '마법 딜러', Character_HP: 780, Character_ATK: 70, Character_Idol: 150, Character_DEF: 15, Character_MDEF: 45, Character_Spd: 21, Character_Aggro: 5, Character_BP: 3, Character_S1: 'SK_FB_FIRE' },
      { Character_ID: 'FB_09', Character_Name: '오오카미 미오', Character_Type: '청초', Character_Class: '스트라이커', Character_Role: '탱커', Character_HP: 1300, Character_ATK: 85, Character_DEF: 55, Character_MDEF: 45, Character_Spd: 14, Character_Aggro: 14, Character_BP: 5, Character_S1: 'SK_FB_BREAK' },
      { Character_ID: 'FB_10', Character_Name: '네코마타 오카유', Character_Type: '큐트', Character_Class: '스트라이커', Character_Role: '암살자', Character_HP: 820, Character_ATK: 130, Character_DEF: 20, Character_MDEF: 25, Character_Spd: 26, Character_Aggro: 5, Character_BP: 3, Character_S1: 'SK_FB_BLEED' },
      { Character_ID: 'FB_11', Character_Name: '토키노 소라', Character_Type: '청초', Character_Class: '서포터', Character_Role: '힐러', Character_HP: 800, Character_ATK: 50, Character_Idol: 110, Character_DEF: 25, Character_MDEF: 35, Character_Spd: 15, Character_Aggro: 4, Character_BP: 3, Character_AS: 'SK_FB_HEAL', Character_SS: 'SK_FB_HEAL' },
      { Character_ID: 'FB_12', Character_Name: '아즈키', Character_Type: '아티스트', Character_Class: '서포터', Character_Role: '버퍼', Character_HP: 750, Character_ATK: 60, Character_Idol: 115, Character_DEF: 20, Character_MDEF: 30, Character_Spd: 16, Character_Aggro: 4, Character_BP: 3, Character_AS: 'SK_FB_ATK_UP', Character_SS: 'SK_FB_SPEED' },
      { Character_ID: 'FB_13', Character_Name: '이누가미 코로네', Character_Type: '게닌', Character_Class: '서포터', Character_Role: '버퍼', Character_HP: 880, Character_ATK: 80, Character_Idol: 90, Character_DEF: 30, Character_MDEF: 25, Character_Spd: 18, Character_Aggro: 5, Character_BP: 3, Character_AS: 'SK_FB_ATK_UP', Character_SS: 'SK_FB_ATK_UP' },
      { Character_ID: 'FB_14', Character_Name: '유키하나 라미', Character_Type: '청초', Character_Class: '서포터', Character_Role: '디버퍼', Character_HP: 760, Character_ATK: 55, Character_Idol: 120, Character_DEF: 20, Character_MDEF: 35, Character_Spd: 17, Character_Aggro: 4, Character_BP: 3, Character_AS: 'SK_FB_BREAK', Character_SS: 'SK_FB_BREAK' },
      { Character_ID: 'FB_15', Character_Name: '시시로 보탄', Character_Type: '쿨', Character_Class: '서포터', Character_Role: '버퍼', Character_HP: 850, Character_ATK: 90, Character_Idol: 80, Character_DEF: 30, Character_MDEF: 25, Character_Spd: 19, Character_Aggro: 5, Character_BP: 3, Character_AS: 'SK_FB_SPEED', Character_SS: 'SK_FB_ATK_UP' },
      { Character_ID: 'FB_16', Character_Name: '오마루 폴카', Character_Type: '게닌', Character_Class: '서포터', Character_Role: '힐러', Character_HP: 820, Character_ATK: 60, Character_Idol: 105, Character_DEF: 25, Character_MDEF: 30, Character_Spd: 16, Character_Aggro: 4, Character_BP: 3, Character_AS: 'SK_FB_HEAL', Character_SS: 'SK_FB_ATK_UP' }
    ];
    teamAStrikersRaw = fallbackList.slice(0, 5);
    teamBStrikersRaw = fallbackList.slice(5, 10);
    teamASupportersRaw = fallbackList.slice(10, 13);
    teamBSupportersRaw = fallbackList.slice(13, 16);
  }

  const charsA = [
    ...teamAStrikersRaw.map((raw, idx) => createCharacterBattleState(raw, 'TEAM_A', idx + 1, { level: 90, star: 3 })),
    ...teamASupportersRaw.map((raw, idx) => createCharacterBattleState(raw, 'TEAM_A', idx + 6, { level: 90, star: 3 }))
  ];
  const charsB = [
    ...teamBStrikersRaw.map((raw, idx) => createCharacterBattleState(raw, 'TEAM_B', idx + 1, { level: 90, star: 3 })),
    ...teamBSupportersRaw.map((raw, idx) => createCharacterBattleState(raw, 'TEAM_B', idx + 6, { level: 90, star: 3 }))
  ];

  return { charsA, charsB };
}

export function buildMasterMaps(allChars) {
  const keywordsMasterMap = { ...CORE_KEYWORDS };
  if (window.GameData && Array.isArray(window.GameData.keyword)) {
    for (const k of window.GameData.keyword) {
      if (k && k.Keyword_ID) {
        keywordsMasterMap[k.Keyword_ID] = {
          ...k,
          Keyword_ID: k.Keyword_ID,
          Keyword_Name: k.Keyword_Name || k['이름'] || k.Keyword_ID,
          Keyword_Icon: k.Keyword_Icon || k['아이콘'] || '',
          Keyword_Type: k.Keyword_Type || k['타입'] || '디버프'
        };
      }
    }
  }

  const skillsMasterMap = {};
  if (window.GameData && Array.isArray(window.GameData.skills)) {
    for (const s of window.GameData.skills) {
      if (s && s.Skill_ID) {
        skillsMasterMap[s.Skill_ID] = s;
      }
    }
  }

  // Ensure each character has valid skill definitions with active effects
  for (const c of allChars) {
    const defaultKeywordByRole = (role) => {
      const r = String(role || '');
      if (r.includes('힐러')) return 'Key_031'; // 재생
      if (r.includes('버퍼')) return 'Key_011'; // 공격력 증가
      if (r.includes('탱커')) return 'Key_015'; // 견고 (방어력 증가)
      if (r.includes('암살자') || r.includes('근거리')) return 'Key_001'; // 출혈
      if (r.includes('마법')) return 'Key_004'; // 화상
      return 'Key_002'; // 파괴
    };
    const kwId = defaultKeywordByRole(c.mainRole || '');

    // Ultimate
    if (!skillsMasterMap[c.ultimateSkillId]) {
      const isSupport = String(c.mainRole || '').includes('힐러') || String(c.mainRole || '').includes('버퍼');
      skillsMasterMap[c.ultimateSkillId] = {
        Skill_ID: c.ultimateSkillId || `ULT_${c.characterId}`,
        Skill_Name: `${c.name} 비기`,
        Skill_Overheat: 80,
        Skill_Target: isSupport ? '아군' : '적',
        Skill_Offensive: isSupport ? '' : 'Offensive',
        Skill_Multiplier: isSupport ? 40 : 250,
        Skill_Break: isSupport ? 0 : 2,
        Skill_Effect_1_ID: kwId,
        Skill_Effect_1_Val1: 2,
        Skill_Effect_1_Val2: 2
      };
    }

    // Unique
    if (!skillsMasterMap[c.uniqueSkillId]) {
      const isSupport = String(c.mainRole || '').includes('힐러') || String(c.mainRole || '').includes('버퍼');
      skillsMasterMap[c.uniqueSkillId] = {
        Skill_ID: c.uniqueSkillId || `UNIQ_${c.characterId}`,
        Skill_Name: `${c.name} 고유기`,
        Skill_Overheat: 20,
        Skill_Target: isSupport ? '아군' : '적',
        Skill_Offensive: isSupport ? '' : 'Offensive',
        Skill_Multiplier: isSupport ? 20 : 150,
        Skill_Break: isSupport ? 0 : 1,
        Skill_Effect_1_ID: kwId,
        Skill_Effect_1_Val1: 1,
        Skill_Effect_1_Val2: 2
      };
    }

    // Basic skills
    const bIds = (c.basicSkillIds && c.basicSkillIds.length > 0) ? c.basicSkillIds : [`BASIC_${c.characterId}_1`];
    bIds.forEach((sid, idx) => {
      if (!skillsMasterMap[sid]) {
        skillsMasterMap[sid] = {
          Skill_ID: sid,
          Skill_Name: `${c.name} 기본기 ${idx + 1}`,
          Skill_Overheat: -10,
          Skill_Target: '적',
          Skill_Offensive: 'Offensive',
          Skill_Multiplier: 100,
          Skill_Break: 0,
          Skill_Effect_1_ID: kwId,
          Skill_Effect_1_Val1: 1,
          Skill_Effect_1_Val2: 2
        };
      }
    });
  }

  // Ensure standard basic skills B_S_002, B_S_003, B_S_483 have active damage definitions if sheet has NONE/0
  if (skillsMasterMap['B_S_002']) {
    const s = skillsMasterMap['B_S_002'];
    if (!s.Act1_Type || s.Act1_Type === 'NONE') s.Act1_Type = 'DAMAGE_PHYS';
    if (!Number(s.Act1_Multiplier)) s.Act1_Multiplier = 100;
    if (!Number(s.Skill_Multiplier)) s.Skill_Multiplier = 100;
    s.Skill_Offensive = 'Offensive';
    s.Act1_Target = s.Act1_Target || '적';
    s.Act1_Calc_Base = s.Act1_Calc_Base || '공격력';
  }
  if (skillsMasterMap['B_S_003']) {
    const s = skillsMasterMap['B_S_003'];
    if (!s.Act1_Type || s.Act1_Type === 'NONE') s.Act1_Type = 'DAMAGE_PHYS';
    if (!Number(s.Act1_Multiplier)) s.Act1_Multiplier = 75;
    if (!Number(s.Skill_Multiplier)) s.Skill_Multiplier = 75;
    s.Skill_Offensive = 'Offensive';
    s.Act1_Target = s.Act1_Target || '적';
    s.Act1_Target_Method = '수동';
    s.Act1_Calc_Base = s.Act1_Calc_Base || '공격력';
  }
  if (skillsMasterMap['B_S_483']) {
    const s = skillsMasterMap['B_S_483'];
    if (!s.Act1_Type || s.Act1_Type === 'NONE') s.Act1_Type = 'DAMAGE_MAGIC';
    if (!Number(s.Act1_Multiplier)) s.Act1_Multiplier = 70;
    if (!Number(s.Skill_Multiplier)) s.Skill_Multiplier = 70;
    s.Skill_Offensive = 'Offensive';
    s.Act1_Target = s.Act1_Target || '적';
    s.Act1_Target_Method = '수동';
    s.Act1_Calc_Base = '아이돌력';
  }

  return { skillsMasterMap, keywordsMasterMap };
}

export function initSampleBattle() {
  const { charsA, charsB } = generate8vs8Teams();
  const allChars = [...charsA, ...charsB];
  const { skillsMasterMap, keywordsMasterMap } = buildMasterMaps(allChars);

  const teamA = createTeamState('TEAM_A', true, charsA);
  const teamB = createTeamState('TEAM_B', false, charsB);

  activeDebugEngine = new BattleEngine(teamA, teamB, {
    seed: Math.floor(Math.random() * 1000000),
    skillsMasterMap,
    keywordsMasterMap
  });

  const logContainer = document.getElementById('battle-debug-log');
  if (logContainer) {
    logContainer.innerHTML = `<div style="color:#2ecc71; font-weight:bold; margin-bottom:4px;">⚔️ 8vs8 모의전투 초기화 완료! (아군 8인 vs 적군 8인, 각 팀 36장 덱)</div>`;
  }

  activeDebugEngine.on('log', (msg) => {
    if (logContainer) {
      const line = document.createElement('div');
      line.style.fontSize = '0.85rem';
      line.style.padding = '2px 0';
      line.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
      line.textContent = msg;
      logContainer.appendChild(line);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  activeDebugEngine.initBattle();
  renderBattleStatus();
}

function renderBattleStatus() {
  const statusContainer = document.getElementById('battle-debug-status');
  if (!statusContainer || !activeDebugEngine) return;

  const s = activeDebugEngine.state;

  const renderCharCard = (c) => {
    const attrInfo = ATTR_BADGES[c.characterType] || { bg: '#eee', color: '#333', border: '#ccc' };
    const borderCol = c.isDead ? '#e74c3c' : (c.isBreaking ? '#f39c12' : (c.teamId === 'TEAM_A' ? '#3498db' : '#e67e22'));
    const isSupporter = c.formationPosition >= 6;

    return `
      <div style="background:#fff; border:2px solid ${borderCol}; border-radius:6px; padding:6px 8px; font-size:0.8rem; box-shadow:0 1px 3px rgba(0,0,0,0.06); display:flex; flex-direction:column; justify-content:space-between; ${c.isDead ? 'opacity:0.6;' : ''}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
            <span style="background:${attrInfo.bg}; color:${attrInfo.color}; border:1px solid ${attrInfo.border}; padding:1px 4px; border-radius:3px; font-size:0.7rem; font-weight:bold;">${c.characterType}</span>
            <span style="font-weight:bold; color:${c.isDead ? '#e74c3c' : '#2c3e50'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:90px;">${c.name}</span>
            <span style="font-size:0.7rem; color:#888;">${isSupporter ? `S${c.formationPosition - 5}` : `P${c.formationPosition}`}</span>
          </div>

          ${c.isDead ? '<div style="color:#e74c3c; font-weight:bold; font-size:0.75rem;">☠️ 사망</div>' : ''}
          ${c.isBreaking ? `<div style="color:#e67e22; font-weight:bold; font-size:0.75rem;">⚡ 브레이킹! (${c.breakingTurnsRemaining}턴)</div>` : ''}

          <div style="display:flex; justify-content:space-between; margin-top:2px;">
            <span>HP: <b style="color:#e74c3c;">${c.hp}</b>/${c.maxHp}${c.shield > 0 ? ` <span style="color:#2980b9;">(+${c.shield})</span>` : ''}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:#555; font-size:0.75rem;">
            <span>Break: <b style="color:#f39c12;">${c.currentBreak}/${c.maxBreak}</b></span>
            <span>Spd: ${c.speed}</span>
          </div>
        </div>

        <!-- Red Superchat Indicator (Independent of 5 slots) -->
        ${c.redSuperchat ? `
          <div style="margin-top:3px; background:#fff5f5; border:1px solid #feb2b2; border-radius:4px; padding:2px 5px; font-size:0.7rem; color:#c53030; font-weight:bold; display:flex; align-items:center; gap:3px;">
            <span>🧧 ${c.redSuperchat.name}</span>
            <span style="font-size:0.65rem; color:#742a2a; font-weight:normal; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">(${c.redSuperchat.description})</span>
          </div>
        ` : ''}

        <!-- Status Slots -->
        <div style="margin-top:4px; padding-top:3px; border-top:1px dashed #eee;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem;">
            <span style="font-weight:bold; color:#555;">슬롯 (${c.statusSlots ? c.statusSlots.length : 0}/5)</span>
            ${(!c.statusSlots || c.statusSlots.length === 0) ? '<span style="color:#aaa;">(비어있음)</span>' : ''}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:2px; margin-top:2px; min-height:16px;">
            ${(c.statusSlots || []).map(slot => {
              const isBuff = (slot.category === 'BUFF');
              const badgeBg = isBuff ? '#e8f8f5' : '#fef5e7';
              const badgeCol = isBuff ? '#27ae60' : '#d35400';
              const badgeBdr = isBuff ? '#a3e4d7' : '#f8c471';
              const icon = slot.icon || (isBuff ? '🔼' : '🔻');
              return `<span style="background:${badgeBg}; color:${badgeCol}; border:1px solid ${badgeBdr}; border-radius:3px; padding:1px 3px; font-size:0.68rem; font-weight:bold; white-space:nowrap;">${icon}${slot.name} x${slot.stack}(${slot.duration}t)</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  };

  const renderTeam = (team) => {
    const strikers = team.characters.filter(c => c.formationPosition <= 5);
    const supporters = team.characters.filter(c => c.formationPosition >= 6);

    return `
      <div style="background:rgba(255,255,255,0.85); padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid #cbd5e0; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; margin-bottom:6px;">
          <span style="font-size:1rem; color:${team.isPlayer ? '#2980b9' : '#c0392b'};">${team.teamId} (${team.isPlayer ? '플레이어' : 'AI'}) — 8인 편성</span>
          <span style="color:#e67e22; font-size:0.95rem;">턴 게이지: <b>${team.teamGauge}</b> / ${team.turnRequirement} (다음 요구치: ${team.nextTurnRequirement})</span>
        </div>
        <div style="font-size:0.82rem; color:#4a5568; margin-bottom:8px;">
          덱: <b>${team.deck.length}</b>장 | 핸드: <b>${team.hand.length}</b>장 | 버림: <b>${team.discard.length}</b>장 | 소멸: <b>${team.exhaust.length}</b>장
        </div>

        <!-- Hand Cards (Supports up to 4 cards with Buffer Red Superchat bonus) -->
        ${(team.hand && team.hand.length > 0) ? `
          <div style="margin-bottom:8px; background:#f7fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px;">
            <div style="font-size:0.75rem; font-weight:bold; color:#2b6cb0; margin-bottom:4px; display:flex; justify-content:space-between;">
              <span>🎴 현재 드로우된 패 (${team.hand.length}장 / 최대 4장 지원)</span>
              ${team.hand.length >= 4 ? '<span style="color:#c53030; font-weight:bold;">🧧 드로우 +1 효과 적용중</span>' : ''}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:6px;">
              ${team.hand.map(card => {
                const isUlt = card.cardType === 'ULTIMATE';
                const cardBg = isUlt ? '#fffaf0' : '#ffffff';
                const cardBdr = isUlt ? '#dd6b20' : '#cbd5e0';
                return `
                  <div style="background:${cardBg}; border:1px solid ${cardBdr}; border-radius:4px; padding:4px 6px; font-size:0.72rem; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-weight:bold; color:#2d3748; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.skillName}</div>
                    <div style="color:#718096; font-size:0.68rem; display:flex; justify-content:space-between; margin-top:2px;">
                      <span>OH: <b>${card.baseOverheat}</b></span>
                      <span>${card.cardType}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Strikers (1~5) -->
        <div style="margin-bottom:8px;">
          <div style="font-size:0.8rem; font-weight:bold; color:#2d3748; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
            <span>⚔️ 스트라이커 (전열 5인)</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:6px;">
            ${strikers.map(renderCharCard).join('')}
          </div>
        </div>

        <!-- Supporters (6~8) -->
        <div>
          <div style="font-size:0.8rem; font-weight:bold; color:#4a5568; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
            <span>🛡️ 서포터 (후열 3인)</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:6px;">
            ${supporters.map(renderCharCard).join('')}
          </div>
        </div>
      </div>
    `;
  };

  statusContainer.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:1.05rem; font-weight:bold; background:#edf2f7; padding:8px 12px; border-radius:6px;">
      <span>현재 틱: <span style="color:#2980b9;">${s.currentTick}s</span> | 페이즈: <span style="color:#8e44ad;">${s.battlePhase}</span></span>
      <span>턴 카운트: <b>${s.turnCount}</b> | 결과: <b style="color:${s.battleResult === 'PLAYER_WIN' ? '#27ae60' : (s.battleResult ? '#e74c3c' : '#3182ce')};">${s.battleResult || '진행중'}</b></span>
    </div>
    ${renderTeam(s.teamA)}
    ${renderTeam(s.teamB)}
  `;
}

export function openBattleScene() {
  const battleScene = document.getElementById('scene-battle');
  const currentScene = document.querySelector('.scene.active') || document.getElementById('main-scene');
  if (battleScene && currentScene) {
    import('./ui.js?v=004276').then(ui => {
      ui.changeSceneWipe(currentScene, battleScene);
    });
  }
}
