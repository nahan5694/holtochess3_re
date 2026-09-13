import { GameData, PlayerData } from './state.js?v=004276';
import { updateTopCurrencies, openCharInfoModal } from './ui.js?v=004276';

const GACHA_CONFIG = {
  RATES: { SSR: 5, SR: 15, R: 80 },
  FAKE_OUT_CHANCE: 40
};

let gachaCurrentResults = []; 
let gachaSequenceIndex = 0;   
let isGachaAnimating = false; 
let isWaitingForGachaClick = false; 
export let currentGachaType = null; // full, jp, nonjp, special, pickup
window.currentGachaType = currentGachaType;
let gachaAnimToken = 0;

export function isSpecialGachaActive() {
  if (window._isStarterGachaActive) return false;
  const scene12 = document.getElementById("scene-12");
  const isScene12Active = !!(scene12 && scene12.classList.contains("active"));
  const animOverlay = document.getElementById("gacha-anim-overlay");
  const resultOverlay = document.getElementById("gacha-result-overlay");
  const isAnimActive = isGachaAnimating || 
    !!(animOverlay && animOverlay.classList.contains("show")) ||
    !!(resultOverlay && resultOverlay.classList.contains("show"));
  return (isScene12Active || isAnimActive) && (currentGachaType === "special");
}
window.isSpecialGachaActive = isSpecialGachaActive;

export function getThemeSong() {
  return (GameData.songs || []).find(s => String(s.Song_On).trim() === "2");
}

export function playSpecialGachaBgm() {
  if (window._isStarterGachaActive) return;
  const themeSong = getThemeSong();
  if (!themeSong || !themeSong.Song_Link) return;
  const bgmMain = document.getElementById("bgm-main");
  if (!bgmMain) return;
  const targetLink = themeSong.Song_Link;
  if (!bgmMain.src || (!bgmMain.src.includes(targetLink) && bgmMain.src !== targetLink)) {
    bgmMain.src = targetLink;
    bgmMain.currentTime = 0;
  }
  bgmMain.loop = true;
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
  finalVol *= 0.7;
  bgmMain.volume = Math.max(0, Math.min(1, finalVol));
  bgmMain.play().catch(e => console.log("Theme BGM 재생 실패:", e));
}

export function restoreNormalBgm(forceRestart = false) {
  const bgmMain = document.getElementById("bgm-main");
  if (!bgmMain) return;
  bgmMain.loop = false;
  const themeSong = getThemeSong();
  const targetLink = themeSong && themeSong.Song_Link ? themeSong.Song_Link : "";
  const isPlayingTheme = Boolean(targetLink && bgmMain.src && (bgmMain.src.includes(targetLink) || bgmMain.src === targetLink));

  if (isPlayingTheme || forceRestart) {
    if (typeof window.updateMainBgmPlayer === "function") {
      window.updateMainBgmPlayer(true);
    }
  } else {
    if (bgmMain.paused && typeof window.updateMainBgmPlayer === "function") {
      window.updateMainBgmPlayer(false);
    }
  }
}

window.initGachaSystem = initGachaSystem;

window._isCurrentGachaAudition = false;

window.playSingleGachaResult = function(charId, isAudition = false, bloomState = "new", rubyReward = 0) {
    const char = GameData.characters.find(c => c.Character_ID === charId);
    if (!char) return;
    
    window._isCurrentGachaAudition = isAudition;

    gachaCurrentResults = [{
      id: char.Character_ID,
      name: char.Character_Name,
      subName: char.Character_SubName,
      tier: char.Character_Tier,
      rarity: char.Character_Tier,
      img: char.Character_Image_Full,
      class: char.Character_Class,
      type: char.Character_Type,
      speech: char.Character_Gacha_Speech,
      fakeRarity: false,
      bloomState: bloomState,
      rubyReward: rubyReward
    }];

    // 1. 오디션에서 완료된 모집을 확인할 때, SSR 이외에는 연출을 생략하고 결과창만 보여주기.
    if (isAudition && char.Character_Tier !== "SSR") {
        showFinalGachaResult();
        return;
    }

    const animOverlay = document.getElementById("gacha-anim-overlay");
    const animIcon = document.getElementById("gacha-anim-icon");
    const animChar = document.getElementById("gacha-anim-char");
    
    isGachaAnimating = false;
    isWaitingForGachaClick = false;
    
    animOverlay.classList.add("show");
    animIcon.className = "";
    animChar.classList.remove("show");
    
    playGachaSequence(0);
}

