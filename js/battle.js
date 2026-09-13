/**
 * Battle System Main Module (Facade)
 * Connects BattleEngine, Types, and Debug UI to the application.
 */

import { BattleEngine } from './battle/battle_engine.js?v=004276';
import { BattleRNG } from './battle/prng.js?v=004276';
import { BattleTestHarness } from './battle/battle_test_harness.js?v=004276';
import {
  BattlePhase,
  CharacterClass,
  CharacterRole,
  CardType,
  DamageType,
  createCharacterBattleState,
  createTeamState
} from './battle/battle_types.js?v=004276';
import { initBattleDebugUI, openBattleScene as openDebugBattleScene } from './ui_battle_debug.js?v=004276';
import { initBattleArenaUI, startFreshBattle, startBattleWithConfig } from './ui_battle.js?v=004276';
import { changeSceneWipe } from './ui.js?v=004276';

export {
  BattleEngine,
  BattleRNG,
  BattleTestHarness,
  BattlePhase,
  CharacterClass,
  CharacterRole,
  CardType,
  DamageType,
  createCharacterBattleState,
  createTeamState,
  openBattleScene,
  startFreshBattle,
  startBattleWithConfig
};

function openBattleScene() {
  const battleScene = document.getElementById('scene-battle');
  const currentScene = document.querySelector('.scene.active') || document.getElementById('main-scene');
  if (battleScene && currentScene) {
    changeSceneWipe(currentScene, battleScene);
    startFreshBattle(false);
  }
}

export function initBattleSystem() {
  console.log("initBattleSystem (실전 전투 UI 및 디버그 하네스) 초기화 완료");

  // Initialize both Arena UI and Debug harness controls
  initBattleArenaUI();
  initBattleDebugUI();

  // Bind menu transition
  const battleMenuBtn = document.querySelector('.menu-btn[data-target="scene-battle"]');
  if (battleMenuBtn) {
    battleMenuBtn.addEventListener('click', () => {
      startFreshBattle(false);
    });
  }

  // Bind any direct battle open buttons if present
  const btnBattleNav = document.querySelectorAll('.btn-open-battle-debug');
  btnBattleNav.forEach(btn => {
    btn.addEventListener('click', () => {
      openBattleScene();
    });
  });
}
