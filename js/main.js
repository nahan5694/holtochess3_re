import { initGameData } from './api.js?v=004276';
import { initAuditionSystem } from './audition.js?v=004276';
import { PlayerData } from './state.js?v=004276';
import { initGachaSystem } from './gacha.js?v=004276';
import { initShopSystem, openShopScene } from './shop.js?v=004276';
import { initKizunaSystem } from './kizuna.js?v=004276';
import { initStageSystem } from './ui_stage.js?v=004276';
import { initLiveSystem } from './ui_live.js?v=004276';
import { initCommonUI, startGlobalTimeSystem, initUIStoreListeners, updateMainCharacterImage, changeSceneFade, updateMainPickupBanner, playNextRandomBgm } from './ui.js?v=004276';
import { initBattleSystem } from './battle.js?v=004276';

document.addEventListener("DOMContentLoaded", async () => {
  const initOverlay = document.getElementById("init-overlay");
  const initStatusText = document.getElementById("init-status-text");
  const btnConnect = document.getElementById("btn-connect");
  const bgmLogin = document.getElementById("bgm-login");
  const bgmMain = document.getElementById("bgm-main");
  const loginScene = document.getElementById("login-scene");
  const mainScene = document.getElementById("main-scene");

  // UI 리스너 초기화
  initUIStoreListeners();

  // 데이터 로드
  const isLoaded = await initGameData((text) => {
    if (initStatusText) initStatusText.textContent = text;
  });

  if (isLoaded) {
    if(initStatusText) {
      initStatusText.textContent = "데이터라인 연결 완료";
      initStatusText.classList.add("ready"); 
    }
    initAuditionSystem();
    if (window.initStudioUI) window.initStudioUI();
    if (window.initOfficeUI) window.initOfficeUI();
    updateMainCharacterImage();
    initCommonUI();
    updateMainPickupBanner();
    initGachaSystem();
    initShopSystem();
    initKizunaSystem();
    initStageSystem();
    initLiveSystem();
    initBattleSystem();

    const startLoginScene = () => {
      if(bgmLogin) {
        bgmLogin.volume = 0.6 * 0.7; // 모든 BGM 기본 70%로 축소
        if (PlayerData && PlayerData.options) bgmLogin.muted = (PlayerData.options.muteInBackground && document.hidden) || false;
        bgmLogin.play().catch(e => console.log("음악 재생 실패:", e));
      }
      initOverlay.style.transition = "opacity 0.8s ease-in-out";
      initOverlay.style.opacity = "0";
      initOverlay.style.pointerEvents = "none";
      setTimeout(() => { initOverlay.style.display = "none"; }, 800);
      if(btnConnect) {
        btnConnect.textContent = "접속하기";
        btnConnect.disabled = false;
      }
      initOverlay.removeEventListener("click", startLoginScene);
    };
    initOverlay.addEventListener("click", startLoginScene);
  } else {
    if(initStatusText) {
      initStatusText.textContent = "시스템 연결 실패!";
      initStatusText.style.color = "#ff4757";
    }
  }

  // 접속 버튼 처리
  if (btnConnect) {
    btnConnect.addEventListener("click", () => {
      btnConnect.disabled = true;

      try {
        if (bgmLogin && !bgmLogin.paused) {
          const fadeInterval = setInterval(() => {
            if (bgmLogin.volume > 0.05) {
              bgmLogin.volume = Math.max(0, bgmLogin.volume - 0.05);
            } else {
              bgmLogin.volume = 0;
              bgmLogin.pause(); 
              clearInterval(fadeInterval);
            }
          }, 50);
        }
      } catch (e) {
        console.error("음악 종료 중 에러 발생:", e);
        if (bgmLogin) bgmLogin.pause(); 
      }

      if (loginScene && mainScene) {
        changeSceneFade(loginScene, mainScene);
        setTimeout(() => {
          if (bgmMain) {
            bgmMain.volume = 0.5 * 0.7; // 모든 BGM 기본 70%로 축소
            bgmMain.play().catch(e => console.log("메인 BGM 재생 실패:", e));
            bgmMain.addEventListener("ended", () => {
                if (window.isBattleActive) return;
                const battleScene = document.getElementById("scene-battle");
                if (battleScene && battleScene.classList.contains("active")) return;
                if (typeof window.isSpecialGachaActive === 'function' && window.isSpecialGachaActive()) {
                    bgmMain.currentTime = 0;
                    bgmMain.play().catch(e => console.log("테마곡 루프 재생 실패:", e));
                    return;
                }
                playNextRandomBgm();
            });
          }

          // 신규 계정 시작 시 1회 특별 가챠 실행 (미완료 시)
          if (!PlayerData.starterGachaCompleted) {
            import('./gacha.js?v=004276').then(gacha => {
              if (typeof gacha.triggerStarterSpecialGacha === 'function') {
                gacha.triggerStarterSpecialGacha();
              }
            });
          }
        }, 800);
      }

      startGlobalTimeSystem();
    });
  }

  // 화면 클릭 이펙트
  document.addEventListener("mousedown", (e) => {
    const ripple = document.createElement("div");
    ripple.classList.add("click-ripple");
    ripple.style.left = `${e.pageX}px`;
    ripple.style.top = `${e.pageY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  });

  // 마우스 트레일 이펙트
  document.addEventListener("mousemove", (e) => {
    if (Math.random() > 0.3) return; 
    const trail = document.createElement("div");
    trail.classList.add("mouse-trail");
    const offsetX = (Math.random() - 0.5) * 12;
    const offsetY = (Math.random() - 0.5) * 12;
    trail.style.left = `${e.pageX + offsetX}px`;
    trail.style.top = `${e.pageY + offsetY}px`;
    document.body.appendChild(trail);
    setTimeout(() => trail.remove(), 600); 
  });
});