export function initGachaSystem() {
  const btnFullCasting = document.getElementById("btn-full-casting");
  const btnJpCasting = document.getElementById("btn-jp-casting");
  const btnNonJpCasting = document.getElementById("btn-nonjp-casting");
  const btnPickupCasting = document.getElementById("btn-pickup-casting");
  const btnSpecialCasting = document.getElementById("btn-special-casting");
  
  const gachaConfirmModal = document.getElementById("gacha-confirm-modal");
  const gachaConfirmText = document.getElementById("gacha-confirm-text");
  const btnGachaCancel = document.getElementById("btn-gacha-cancel");
  const btnGachaExecute = document.getElementById("btn-gacha-execute");
  const animOverlay = document.getElementById("gacha-anim-overlay");
  const btnGachaSkip = document.getElementById("btn-gacha-skip");
  const btnGachaClose = document.getElementById("btn-gacha-close");

  const infoModal = document.getElementById("gacha-info-modal");
  const infoCloseBtn = document.getElementById("btn-gacha-info-close");
  const infoTitle = document.getElementById("gacha-info-title");
  const infoRates = document.getElementById("gacha-info-rates");
    infoRates.style.lineHeight = "1.6";
    infoRates.style.color = "#333";
  const infoContainer = document.getElementById("gacha-info-rateup-container");

  if(infoCloseBtn) {
    infoCloseBtn.addEventListener("click", () => infoModal.classList.remove("show"));
  }
  
  if (infoModal) {
    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) {
        infoModal.classList.remove("show");
      }
    });
  }

  document.querySelectorAll(".gacha-help-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const type = btn.getAttribute("data-help") || "gacha-" + currentGachaType;
      
      let rateText = "";
      let titleText = "";
      let filterFn = null;
      
      if (type === "gacha-special") {
        titleText = "스페셜 캐스팅 정보";
        rateText = "전체 확률: SSR 5%, SR 15%, R 80%<br>SSR 5% 중 3.75% 픽업 대상 등장 (나머지 1.25% 일반 SSR)";
        filterFn = c => String(c.Character_Gacha).startsWith("3");
      } else if (type === "gacha-pickup") {
        titleText = "픽업 캐스팅 정보";
        rateText = "전체 확률: SSR 5%, SR 15%, R 80%<br>SSR 5% 중 3.75% 픽업 대상 등장<br>SR 15% 중 10% 픽업 대상 등장";
        filterFn = c => String(c.Character_Gacha) === "2";
      } else if (type === "gacha-jp") {
        titleText = "JP 캐스팅 정보";
        rateText = "전체 확률: SSR 5%, SR 15%, R 80%<br>등장 풀: 0~4기생, 게이머즈, 네포라보, HoloX (미출시 제외)";
        const jpTags = ["0기생", "1기생", "2기생", "게이머즈", "3기생", "4기생", "네포라보", "HoloX"];
        filterFn = c => jpTags.some(tag => (c.Character_MainTag || "").includes(tag)) && String(c.Character_Gacha).trim() !== "0";
      } else if (type === "gacha-nonjp") {
        titleText = "Non JP 캐스팅 정보";
        rateText = "전체 확률: SSR 5%, SR 15%, R 80%<br>등장 풀: ReGloss, FlowGlow, EN, ID (미출시 제외)";
        const nonjpTags = ["ReGloss", "FlowGlow", "EN_Myth", "EN_Promise", "EN_Advent", "EN_Justice", "ID"];
        filterFn = c => nonjpTags.some(tag => (c.Character_MainTag || "").includes(tag)) && String(c.Character_Gacha).trim() !== "0";
      } else if (type === "gacha-full") {
        titleText = "풀 캐스팅 정보";
        rateText = "전체 확률: SSR 5%, SR 15%, R 80%<br>모든 캐스팅 가능 캐릭터가 균등하게 등장합니다.";
        filterFn = c => String(c.Character_Gacha).trim() !== "0";
      }

      if (infoTitle) infoTitle.textContent = titleText;
      if (infoRates) infoRates.innerHTML = rateText;
      if (infoContainer) {
        infoContainer.innerHTML = "";
        const chars = (GameData.characters || []).filter(filterFn);
          const groups = { "SSR": [], "SR": [], "R": [] };
          chars.forEach(c => {
             if (groups[c.Character_Tier]) groups[c.Character_Tier].push(c);
          });
          
          ["SSR", "SR", "R"].forEach(tier => {
             if (groups[tier].length > 0) {
                const header = document.createElement("h3");
                header.textContent = tier + " 등급";
                header.style.gridColumn = "span 4";
                header.style.margin = "10px 0 0 0";
                header.style.paddingBottom = "5px";
                header.style.borderBottom = "2px solid #ddd";
                header.style.color = tier === "SSR" ? "#ff4757" : (tier === "SR" ? "#f1c40f" : "#7f8c8d");
                infoContainer.appendChild(header);
                
                groups[tier].forEach(char => {
                   const card = document.createElement("div");
                   card.className = "gacha-card";

          
          let rolesHtml = "";
          if (char.Character_Role) {
            const roles = char.Character_Role.split(",").map(s => s.trim());
            rolesHtml = roles.map(r => `<span class="tag-role tag-role-${r.toLowerCase()}">${r}</span>`).join("");
          }
          let classesHtml = "";
          if (char.Character_Class) {
            const cls = char.Character_Class.split(",").map(s => s.trim());
            classesHtml = cls.map(c => `<span class="tag-class tag-class-${c.toLowerCase()}">${c}</span>`).join("");
          }
          
          
            const attrIcons = {
              "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
              "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
              "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
              "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
              "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
              "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
              "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
            };
            const iconUrl = attrIcons[char.Character_Type] || "";
            const iconHtml = iconUrl ? `<img class="gacha-card-attr" src="${iconUrl}" alt="${char.Character_Type}">` : '';

            card.innerHTML = `
              <div class="gacha-card-inner">
                <img src="${char.Character_Image_Full}" alt="${char.Character_Name}">
                <div class="gacha-card-bottom rarity-${char.Character_Tier.toLowerCase()}">
                  <div class="gacha-card-info">
                    <span class="gacha-subname">${char.Character_SubName || ''}</span>
                    <span class="gacha-name">${char.Character_Name}</span>
                  </div>
                  <div class="gacha-rarity-text">${char.Character_Tier}</div>
                </div>
              </div>
              ${iconHtml}
            `;

          
          card.addEventListener("click", () => {
            openCharInfoModal(char, false);
          });
                             infoContainer.appendChild(card);
                });
             }
          });

      }
      
      if (infoModal) infoModal.classList.add("show");
    });
  });

  const showConfirm = (type, title, cost) => {
    currentGachaType = type;
    window.currentGachaType = currentGachaType;
    let currentDiamond = PlayerData.items["Item_001"] || 0;
    gachaConfirmText.innerHTML = `${title} 10회 캐스팅을 진행하시겠습니까?<br>소모 재화: 홀로다이아 ${cost}개<br><br><span style="font-weight: bold; color:#005599; font-size: 1.3rem;">현재 보유 홀로다이아 : ${currentDiamond.toLocaleString()}</span>`;
    gachaConfirmModal.classList.add("show");
  };

  const gachaCostMap = { "special": 1200, "pickup": 1000, "jp": 900, "nonjp": 900, "full": 800 };
  const gachaTitleMap = { "special": "스페셜", "pickup": "픽업", "jp": "JP", "nonjp": "Non JP", "full": "풀" };
  const gachaCost10 = document.getElementById("gacha-cost-10");
  
  const sideBtns = document.querySelectorAll(".gacha-side-btn");
  sideBtns.forEach(btn => {
     btn.addEventListener("click", () => {
         sideBtns.forEach(b => b.classList.remove("active"));
         btn.classList.add("active");
         const oldType = currentGachaType;
         currentGachaType = btn.getAttribute("data-type");
         window.currentGachaType = currentGachaType;
         if (gachaCost10) gachaCost10.textContent = gachaCostMap[currentGachaType];
         updateGachaBannerDisplay();
         if (currentGachaType === "special") {
           playSpecialGachaBgm();
         } else if (oldType === "special") {
           restoreNormalBgm(true);
         } else {
           restoreNormalBgm(false);
         }
     });
  });

  const btnGacha10 = document.getElementById("btn-gacha-10");
  if (btnGacha10) {
      btnGacha10.addEventListener("click", () => {
          showConfirm(currentGachaType, gachaTitleMap[currentGachaType], gachaCostMap[currentGachaType] || 800);
      });
  }

  if(btnGachaCancel) {
    btnGachaCancel.addEventListener("click", () => {
      gachaConfirmModal.classList.remove("show");
    });
  }

  if(btnGachaExecute) {
    btnGachaExecute.addEventListener("click", () => {
      gachaConfirmModal.classList.remove("show");
      
      window._isCurrentGachaAudition = false; // Reset audition flag for 10-pull
      if (currentGachaType === "special") {
        playSpecialGachaBgm();
      }

      const gachaCostMap = { "special": 1200, "pickup": 1000, "jp": 900, "nonjp": 900, "full": 800 };
      let cost = gachaCostMap[currentGachaType] || 8000;

      let currentDiamond = PlayerData.items["Item_001"] || 0;
      if (currentDiamond >= cost) {
        PlayerData.items["Item_001"] -= cost; // Proxy will auto-save
        updateTopCurrencies(); 
      } else {
        alert("홀로다이아가 부족합니다!");
        return;
      }

      let chars = (GameData.characters || []).filter(c => String(c.Character_Gacha).trim() !== "0");
      
      if (currentGachaType === "jp") {
        const jpTags = ["0기생", "1기생", "2기생", "게이머즈", "3기생", "4기생", "네포라보", "HoloX"];
        chars = chars.filter(c => jpTags.some(tag => (c.Character_MainTag || "").includes(tag)));
      } else if (currentGachaType === "nonjp") {
        const nonjpTags = ["ReGloss", "FlowGlow", "EN_Myth", "EN_Promise", "EN_Advent", "EN_Justice", "ID"];
        chars = chars.filter(c => nonjpTags.some(tag => (c.Character_MainTag || "").includes(tag)));
      }

      const poolR = chars.filter(c => c.Character_Tier === "R" && c.Character_Image_Full);
      const poolSR = chars.filter(c => c.Character_Tier === "SR" && c.Character_Image_Full);
      const poolSSR = chars.filter(c => c.Character_Tier === "SSR" && c.Character_Image_Full);

      gachaCurrentResults = [];
      for (let i = 0; i < 10; i++) {
        const rand = Math.random() * 100;
        let rarity = "R";
        let targetPool = poolR;
        let fakeRarity = null;

        if (rand < GACHA_CONFIG.RATES.SSR) {
          rarity = "SSR";
          if (Math.random() * 100 < GACHA_CONFIG.FAKE_OUT_CHANCE) {
            fakeRarity = Math.random() < 0.2 ? "R" : "SR";
          }
          
          targetPool = poolSSR;
          if (currentGachaType === "pickup") {
            const pickupPool = poolSSR.filter(c => String(c.Character_Gacha) === "2");
            if (rand < GACHA_CONFIG.RATES.SSR * 0.75 && pickupPool.length > 0) {
              targetPool = pickupPool;
            } else {
              targetPool = poolSSR.filter(c => String(c.Character_Gacha) !== "2");
              if (targetPool.length === 0) targetPool = poolSSR;
            }
          } else if (currentGachaType === "special") {
            const specialPool = poolSSR.filter(c => String(c.Character_Gacha).startsWith("3"));
            if (rand < GACHA_CONFIG.RATES.SSR * 0.75 && specialPool.length > 0) {
              targetPool = specialPool;
            } else {
              targetPool = poolSSR.filter(c => !String(c.Character_Gacha).startsWith("3"));
              if (targetPool.length === 0) targetPool = poolSSR;
            }
          }
        } else if (rand < GACHA_CONFIG.RATES.SSR + GACHA_CONFIG.RATES.SR) {
          rarity = "SR";
          targetPool = poolSR;
          if (currentGachaType === "pickup") {
            const pickupSRPool = poolSR.filter(c => String(c.Character_Gacha) === "2");
            // SR total rate is 15%. We want 10% for pickup and 5% for normal.
            // SSR rate is 5. So if rand < 5 + 10 = 15, we pick pickup SR.
            if (rand < GACHA_CONFIG.RATES.SSR + 10 && pickupSRPool.length > 0) {
              targetPool = pickupSRPool;
            } else {
              targetPool = poolSR.filter(c => String(c.Character_Gacha) !== "2");
              if (targetPool.length === 0) targetPool = poolSR;
            }
          }
        }

        let pickedChar = targetPool.length > 0 ? targetPool[Math.floor(Math.random() * targetPool.length)] : {
          Character_Name: "결측값", Character_SubName: "Unknown", Character_Image_Full: "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Mori_03.png"
        };

        let pullResult = {
          id: pickedChar.Character_ID,
          rarity: rarity, 
          img: pickedChar.Character_Image_Full,
          name: pickedChar.Character_Name,
          subName: pickedChar.Character_SubName,
          class: pickedChar.Character_Class,
          type: pickedChar.Character_Type,
          role: pickedChar.Character_Role, 
          speech: pickedChar.Character_Gacha_Speech,
          fakeRarity: fakeRarity,
          bloomState: "new",
          rubyReward: 0
        };
        
        if (pickedChar && pickedChar.Character_ID) {
          const charId = pickedChar.Character_ID;
          if (!PlayerData.characters.includes(charId)) {
            PlayerData.characters.push(charId); // Proxy auto-saves
            if (!PlayerData.characterStats) PlayerData.characterStats = {};
            if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
          } else {
            // 중복 획득
            if (!PlayerData.characterStats) PlayerData.characterStats = {};
            if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
            
            if (PlayerData.characterStats[charId].bloom === undefined) PlayerData.characterStats[charId].bloom = 0;
            
            if (PlayerData.characterStats[charId].bloom < 5) {
              PlayerData.characterStats[charId].bloom++;
              PlayerData.characterStats = { ...PlayerData.characterStats }; // Proxy trigger
              pullResult.bloomState = "up";
              console.log(`[Bloom] ${pickedChar.Character_Name} 중복 획득! 개화 레벨 상승: ${PlayerData.characterStats[charId].bloom}`);
            } else {
              let rubyReward = 1;
              if (pickedChar.Character_Tier === "SSR") rubyReward = 50;
              else if (pickedChar.Character_Tier === "SR") rubyReward = 10;
              
              PlayerData.items["Item_039"] = (PlayerData.items["Item_039"] || 0) + rubyReward;
              pullResult.bloomState = "max";
              pullResult.rubyReward = rubyReward;
              console.log(`[Bloom] ${pickedChar.Character_Name} 개화 MAX! 루비 ${rubyReward}개 지급`);
            }
          }
        }
        
        gachaCurrentResults.push(pullResult);
      }

      if (!PlayerData.gachaPity) PlayerData.gachaPity = {};
      const maxPity = GACHA_PITY_CONFIG[currentGachaType] || 15;
      PlayerData.gachaPity[currentGachaType] = Math.min(maxPity, (PlayerData.gachaPity[currentGachaType] || 0) + 1);
      updateGachaPityDisplay();

      // 결과 카드 일러스트 사전 캐싱 (네트워크 지연 방지)
      gachaCurrentResults.forEach(p => {
        if (p && p.img) {
          const img = new Image();
          img.src = p.img;
        }
      });

      try {
        playOpeningSequence();
      } catch (err) {
        console.error("playOpeningSequence error, falling back to showFinalGachaResult:", err);
        showFinalGachaResult();
      }
    });
  }

  if (animOverlay) {
    animOverlay.addEventListener("click", (e) => {
      if (e.target.id === "btn-gacha-skip") return;
      if (isGachaAnimating) return; 
      
      if (isWaitingForGachaClick) {
        isWaitingForGachaClick = false; 
        const clickText = document.getElementById("gacha-click-to-continue");
        if(clickText) {
          clickText.classList.remove("show");
          clickText.style.display = "none";
        }
        playGachaSequence(findNextPlayableGachaIndex(0)); 
        return;
      }
      playGachaSequence(findNextPlayableGachaIndex(gachaSequenceIndex + 1));
    });
  }

  if (btnGachaSkip) {
    btnGachaSkip.addEventListener("click", showFinalGachaResult);
  }
  
  if (btnGachaClose) {
    btnGachaClose.addEventListener("click", () => {
      window._isStarterGachaActive = false;
      document.getElementById("gacha-result-overlay").classList.remove("show");
    });
  }
  
  const resultOverlayForClose = document.getElementById("gacha-result-overlay");
  if (resultOverlayForClose) {
    resultOverlayForClose.addEventListener("click", (e) => {
      // 닫기 버튼이 화면에 보일 때만 닫히도록 조건 추가 (결과창 연출이 다 끝난 뒤)
      if (e.target === resultOverlayForClose && btnGachaClose && btnGachaClose.style.display === "block") {
        window._isStarterGachaActive = false;
        resultOverlayForClose.classList.remove("show");
      }
    });
  }

  // 동적 다이아 아이콘 업데이트
  const diamondIconItem = (GameData.items || []).find(i => String(i.Item_ID) === "Item_001");
  if (diamondIconItem && diamondIconItem.Item_Icon) {
    document.querySelectorAll(".diamond-icon").forEach(img => {
      img.src = diamondIconItem.Item_Icon;
    });
  }

  // 확정 교환 버튼 리스너
  const btnGachaExchange = document.getElementById("btn-gacha-exchange");
  if (btnGachaExchange) {
    btnGachaExchange.addEventListener("click", () => {
      openGachaExchangeModal(currentGachaType);
    });
  }

  const btnCloseExchange = document.getElementById("btn-close-gacha-exchange");
  if (btnCloseExchange) {
    btnCloseExchange.addEventListener("click", () => {
      const modal = document.getElementById("gacha-exchange-modal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    });
  }

  // 배너 및 천장 초기 디스플레이 설정
  currentGachaType = "special";
  window.currentGachaType = currentGachaType;
  updateGachaBannerDisplay();
  updateGachaPityDisplay();

  // 스페셜 가챠 테마곡 상점 바로가기 버튼 리스너
  const btnThemeSong = document.getElementById("btn-gacha-theme-song");
  if (btnThemeSong) {
    btnThemeSong.addEventListener("click", () => {
      restoreNormalBgm(true);
      import('./shop.js?v=004276').then(shopModule => {
        shopModule.openShopScene();
        const tabSong = document.getElementById("tab-shop-song");
        if (tabSong) tabSong.click();
        import('./ui.js?v=004276').then(uiModule => {
          uiModule.changeSceneWipe(document.getElementById("scene-12"), document.getElementById("scene-shop"));
        });
      });
    });
  }
}

function playOpeningSequence() {
  const animIcon = document.getElementById("gacha-anim-icon");
  const animChar = document.getElementById("gacha-anim-char");
  const animFlash = document.getElementById("gacha-flash");
  const animOverlay = document.getElementById("gacha-anim-overlay");

  isGachaAnimating = true; 
  isWaitingForGachaClick = false;

  let maxTier = "R";
  let hasRealSSR = gachaCurrentResults.some(p => p.rarity === "SSR" && !p.fakeRarity);
  let hasSR = gachaCurrentResults.some(p => p.rarity === "SR" || p.rarity === "SSR"); 
  
  if (hasRealSSR) maxTier = "SSR";
  else if (hasSR) maxTier = "SR";

  const animUi = document.getElementById("gacha-anim-ui");
  if(animUi) animUi.className = "hidden"; 
  
  animChar.style.transition = "none";
  animChar.classList.remove("show");
  animChar.removeAttribute("src"); 
  
  animFlash.classList.remove("flash");
  animOverlay.classList.remove("shake-ssr", "dark-mode");
  
  const glare = document.getElementById("gacha-glare");
  const tContainer = document.getElementById("gacha-twinkles");
  if (glare) glare.className = "";
  if (tContainer) tContainer.innerHTML = "";
  
  const animSpotlight = document.getElementById("gacha-spotlight");
  if(animSpotlight) animSpotlight.className = ""; 

  animIcon.style.opacity = "1";
  animIcon.className = ""; 
  animOverlay.classList.add("show");

  const sweepLeft = document.getElementById("opening-sweep-left");
  const sweepRight = document.getElementById("opening-sweep-right");
  const sweepUp = document.getElementById("opening-sweep-up");
  
  if(sweepLeft) sweepLeft.classList.remove("anim-sweep-left");
  if(sweepRight) sweepRight.classList.remove("anim-sweep-right");
  if(sweepUp) sweepUp.classList.remove("anim-sweep-up");

  const clickText = document.getElementById("gacha-click-to-continue");
  if(clickText) {
    clickText.classList.remove("show");
    clickText.style.display = "none"; 
  }

  let currentTime = 600; 
  let sweepTime = 800; 
  let gapTime = 1200;  

  setTimeout(() => {
    if(sweepLeft) sweepLeft.classList.add("anim-sweep-left");
    setTimeout(() => { animIcon.className = "color-r-plain"; }, sweepTime / 2);
  }, currentTime);
  
  currentTime += gapTime; 

  if (maxTier === "SR" || maxTier === "SSR") {
    setTimeout(() => {
      if(sweepRight) sweepRight.classList.add("anim-sweep-right");
      setTimeout(() => { animIcon.className = "color-sr-plain"; }, sweepTime / 2);
    }, currentTime);
    currentTime += gapTime;
  }

  if (maxTier === "SSR") {
    setTimeout(() => {
      if(sweepUp) sweepUp.classList.add("anim-sweep-up");
      setTimeout(() => { animIcon.className = "color-ssr-plain"; }, sweepTime / 2);
    }, currentTime);
    currentTime += gapTime;
  }

  setTimeout(() => {
    animOverlay.classList.add("dark-mode"); 
    animIcon.className = ""; 
    animOverlay.classList.remove("shake-ssr");
    
    setTimeout(() => {
      if(clickText) {
        clickText.style.display = "block"; 
        clickText.classList.add("show");
      }
      isGachaAnimating = false; 
      isWaitingForGachaClick = true; 
    }, 500); 
  }, currentTime);
}

function playGachaSequence(index) {
  if (index >= gachaCurrentResults.length) {
    showFinalGachaResult();
    return;
  }
  if (shouldSkipGachaPull(gachaCurrentResults[index])) {
    const nextIdx = findNextPlayableGachaIndex(index);
    if (nextIdx >= gachaCurrentResults.length) {
      showFinalGachaResult();
      return;
    }
    index = nextIdx;
  }
  gachaSequenceIndex = index;
  if (index >= gachaCurrentResults.length) {
    showFinalGachaResult();
    return;
  }

  const token = ++gachaAnimToken;

  const animIcon = document.getElementById("gacha-anim-icon");
  const animChar = document.getElementById("gacha-anim-char");
  const animFlash = document.getElementById("gacha-flash");
  const animOverlay = document.getElementById("gacha-anim-overlay");
  const cutinTop = document.getElementById("ssr-cutin-top");
  const cutinBottom = document.getElementById("ssr-cutin-bottom");

  // 이전 일러스트 및 SSR 컷인 즉시 완전 초기화 (잔류 이미지 방지)
  if (cutinTop) cutinTop.style.backgroundImage = '';
  if (cutinBottom) cutinBottom.style.backgroundImage = '';
  if (animChar) {
    animChar.style.transition = "none";
    animChar.classList.remove("show");
    animChar.removeAttribute("src");
  }

  isGachaAnimating = true;
  const currentPull = gachaCurrentResults[index];
  const rarity = currentPull.rarity.toUpperCase();
  const isFakeOut = !!currentPull.fakeRarity;
  const initialRarity = isFakeOut ? currentPull.fakeRarity.toUpperCase() : rarity;
  
  const preloadImg = new Image();
  preloadImg.src = currentPull.img; 

  const animUi = document.getElementById("gacha-anim-ui");
  if(animUi) animUi.className = "hidden"; 

  const glare = document.getElementById("gacha-glare");
  const tContainer = document.getElementById("gacha-twinkles");
  if (glare) glare.className = "";
  if (tContainer) tContainer.innerHTML = "";

  if (animIcon) {
    animIcon.style.opacity = "1";
    animIcon.className = ""; 
  }
  
  const animSpotlight = document.getElementById("gacha-spotlight");
  if(animSpotlight) animSpotlight.className = "";
  
  if (animFlash) animFlash.classList.remove("flash");
  if (animOverlay) {
    animOverlay.classList.remove("shake-ssr"); 
    animOverlay.classList.add("show", "dark-mode"); 
  }

  setTimeout(() => {
    if (token !== gachaAnimToken) return;
    if(animSpotlight) animSpotlight.classList.add(`spotlight-${initialRarity.toLowerCase()}`);
    setTimeout(() => {
      if (token !== gachaAnimToken) return;
      if (animIcon) animIcon.classList.add(`color-${initialRarity.toLowerCase()}`);
      if (initialRarity === "SSR" && animOverlay) animOverlay.classList.add("shake-ssr");

      if (isFakeOut) {
        setTimeout(() => {
          if (token !== gachaAnimToken) return;
          if(animSpotlight) animSpotlight.className = "";
          setTimeout(() => {
            if (token !== gachaAnimToken) return;
            if(animSpotlight) animSpotlight.classList.add("spotlight-ssr");
            setTimeout(() => {
              if (token !== gachaAnimToken) return;
              if (animIcon) animIcon.className = "color-ssr";
              if (animOverlay) animOverlay.classList.add("shake-ssr");
              if (animFlash) {
                animFlash.classList.remove("flash");
                void animFlash.offsetWidth; 
                animFlash.classList.add("flash");
              }
              setTimeout(() => {
                if (token !== gachaAnimToken) return;
                executeCutinOrReveal(currentPull, rarity, token);
              }, 1200);
            }, 500); 
          }, 400); 
        }, 800); 
      } else {
        let effectTime = (rarity === "SSR") ? 1200 : 500;
        let waitAfter = (rarity === "SSR") ? 200 : 600;
        setTimeout(() => {
          if (token !== gachaAnimToken) return;
          executeCutinOrReveal(currentPull, rarity, token);
        }, effectTime + waitAfter);
      }
    }, 500); 
  }, 750); 
}

function playSpeechAnimation(speechText, charType, callback, token) {
  const container = document.getElementById("gacha-speech-overlay");
  const textEl = document.getElementById("gacha-speech-text");
  const bgAttrImg = document.getElementById("speech-bg-attr");
  
  const attrIcons = {
    "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
    "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
    "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
    "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
    "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
    "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
    "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
  };

  if (bgAttrImg) {
    bgAttrImg.src = attrIcons[charType] || "";
    bgAttrImg.style.display = attrIcons[charType] ? "block" : "none";
  }

  speechText = speechText || "나와 함께 무대에 서 줄래?";
  if (textEl) textEl.innerHTML = "";
  if (container) container.classList.add("show");
  
  const lines = String(speechText).split(/<br\s*\/?>|\n/i);
  let charIndex = 0;

  if (textEl) {
    lines.forEach((line, lineIdx) => {
      line.split("").forEach((char) => {
        const span = document.createElement("span");
        span.textContent = char;
        if (char === " ") span.innerHTML = "&nbsp;"; 
        span.className = "speech-char";
        span.style.animationDelay = `${charIndex * 0.05}s`; 
        textEl.appendChild(span);
        charIndex++;
      });
      if (lineIdx < lines.length - 1) textEl.appendChild(document.createElement("br"));
    });

    textEl.classList.remove("scale-up");
    void textEl.offsetWidth; 
    textEl.classList.add("scale-up");
  }

  setTimeout(() => {
    if (token && token !== gachaAnimToken) return;
    if (container) container.classList.remove("show");
    callback(); 
  }, 4000);
}

function ensureImageReady(imgUrl) {
  if (!imgUrl) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imgUrl;
    if (img.complete && img.naturalWidth > 0) {
      return resolve();
    }
    img.onload = () => resolve();
    img.onerror = () => resolve();
    setTimeout(resolve, 3000);
  });
}

function executeCutinOrReveal(currentPull, rarity, token) {
  if (token && token !== gachaAnimToken) return;
  const animOverlay = document.getElementById("gacha-anim-overlay");
  const animIcon = document.getElementById("gacha-anim-icon");
  if (animOverlay) animOverlay.classList.remove("dark-mode"); 
  
  if (rarity === "SSR") {
    if(animIcon) animIcon.style.opacity = "0"; 
    playSpeechAnimation(currentPull.speech, currentPull.type, () => {
      if (token && token !== gachaAnimToken) return;
      const cutinTop = document.getElementById("ssr-cutin-top");
      const cutinBottom = document.getElementById("ssr-cutin-bottom");
      if(cutinTop) cutinTop.style.backgroundImage = `url(${currentPull.img})`;
      if(cutinBottom) cutinBottom.style.backgroundImage = `url(${currentPull.img})`;
      
      if(cutinBottom) cutinBottom.classList.add("pan-left");
      setTimeout(() => {
        if (token && token !== gachaAnimToken) return;
        if(cutinBottom) cutinBottom.classList.remove("pan-left");
        if(cutinTop) cutinTop.classList.add("pan-right");
        setTimeout(async () => {
          if (token && token !== gachaAnimToken) return;
          if(cutinTop) cutinTop.classList.remove("pan-right");
          await ensureImageReady(currentPull.img);
          if (token && token !== gachaAnimToken) return;
          showFullCharacter(currentPull, rarity, token);
        }, 1000); 
      }, 1000); 
    }, token);
  } else {
    ensureImageReady(currentPull.img).then(() => {
      if (token && token !== gachaAnimToken) return;
      showFullCharacter(currentPull, rarity, token);
    });
  }
}

function showFullCharacter(pullData, rarity, token) {
  if (token && token !== gachaAnimToken) return;
  const animIcon = document.getElementById("gacha-anim-icon");
  const animChar = document.getElementById("gacha-anim-char");
  const animFlash = document.getElementById("gacha-flash");

  if (animFlash) animFlash.classList.add("flash");
  if (animChar) {
    animChar.src = pullData.img;
    void animChar.offsetWidth; // Force reflow
    animChar.style.transition = "opacity 0.8s ease-out";
    animChar.classList.add("show");
  }
  if (animIcon) animIcon.style.opacity = "0"; 
  
  const animUi = document.getElementById("gacha-anim-ui");
  const uiAttr = document.getElementById("gacha-ui-attr");
  const uiClass = document.getElementById("gacha-ui-class");
  const uiRoles = document.getElementById("gacha-ui-roles"); 
  const uiRarity = document.getElementById("gacha-ui-rarity");
  const uiSubname = document.getElementById("gacha-ui-subname");
  const uiName = document.getElementById("gacha-ui-name");

  const attrIcons = {
    "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
    "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
    "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
    "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
    "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
    "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
    "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
  };
  
  uiAttr.src = attrIcons[pullData.type] || "";
  const uiAttrWrapper = document.getElementById("attr-icon-wrapper");
  if (uiAttrWrapper) {
    uiAttrWrapper.style.display = attrIcons[pullData.type] ? "block" : "none";
  }

  uiClass.textContent = pullData.class || "";
  uiClass.className = `badge badge-class-${(pullData.class || "").replace(/ /g, '')}`;
  
  uiRoles.innerHTML = "";
  (pullData.role || "").split("/").forEach(role => {
    const trimmed = role.trim();
    if (trimmed) {
      const span = document.createElement("span");
      span.textContent = trimmed;
      span.className = `badge badge-role-${trimmed.replace(/ /g, '')}`;
      uiRoles.appendChild(span);
    }
  });

  uiRarity.textContent = rarity;
  uiRarity.className = `ui-rarity-${rarity.toLowerCase()}`;
  uiSubname.textContent = pullData.subName || "";
  uiName.textContent = pullData.name || "";

  const badgeContainer = document.getElementById("gacha-ui-bloom-badge");
  if (badgeContainer) {
      let animBadgeHtml = '';
      if (pullData.bloomState === "new") {
          animBadgeHtml = `<div style="display: inline-block; margin-bottom: 10px; background: #e74c3c; color: white; padding: 6px 16px; border-radius: 8px; font-weight: bold; font-size: 1.2rem; z-index: 20; box-shadow: 0 4px 8px rgba(0,0,0,0.4);">NEW!!</div>`;
      } else if (pullData.bloomState === "up") {
          animBadgeHtml = `<div style="display: inline-block; margin-bottom: 10px; background: #e83e8c; color: white; padding: 6px 16px; border-radius: 8px; font-weight: bold; font-size: 1.2rem; z-index: 20; box-shadow: 0 4px 8px rgba(0,0,0,0.4);">🌸 +1</div>`;
      } else if (pullData.bloomState === "max") {
          const itemIcon = GameData.items && GameData.items.find(i => i.Item_ID === "Item_039")?.Item_Icon;
          animBadgeHtml = `<div style="display: inline-flex; margin-bottom: 10px; background: #f1c40f; color: black; padding: 6px 16px; border-radius: 8px; font-weight: bold; font-size: 1.2rem; z-index: 20; box-shadow: 0 4px 8px rgba(0,0,0,0.4); align-items:center; gap: 6px;">
              <img src="${itemIcon}" style="width: 22px; height: 22px; object-fit: contain;"> +${pullData.rubyReward || 0}
          </div>`;
      }
      badgeContainer.innerHTML = animBadgeHtml;
  }

  animUi.className = `ui-active bg-${rarity.toLowerCase()}`;
  if (rarity === "SSR") animUi.classList.add("anim-ssr-text");

  const glare = document.getElementById("gacha-glare");
  const tContainer = document.getElementById("gacha-twinkles");
  glare.className = ""; 
  tContainer.innerHTML = ""; 
  
  if (rarity === "SR") {
    glare.classList.add("glare-sr");
  } else if (rarity === "SSR") {
    glare.classList.add("glare-ssr");
    fireTwinkles(); 
  }
  
  setTimeout(() => {
    if (token && token !== gachaAnimToken) return;
    if (animIcon) {
      animIcon.style.transition = "none"; 
      animIcon.className = ""; 
      setTimeout(() => {
        if (token && token !== gachaAnimToken) return;
        if (animIcon) animIcon.style.transition = "all 0.2s ease";
      }, 50);
    }
    isGachaAnimating = false; 
  }, 800); 
}

function fireTwinkles() {
  const tContainer = document.getElementById("gacha-twinkles");
  for(let i = 0; i < 25; i++) {
    const star = document.createElement("div");
    star.classList.add("twinkle-star");
    star.style.left = (Math.random() * 90 + 5) + "%"; 
    star.style.top = (Math.random() * 90 + 5) + "%";
    star.style.animationDuration = (1.5 + Math.random() * 3.5) + "s";
    star.style.animationDelay = (Math.random() * 3) + "s";
    star.style.transform = `scale(${0.6 + Math.random() * 1.2})`;
    tContainer.appendChild(star);
  }
}

function showFinalGachaResult() {
  gachaAnimToken++;
  const animOverlay = document.getElementById("gacha-anim-overlay");
  const animChar = document.getElementById("gacha-anim-char");
  const cutinTop = document.getElementById("ssr-cutin-top");
  const cutinBottom = document.getElementById("ssr-cutin-bottom");
  const resultOverlay = document.getElementById("gacha-result-overlay");
  const cardContainer = document.getElementById("gacha-card-container");
  const btnGachaClose = document.getElementById("btn-gacha-close");
  const titleText = document.getElementById("gacha-result-title-text");

  if (cutinTop) cutinTop.style.backgroundImage = '';
  if (cutinBottom) cutinBottom.style.backgroundImage = '';
  if (animOverlay) animOverlay.classList.remove("show");
  if (animChar) {
    animChar.style.transition = "none";
    animChar.classList.remove("show");
    animChar.removeAttribute("src");
  }
  
  cardContainer.innerHTML = ""; 
  btnGachaClose.style.display = "none"; 
  resultOverlay.classList.add("show");

  if (window._isCurrentGachaAudition) {
      if (titleText) titleText.innerText = "✨ Audition Result ✨";
      cardContainer.classList.add("single-result");
  } else {
      if (titleText) titleText.innerText = "✨ Casting Result ✨";
      cardContainer.classList.remove("single-result");
  }

  gachaCurrentResults.forEach((pull, i) => {
    setTimeout(() => {
      const card = document.createElement("div");
      card.classList.add("gacha-card");
      if (pull.rarity === "SSR") card.classList.add("card-ssr"); 
      
      const attrIcons = {
        "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
        "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
        "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
        "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
        "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
        "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
        "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
      };
      const iconUrl = attrIcons[pull.type] || "";
      const iconHtml = iconUrl ? `<img class="gacha-card-attr" src="${iconUrl}" alt="${pull.type}">` : '';

      let badgeHtml = '';
      if (pull.bloomState === "new") {
          badgeHtml = `<div style="position:absolute; top: -10px; right: -15px; background: #e74c3c; color: white; padding: 4px 8px; border-radius: 8px; font-weight: bold; font-size: 1rem; z-index: 20; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: rotate(10deg);">NEW!!</div>`;
      } else if (pull.bloomState === "up") {
          badgeHtml = `<div style="position:absolute; top: -10px; right: -15px; background: #e83e8c; color: white; padding: 4px 8px; border-radius: 8px; font-weight: bold; font-size: 1rem; z-index: 20; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: rotate(10deg);">🌸 +1</div>`;
      } else if (pull.bloomState === "max") {
          const itemIcon = GameData.items && GameData.items.find(i => i.Item_ID === "Item_039")?.Item_Icon;
          badgeHtml = `<div style="position:absolute; top: -10px; right: -15px; background: #f1c40f; color: black; padding: 4px 8px; border-radius: 8px; font-weight: bold; font-size: 1rem; z-index: 20; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display:flex; align-items:center; gap: 4px; transform: rotate(10deg);">
              <img src="${itemIcon}" style="width: 18px; height: 18px; object-fit: contain;"> +${pull.rubyReward || 0}
          </div>`;
      }

      card.innerHTML = `
        ${badgeHtml}
        <div class="gacha-card-inner">
          <img src="${pull.img}" alt="${pull.name}">
          <div class="gacha-card-bottom rarity-${pull.rarity.toLowerCase()}">
            <div class="gacha-card-info">
              <span class="gacha-subname">${pull.subName || ''}</span>
              <span class="gacha-name">${pull.name}</span>
            </div>
            <div class="gacha-rarity-text">${pull.rarity}</div>
          </div>
        </div>
        ${iconHtml}
      `;
      
      card.style.cursor = "pointer";
      card.addEventListener('click', () => {
          const charObj = GameData.characters.find(c => c.Character_ID === pull.id);
          if (charObj) {
              openCharInfoModal(charObj, true, true);
          }
      });
      
      cardContainer.appendChild(card);
      
      if (i === gachaCurrentResults.length - 1) {
        setTimeout(() => { btnGachaClose.style.display = "block"; }, 600);
      }
    }, i * 200); 
  });
}

let gachaBannerInterval = null;
export function updateGachaBannerDisplay() {
  const display = document.getElementById("gacha-banner-display");
  const bg = document.getElementById("gacha-banner-bg");
  if (!display) return;
  
  if (gachaBannerInterval) {
      clearInterval(gachaBannerInterval);
      gachaBannerInterval = null;
  }
  
  const chars = GameData.characters || [];
  let filterFn = () => false;
  let genericBg = "linear-gradient(135deg, #005ce6, #80c4ff)";
  
  if (bg) bg.style.animation = '';
  
  const btnThemeSong = document.getElementById("btn-gacha-theme-song");
  const themeSongName = document.getElementById("gacha-theme-song-name");
  const themeSong = getThemeSong();
  if (btnThemeSong) {
    if (currentGachaType === "special" && themeSong) {
      btnThemeSong.style.display = "flex";
      if (themeSongName) themeSongName.textContent = themeSong.Song_Name || "테마곡";
    } else {
      btnThemeSong.style.display = "none";
    }
  }
  
  if (currentGachaType === "special") filterFn = c => String(c.Character_Gacha).startsWith("3");
  else if (currentGachaType === "pickup") filterFn = c => String(c.Character_Gacha) === "2";
  else {
      if(bg) {
          bg.style.animation = 'none';
          if (currentGachaType === "jp") {
              bg.style.backgroundImage = "url('https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/JPJP.png')";
          } else if (currentGachaType === "nonjp") {
              bg.style.backgroundImage = "url('https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/NONJP.png')";
          } else if (currentGachaType === "full") {
              bg.style.backgroundImage = "url('https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/FULLCAST.png')";
          } else {
              bg.style.backgroundImage = genericBg;
          }
      }
      updateGachaPityDisplay();
      return;
  }

  const targetChars = chars.filter(filterFn);
  if (targetChars.length > 0) {
      let idx = 0;
      
      const updateImage = () => {
          const char = targetChars[idx];
          if(bg) bg.style.backgroundImage = "url(" + char.Character_Image_Full + ")";
          
          const glaze = display.querySelector(".gacha-banner-glaze");
          if (glaze) {
              glaze.classList.remove("animate");
              void glaze.offsetWidth; // trigger reflow
              glaze.classList.add("animate");
          }
          const flash = display.querySelector(".gacha-banner-flash");
          if (flash && targetChars.length > 1) {
              flash.style.transition = 'none';
              flash.style.opacity = '1';
              void flash.offsetWidth;
              flash.style.transition = 'opacity 0.5s ease-out';
              flash.style.opacity = '0';
          }
          idx = (idx + 1) % targetChars.length;
      };
      
      updateImage(); // initial call
      if (targetChars.length > 1) {
          gachaBannerInterval = setInterval(updateImage, 4500);
      }
  } else {
      if(bg) bg.style.backgroundImage = genericBg;
  }
  updateGachaPityDisplay();
}

// === [가챠 연출 스킵 판정] ===
export function shouldSkipGachaPull(pull) {
  if (!pull) return false;
  if (!PlayerData.options || !PlayerData.options.skipDuplicateGacha) return false;
  // 새로 획득한 캐릭터는 무조건 연출 표시
  if (pull.bloomState === "new") return false;
  // 중복이더라도 SSR 허용 옵션이 켜져 있고 SSR이면 연출 표시
  if (PlayerData.options.allowDuplicateSSR && pull.rarity === "SSR") return false;
  // 그 외의 중복 카드는 연출 건너뛰기
  return true;
}

export function findNextPlayableGachaIndex(fromIndex) {
  for (let i = fromIndex; i < gachaCurrentResults.length; i++) {
    if (!shouldSkipGachaPull(gachaCurrentResults[i])) {
      return i;
    }
  }
  return gachaCurrentResults.length;
}

// === [가챠 천장(정가) 시스템] ===
export const GACHA_PITY_CONFIG = {
  special: 10,
  pickup: 10,
  jp: 15,
  nonjp: 15,
  full: 15
};

export function updateGachaPityDisplay() {
  const pityText = document.getElementById("gacha-pity-count");
  const btnExchange = document.getElementById("btn-gacha-exchange");
  const maxPity = GACHA_PITY_CONFIG[currentGachaType] || 15;
  let currentPity = (PlayerData.gachaPity && PlayerData.gachaPity[currentGachaType]) || 0;
  if (currentPity > maxPity) {
    currentPity = maxPity;
    if (PlayerData.gachaPity) PlayerData.gachaPity[currentGachaType] = maxPity;
  }

  if (pityText) {
    pityText.textContent = `${currentPity} / ${maxPity}`;
  }

  if (btnExchange) {
    if (currentPity >= maxPity) {
      btnExchange.style.opacity = "1";
      btnExchange.style.pointerEvents = "auto";
      btnExchange.style.cursor = "pointer";
      btnExchange.style.boxShadow = "0 0 15px rgba(245, 158, 11, 0.85)";
    } else {
      btnExchange.style.opacity = "0.45";
      btnExchange.style.pointerEvents = "none";
      btnExchange.style.cursor = "default";
      btnExchange.style.boxShadow = "none";
    }
  }
}

export function openGachaExchangeModal(bannerType) {
  const modal = document.getElementById("gacha-exchange-modal");
  const listEl = document.getElementById("gacha-exchange-list");
  const titleEl = document.getElementById("gacha-exchange-title");
  if (!modal || !listEl) return;

  const chars = (GameData.characters || []).filter(c => c && c.Character_Tier === "SSR" && c.Character_Image_Full && String(c.Character_Gacha).trim() !== "0");
  let targetChars = [];

  if (bannerType === "special") {
    targetChars = chars.filter(c => String(c.Character_Gacha).startsWith("3"));
    if (targetChars.length === 0) targetChars = chars;
    if (titleEl) titleEl.textContent = "스페셜 픽업 확정 교환";
  } else if (bannerType === "pickup") {
    targetChars = chars.filter(c => String(c.Character_Gacha) === "2");
    if (targetChars.length === 0) targetChars = chars;
    if (titleEl) titleEl.textContent = "픽업 확정 교환";
  } else if (bannerType === "jp") {
    const jpTags = ["0기생", "1기생", "2기생", "게이머즈", "3기생", "4기생", "네포라보", "HoloX"];
    targetChars = chars.filter(c => jpTags.some(tag => (c.Character_MainTag || "").includes(tag)) || (c.Character_Region || "").toUpperCase() === "JP");
    if (targetChars.length === 0) targetChars = chars;
    if (titleEl) titleEl.textContent = "JP 캐스팅 확정 교환";
  } else if (bannerType === "nonjp") {
    const nonjpTags = ["ReGloss", "FlowGlow", "EN_Myth", "EN_Promise", "EN_Advent", "EN_Justice", "ID"];
    targetChars = chars.filter(c => nonjpTags.some(tag => (c.Character_MainTag || "").includes(tag)) || (c.Character_Region || "").toUpperCase() !== "JP");
    if (targetChars.length === 0) targetChars = chars;
    if (titleEl) titleEl.textContent = "Non-JP 캐스팅 확정 교환";
  } else {
    targetChars = chars;
    if (titleEl) titleEl.textContent = "풀 캐스팅 확정 교환";
  }

  listEl.innerHTML = "";
  targetChars.forEach(char => {
    const card = document.createElement("div");
    card.className = "gacha-exchange-card";
    const isOwned = PlayerData.characters.includes(char.Character_ID);
    const bloomLevel = (PlayerData.characterStats && PlayerData.characterStats[char.Character_ID]?.bloom) || 0;
    const statusNote = isOwned ? (bloomLevel >= 5 ? "👑 개화 MAX (루비 50개)" : `✨ 보유중 (개화 Lv.${bloomLevel})`) : "🆕 미보유";

    card.innerHTML = `
      <img src="${char.Character_Image_Full || char.Character_Image}" alt="${char.Character_Name}">
      <div class="gacha-exchange-info">
        <div class="gacha-exchange-name">${char.Character_Name}</div>
        <div class="gacha-exchange-role">${char.Character_Role || char.Character_Class || ''}</div>
        <div style="font-size: 0.72rem; color: #facc15; margin-top: 2px;">${statusNote}</div>
      </div>
      <button class="gacha-exchange-select-btn" type="button">선택하기</button>
    `;

    card.querySelector(".gacha-exchange-select-btn").addEventListener("click", () => {
      executeGachaExchange(char, bannerType);
    });

    listEl.appendChild(card);
  });

  modal.style.display = "flex";
  modal.classList.add("show");
}

export function executeGachaExchange(char, bannerType) {
  if (!confirm(`[${char.Character_Name}] 캐릭터로 확정 교환을 진행하시겠습니까?`)) {
    return;
  }

  const maxPity = GACHA_PITY_CONFIG[bannerType] || 15;
  if (!PlayerData.gachaPity) PlayerData.gachaPity = {};
  PlayerData.gachaPity[bannerType] = Math.max(0, (PlayerData.gachaPity[bannerType] || 0) - maxPity);

  const charId = char.Character_ID;
  if (!PlayerData.characters.includes(charId)) {
    PlayerData.characters.push(charId);
    if (!PlayerData.characterStats) PlayerData.characterStats = {};
    PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
    alert(`🎉 [${char.Character_Name}] 캐릭터를 신규 영입했습니다!`);
  } else {
    if (!PlayerData.characterStats) PlayerData.characterStats = {};
    if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
    if (PlayerData.characterStats[charId].bloom === undefined) PlayerData.characterStats[charId].bloom = 0;

    if (PlayerData.characterStats[charId].bloom < 5) {
      PlayerData.characterStats[charId].bloom++;
      PlayerData.characterStats = { ...PlayerData.characterStats };
      alert(`🎉 [${char.Character_Name}] 캐릭터가 개화했습니다! (개화 레벨: ${PlayerData.characterStats[charId].bloom})`);
    } else {
      PlayerData.items["Item_039"] = (PlayerData.items["Item_039"] || 0) + 50;
      alert(`🎉 [${char.Character_Name}] 이미 개화 MAX 상태이므로 루비 50개가 지급되었습니다!`);
    }
  }

  const modal = document.getElementById("gacha-exchange-modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("show");
  }

  updateGachaPityDisplay();
}

// === [신규 계정 1회 특별 가챠 (1 SSR 확정, 6 스트라이커, 4 서포터 총 10장)] ===
export function triggerStarterSpecialGacha() {
  window._isStarterGachaActive = true;
  const chars = (GameData.characters || []).filter(c => String(c.Character_Gacha).trim() !== "0" && c.Character_Image_Full);
  if (chars.length < 10) {
    console.warn("캐릭터 데이터 부족으로 스타터 가챠를 건너뜁니다.");
    PlayerData.starterGachaCompleted = true;
    window._isStarterGachaActive = false;
    return;
  }

  const ssrPool = chars.filter(c => c.Character_Tier === "SSR");
  const guaranteedSSR = ssrPool.length > 0 ? ssrPool[Math.floor(Math.random() * ssrPool.length)] : chars[0];
  const ssrIsStriker = (guaranteedSSR.Character_Class || '').trim().includes('스트라이커') || (guaranteedSSR.Character_Class || '').trim() === '1';

  // 6 Strikers, 4 Supporters:
  // If SSR is striker: 1 SSR striker + 5 non-SSR strikers + 4 non-SSR supporters
  // If SSR is supporter: 6 non-SSR strikers + 1 SSR supporter + 3 non-SSR supporters
  const nonSSRStrikers = chars.filter(c => c.Character_Tier !== "SSR" && ((c.Character_Class || '').trim().includes('스트라이커') || (c.Character_Class || '').trim() === '1'));
  const nonSSRSupporters = chars.filter(c => c.Character_Tier !== "SSR" && ((c.Character_Class || '').trim().includes('서포터') || (c.Character_Class || '').trim() === '2'));

  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
  const sStrikers = shuffle(nonSSRStrikers.length >= 6 ? nonSSRStrikers : chars);
  const sSupporters = shuffle(nonSSRSupporters.length >= 4 ? nonSSRSupporters : chars);

  let selectedPulls = [];
  if (ssrIsStriker) {
    selectedPulls.push(guaranteedSSR);
    selectedPulls.push(...sStrikers.slice(0, 5));
    selectedPulls.push(...sSupporters.slice(0, 4));
  } else {
    selectedPulls.push(...sStrikers.slice(0, 6));
    selectedPulls.push(guaranteedSSR);
    selectedPulls.push(...sSupporters.slice(0, 3));
  }

  // Shuffle final 10 cards so SSR order is natural
  selectedPulls = shuffle(selectedPulls);

  gachaCurrentResults = [];
  window._isCurrentGachaAudition = false;

  for (const pickedChar of selectedPulls) {
    const rarity = pickedChar.Character_Tier;
    let pullResult = {
      id: pickedChar.Character_ID,
      rarity: rarity,
      img: pickedChar.Character_Image_Full,
      name: pickedChar.Character_Name,
      subName: pickedChar.Character_SubName,
      class: pickedChar.Character_Class,
      type: pickedChar.Character_Type,
      role: pickedChar.Character_Role,
      speech: pickedChar.Character_Gacha_Speech,
      fakeRarity: null,
      bloomState: "new",
      rubyReward: 0
    };

    if (pickedChar.Character_ID) {
      const charId = pickedChar.Character_ID;
      if (!PlayerData.characters.includes(charId)) {
        PlayerData.characters.push(charId);
        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
      } else {
        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
        if (PlayerData.characterStats[charId].bloom === undefined) PlayerData.characterStats[charId].bloom = 0;
        if (PlayerData.characterStats[charId].bloom < 5) {
          PlayerData.characterStats[charId].bloom++;
          PlayerData.characterStats = { ...PlayerData.characterStats };
          pullResult.bloomState = "up";
        } else {
          let rubyReward = pickedChar.Character_Tier === "SSR" ? 50 : 10;
          PlayerData.items["Item_039"] = (PlayerData.items["Item_039"] || 0) + rubyReward;
          pullResult.bloomState = "max";
          pullResult.rubyReward = rubyReward;
        }
      }
    }
    gachaCurrentResults.push(pullResult);
  }

  PlayerData.starterGachaCompleted = true;
  playOpeningSequence();
}
