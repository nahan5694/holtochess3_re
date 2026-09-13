import { GameData, PlayerData } from './state.js?v=004276';
import { openCharInfoModal } from './ui.js?v=004276';

let currentDeckIndex = 0;
let draggedCharId = null;
let draggedFromSlot = null;
let deckSortType = 'default';

// Utility for long press
function addClickWithDragThreshold(element, onClick) {
  let isDragging = false;
  let startX, startY;

  element.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
  });
  
  element.addEventListener('mousemove', (e) => {
    if (startX === undefined) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 5 || dy > 5) {
      isDragging = true;
    }
  });

  element.addEventListener('dragstart', (e) => {
      isDragging = true;
  });

  element.addEventListener('click', (e) => {
    if (!isDragging) {
      onClick(e);
    }
    startX = undefined;
  });
}


function initUnassignZone() {
    const zone = document.getElementById('deck-unassign-zone');
    if (!zone) return;
    
        zone.addEventListener('dragenter', (e) => {
        e.preventDefault();
    });
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.style.background = 'rgba(255, 100, 100, 0.9)';
    });
    zone.addEventListener('dragleave', (e) => {
        zone.style.background = 'rgba(255, 180, 180, 0.8)';
    });
        zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.background = 'rgba(255, 180, 180, 0.8)';
        if (draggedFromSlot) {
            PlayerData.decks[currentDeckIndex][draggedFromSlot.type][draggedFromSlot.idx] = "";
            if (window.savePlayerData) window.savePlayerData();
            draggedFromSlot = null; // Clear it here to prevent races
            draggedCharId = null;
            renderSlots();
            renderCharPool();
            if (typeof updateDeckInfo === 'function') updateDeckInfo();
        }
    });
}

function initDecks() {
  if (!PlayerData.decks || PlayerData.decks.length === 0) {
    PlayerData.decks = [];
    for (let i = 0; i < 24; i++) {
      PlayerData.decks.push({
        name: `유닛 ${i + 1}`,
        supporters: [null, null, null],
        strikers: [null, null, null, null, null],
        bgm: "Song_000"
      });
    }
  }
}

window.resetDeckSort = function() {
  deckSortType = 'default';
  const sortLabel = document.getElementById('deck-sort-label');
  if (sortLabel) sortLabel.textContent = "기본 정렬";
};

window.initDeckUI = function() {
  initDecks();
  initUnassignZone();

  const resetBtn = document.getElementById('btn-reset-deck');
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = true;
    resetBtn.addEventListener('click', () => {
      if (confirm('현재 덱의 모든 캐릭터 배치와 전투 BGM을 초기화하시겠습니까?')) {
        const deck = PlayerData.decks[currentDeckIndex];
        for(let i = 0; i < deck.supporters.length; i++) deck.supporters[i] = null;
        for(let i = 0; i < deck.strikers.length; i++) deck.strikers[i] = null;
        deck.bgm = 'default';
        renderCharPool();
        renderSlots();
        renderSelectedBgm();
        updateDeckInfo();
        savePlayerData();
      }
    });
  }
  
  // Setup custom sort dropdown
  const sortBtn = document.getElementById('deck-sort-btn');
  const sortOptions = document.getElementById('deck-sort-options');
  const sortLabel = document.getElementById('deck-sort-label');
  if (sortBtn && sortOptions && sortLabel) {
    // Map initial value to text
    const initOpt = sortOptions.querySelector(`.sort-option[data-sort="${deckSortType}"]`);
    if (initOpt) sortLabel.textContent = initOpt.textContent;
    
    sortBtn.onclick = (e) => {
      e.stopPropagation();
      sortOptions.classList.toggle('show');
    };
    
    sortOptions.querySelectorAll('.sort-option').forEach(opt => {
      opt.onclick = () => {
        deckSortType = opt.dataset.sort;
        sortLabel.textContent = opt.textContent;
        sortOptions.classList.remove('show');
        renderCharPool();
      };
    });
    
    document.addEventListener('click', (e) => {
      if (!sortBtn.contains(e.target)) {
        sortOptions.classList.remove('show');
      }
    });
  }

  renderDeckList();
  renderCharPool();
  renderSlots();
  window.updateDeckStartButtonVisibility();
}

window.updateDeckStartButtonVisibility = function() {
  if (typeof updateDeckInfo === 'function') {
    updateDeckInfo();
  }
};

window.getCurrentDeckIndex = function() {
  return currentDeckIndex;
};

window.getCurrentDeck = function() {
  return PlayerData.decks ? PlayerData.decks[currentDeckIndex] : null;
};

function assignCharToDeck(charId, type, index) {
  const deck = PlayerData.decks[currentDeckIndex];
  
  // Remove from existing slots if already assigned
  const suppIdx = deck.supporters.indexOf(charId);
  if (suppIdx !== -1) deck.supporters[suppIdx] = null;
  
  const strIdx = deck.strikers.indexOf(charId);
  if (strIdx !== -1) deck.strikers[strIdx] = null;
  
  deck[type][index] = charId;
}

function renderDeckList() {
  const container = document.getElementById('deck-list-container');
  if (!container) return;
  container.innerHTML = '';
  
  PlayerData.decks.forEach((deck, i) => {
    const item = document.createElement('div');
    item.className = `deck-list-item ${i === currentDeckIndex ? 'active' : ''}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'deck-name-text';
    nameSpan.style.pointerEvents = 'none';
    nameSpan.textContent = deck.name;
    
    const editBtn = document.createElement('span');
    editBtn.className = 'deck-edit-btn';
    editBtn.textContent = '✏️';
    editBtn.style.cursor = 'pointer';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt('덱 이름을 입력하세요:', deck.name);
      if (newName !== null && newName.trim() !== '') {
        deck.name = newName.trim();
        nameSpan.textContent = deck.name;
        if (window.savePlayerData) window.savePlayerData();
      }
    });
    
    item.appendChild(nameSpan);
    item.appendChild(editBtn);
    
    item.addEventListener('click', () => {
      currentDeckIndex = i;
      renderDeckList();
      renderSlots();
      renderCharPool();
    });
    
    container.appendChild(item);
  });
}

function renderCharPool() {
  const container = document.getElementById('deck-char-pool');
  if (!container) return;
  container.innerHTML = '';
  
  const ownedChars = GameData.characters.filter(c => PlayerData.characters.includes(c.Character_ID));
  
  const deck = PlayerData.decks[currentDeckIndex];
  const deployedIds = deck ? [...deck.supporters, ...deck.strikers].filter(Boolean) : [];
  
  function getNormName(name) {
    if (!name) return "";
    if (name === "쿠로카미 후부키") return "시라카미 후부키";
    return name;
  }
  
  const deployedNames = new Set();
  deployedIds.forEach(id => {
    const cObj = GameData.characters.find(x => x.Character_ID === id);
    if (cObj) deployedNames.add(getNormName(cObj.Character_Name));
  });
  
  // Sort and group
  let grouped = {};
  
  ownedChars.sort((a, b) => {
    const statA = PlayerData.characterStats[a.Character_ID] || { level: 1 };
    const statB = PlayerData.characterStats[b.Character_ID] || { level: 1 };
    const tierWeights = { "SSR": 3, "SR": 2, "R": 1, "N": 0 };
    
    const fallbackSort = () => {
        const ta = tierWeights[(a.Character_Tier || "").trim().toUpperCase()] || 0;
        const tb = tierWeights[(b.Character_Tier || "").trim().toUpperCase()] || 0;
        if (ta !== tb) return tb - ta;
        if (statB.level !== statA.level) return statB.level - statA.level;
        return (a.Character_ID || "").localeCompare(b.Character_ID || "");
    };

    if (deckSortType === 'level') {
      return fallbackSort();
    }
    else if (deckSortType === 'type') {
      const typeWeights = { "청초": 1, "게닌": 2, "쿨": 3, "아티스트": 4, "큐트": 5, "광기": 6, "에로": 7 };
      const wA = typeWeights[a.Character_Type] || 99;
      const wB = typeWeights[b.Character_Type] || 99;
      if (wA !== wB) return wA - wB;
      return fallbackSort();
    }
    else if (deckSortType === 'class') {
      const clsA = (a.Character_Role || "").split('/')[0].replace(/\s/g, "").trim();
      const clsB = (b.Character_Role || "").split('/')[0].replace(/\s/g, "").trim();
      const roleWeights = { "근거리딜러": 1, "원거리딜러": 2, "마법딜러": 3, "탱커": 4, "암살자": 5, "버퍼": 6, "디버퍼": 7, "힐러": 8 };
      const wA = roleWeights[clsA] || 99;
      const wB = roleWeights[clsB] || 99;
      if (wA !== wB) return wA - wB;
      return fallbackSort();
    }
    return fallbackSort();
  });
  
  const attrIcons = {
    "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
    "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
    "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
    "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
    "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
    "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
    "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
  };

  ownedChars.forEach(char => {
    const charStats = PlayerData.characterStats[char.Character_ID] || { star: 1, level: 1, condition: 100 };
    
    // Determine group key
    let gKey = "기타 역할군";
    let iconUrl = null;
    
    if (deckSortType === 'default') {
      gKey = char.Character_Tier || "N";
    }
    else if (deckSortType === 'level') {
      gKey = "레벨";
    }
    else if (deckSortType === 'type') {
      gKey = char.Character_Type || "속성";
      iconUrl = attrIcons[gKey];
    }
    else if (deckSortType === 'class') {
       gKey = (char.Character_Role || "").split('/')[0].trim() || "기타 역할군";
    }
    
    if (!grouped[gKey]) grouped[gKey] = { icon: iconUrl, chars: [] };
    grouped[gKey].chars.push(char);
  });
  
  Object.keys(grouped).forEach(k => {
    const grp = grouped[k];
    const header = document.createElement('div');
    header.className = 'deck-pool-header';
    header.id = 'deck-group-' + k;
    if (grp.icon) {
       header.innerHTML = `<img src="${grp.icon}"> <span>${k}</span>`;
    } else {
       header.textContent = k;
    }
    if (deckSortType !== 'level') {
        container.appendChild(header);
    }
    
    grp.chars.forEach(char => {
      const charStats = PlayerData.characterStats[char.Character_ID] || { star: 1, level: 1, condition: 100 };
      const cond = charStats.condition !== undefined ? charStats.condition : 100;
      const isCondLow = cond <= 25;
      const card = document.createElement("div");
      
      const isDeployedExactly = deployedIds.includes(char.Character_ID);
      const isDeployedName = !isDeployedExactly && deployedNames.has(getNormName(char.Character_Name));
      
      card.className = `holomem-card card-${(char.Character_Tier || "N").toLowerCase()}`;
      card.draggable = !(isDeployedExactly || isDeployedName || isCondLow);
      
      const deployedHtml = isDeployedExactly 
        ? `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); z-index: 5; display:flex; align-items:center; justify-content:center; color:white; font-size: 1.5rem; font-weight:bold; pointer-events: none; border-radius: 10px;">배치중</div>` 
        : (isDeployedName 
            ? `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(230,126,34,0.7); z-index: 5; display:flex; align-items:center; justify-content:center; color:white; font-size: 1.1rem; font-weight:bold; text-align: center; pointer-events: none; padding: 10px; box-sizing: border-box; border-radius: 10px;">동일 캐릭터<br>배치 불가</div>` 
            : (isCondLow 
               ? `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(231,76,60,0.7); z-index: 5; display:flex; align-items:center; justify-content:center; color:white; font-size: 1.1rem; font-weight:bold; text-align: center; pointer-events: none; padding: 10px; box-sizing: border-box; border-radius: 10px;">컨디션 부족</div>`
               : ""));

      card.addEventListener('dragstart', (e) => {
                draggedCharId = char.Character_ID;
        card.classList.add('dragging');
        
        const ghostTarget = card.querySelector('.drag-ghost-target');
        if (ghostTarget) {
            e.dataTransfer.setDragImage(ghostTarget, 60, 90);
        }
        const role = (char.Character_Role || '') + ' ' + (char.Character_Class || '');
        document.querySelectorAll('.deck-slot').forEach(slot => {
           const isSupporter = slot.classList.contains('supporter-slot');
           const isStriker = slot.classList.contains('striker-slot');
           if ((role.includes('서포터') && isSupporter) || (role.includes('스트라이커') && isStriker)) {
              slot.style.border = '2px dashed #f1c40f';
           } else {
              slot.classList.add('locked');
           }
        });
      });
      
      card.addEventListener('dragend', (e) => {
        draggedCharId = null;
        card.classList.remove('dragging');
        document.querySelectorAll('.deck-slot').forEach(slot => {
           slot.style.border = '';
           slot.classList.remove('locked');
        });
      });
      
      addClickWithDragThreshold(card, () => {
        openCharInfoModal(char, true);
      });
      const typeIcon = attrIcons[char.Character_Type] || "";
      const typeBadgeHtml = typeIcon ? `<div class="holomem-card-type-badge"><img src="${typeIcon}" alt="${char.Character_Type}"></div>` : "";

      let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
      const stars = Math.max(1, charStats.star || 1);
      let starsHtml = "";
      for(let i = 0; i < stars; i++) {
        starsHtml += `<img src="${starIconUrl}" style="width: 24px; height: 24px; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8)); margin-left: -2px;">`;
      }
      const starBadgeHtml = `
        <div style="position: absolute; top: -10px; right: 10px; z-index: 10; display:flex;">
          ${starsHtml}
        </div>
      `;
      let condColor = '#f1c40f'; // Default yellow
      let condBg = 'rgba(0,0,0,0.6)';
      if (cond <= 25) condColor = '#e74c3c'; // strong red
      else if (cond <= 50) condColor = '#e67e22'; // distinct orange
      const condHtml = `<div class="holomem-card-cond-badge" style="color: ${condColor}; background: ${condBg};">⚡ ${Math.floor(cond)}</div>`;
      const levelHtml = `<div class="holomem-card-level">Lv. ${charStats.level || 1}</div>`;

      const roles = (char.Character_Role || "").split('/').map(s => s.trim()).filter(Boolean);
      let rolesHtml = "";
      roles.forEach(r => {
        const rRaw = r.replace(/ /g, '');
        rolesHtml += `<div class="holomem-card-class-badge card-class-${rRaw}">${r}</div>`;
      });
      const classes = (char.Character_Class || "").split('/').map(s => s.trim()).filter(Boolean);
      let classesHtml = "";
      classes.forEach(c => {
        const cRaw = c.replace(/ /g, '');
        classesHtml += `<div class="holomem-card-class-badge card-class-${cRaw}">${c}</div>`;
      });

      card.innerHTML = `
        ${typeBadgeHtml}
        ${starBadgeHtml}
        
        <div class="holomem-card-inner">
          ${deployedHtml}
          <img class="holomem-card-bg" src="${char.Character_Image_Full}" loading="lazy" style="object-fit: cover; object-position: center 20%;">\n          <img class="drag-ghost-target" src="${char.Character_Image_Long || char.Character_Image_Full}" style="position:absolute; top:-9999px; left:-9999px; width:120px; height:180px; object-fit:contain; opacity:0.01;">
          <div class="holomem-card-gradient"></div>
          <div class="holomem-card-info" style="padding-bottom: 8px;">
            <div class="holomem-card-subname" style="margin-bottom: 0;">${char.Character_SubName || ''}</div>
            <div class="holomem-card-name" style="margin-bottom: 2px;">${char.Character_Name}</div>
            <div class="holomem-card-bottom-row" style="position: relative;">
              <div style="display: flex; gap: 4px; align-items: center; z-index: 4;">
                ${levelHtml}
                ${condHtml}
              </div>
              <div style="position: absolute; right: 0; bottom: 0; text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                <div class="holomem-card-rarity ui-rarity-${(char.Character_Tier || "N").toLowerCase()}">${char.Character_Tier}</div>
                <div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
                  ${rolesHtml}
                  ${classesHtml}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      container.appendChild(card);
    });
  });

  // Render Shortcuts for Deck
  const sceneEl = document.getElementById("scene-deck");
  if (sceneEl) {
      let oldBar = sceneEl.querySelector(".shortcut-sidebar");
      if (oldBar) oldBar.remove();

      if (deckSortType === "type" || deckSortType === "class") {
          const sidebar = document.createElement("div");
          sidebar.className = "shortcut-sidebar";
          sidebar.style.cssText = "position: absolute; top: 50%; left: 10px; transform: translateY(-50%); display: flex; flex-direction: column; gap: 10px; z-index: 1000;";
          
          Object.keys(grouped).forEach(k => {
              const grp = grouped[k];
              const btn = document.createElement("div");
              btn.style.cssText = "width: 45px; height: 45px; border-radius: 50%; background: rgba(255, 255, 255, 0.85); border: 2px solid #3498db; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 0.75rem; font-weight: bold; color: #333; transition: transform 0.2s; text-align: center; line-height: 1.1; white-space: pre-line;";
              
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
              if (deckSortType === "type" && grp.icon) {
                  btn.innerHTML = `<img src="${grp.icon}" alt="${k}" style="width:26px; height:26px;">`;
              } else {
                  const rKey = k.replace(" 클래스", "").replace(/\s/g, "").trim();
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
                  const header = document.getElementById("deck-group-" + k);
                  if (header) {
                      const scrollContainer = document.querySelector(".deck-pool-area");
                      if (scrollContainer) {
                          scrollContainer.scrollTo({ top: header.offsetTop - scrollContainer.offsetTop - 15, behavior: 'smooth' });
                      }
                  }
              };
              sidebar.appendChild(btn);
          });
          sceneEl.appendChild(sidebar);
      }
  }
}

function renderSlots() {
  updateDeckInfo();
  const deck = PlayerData.decks[currentDeckIndex];
  
  document.querySelectorAll('.supporter-slot').forEach(slot => {
    const idx = parseInt(slot.getAttribute('data-slot'));
    const charId = deck.supporters[idx];
    renderSingleSlot(slot, charId, 'supporters', idx);
  });
  
  document.querySelectorAll('.striker-slot').forEach(slot => {
    const idx = parseInt(slot.getAttribute('data-slot'));
    const charId = deck.strikers[idx];
    renderSingleSlot(slot, charId, 'strikers', idx);
  });
}

function renderSingleSlot(slot, charId, type, idx) {
  slot.innerHTML = '';
  if (!charId) {
    slot.innerHTML = `<div style="color: rgba(0,0,0,0.3); font-size: 2em;">+</div>`;
    const newSlot = slot.cloneNode(true);
    setupSlotDragDrop(newSlot, charId, type, idx);
    slot.parentNode.replaceChild(newSlot, slot);
    return;
  }
  
  const char = GameData.characters.find(c => c.Character_ID === charId);
  const imgUrl = char.Character_Image_Long || char.Character_Image_Full; // fallback
  
  const charStats = PlayerData.characterStats[char.Character_ID] || { star: 1, level: 1, bloom: 0, condition: 100 };
  const cond = charStats.condition !== undefined ? charStats.condition : 100;
  const isCondLow = cond <= 25;
  
  // Stars
  let starIconUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png';
  const stars = Math.max(1, charStats.star || 1);
  let starsHtml = "";
  for(let i = 0; i < stars; i++) {
    starsHtml += `<img src="${starIconUrl}">`;
  }
  
  // Badges
  const roles = (char.Character_Role || "").split('/').map(s => s.trim()).filter(Boolean);
  let rolesHtml = "";
  roles.forEach(r => {
    if (r === '스트라이커' || r === '서포터') return;
    const rRaw = r.replace(/ /g, '');
    rolesHtml += `<div class="holomem-card-class-badge card-class-${rRaw}">${r}</div>`;
  });
  const classes = (char.Character_Class || "").split('/').map(s => s.trim()).filter(Boolean);
  let classesHtml = "";
  classes.forEach(cls => {
    if (cls === '스트라이커' || cls === '서포터') return;
    const cRaw = cls.replace(/ /g, '');
    classesHtml += `<div class="holomem-card-class-badge card-class-${cRaw}">${cls}</div>`;
  });
  
  // Bloom icon (using star or a flower icon depending on assets, fallback to flower emoji if not available, but let's use the provided type badge if possible? The image shows a bloom badge)
  // Let's use a flower emoji 🌸 for bloom
  const bloomHtml = `<div class="deck-slot-bloom">🌸 ${charStats.bloom || 0}</div>`;
  
  // Type icon for top badge
  const attrIcons = {
    "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
    "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
    "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
    "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
    "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
    "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
    "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
  };
  const typeIcon = attrIcons[char.Character_Type] || "";
  const topBadgeHtml = typeIcon ? `<div class="deck-slot-top-badge"><img src="${typeIcon}"></div>` : "";

  slot.innerHTML = `
    <div class="deck-slot-img" style="background-image: url('${imgUrl}'); background-size: cover; background-position: center;"></div>
    <div class="deck-slot-gradient"></div>
    ${topBadgeHtml}
    <div class="deck-slot-stars">
      ${starsHtml}
    </div>
    
    
    <div class="deck-slot-bottom-left">
      <div class="holomem-card-cond-badge" style="color: ${cond <= 25 ? '#ff6b6b' : (cond <= 50 ? '#feca57' : '#f1c40f')}; background: rgba(0,0,0,0.6); width: fit-content;">⚡ ${Math.floor(cond)}</div>
      ${bloomHtml}
      <div class="holomem-card-level" style="width: fit-content;">Lv. ${charStats.level || 1}</div>
    </div>
    <div class="deck-slot-bottom-right">
      ${classesHtml}
      ${rolesHtml}
    </div>
  `;
  
  if (charId) {
    slot.setAttribute('draggable', 'true');
  } else {
    slot.removeAttribute('draggable');
  }
  const newSlot = slot.cloneNode(true);
  setupSlotDragDrop(newSlot, charId, type, idx);
  slot.parentNode.replaceChild(newSlot, slot);
  addClickWithDragThreshold(newSlot, () => {
    openCharInfoModal(char, true);
  });
  }

function getDeckIssueConstraints() {
  const ctx = window.pendingBattleContext;
  if (!ctx || !ctx.activeIssues || !Array.isArray(ctx.activeIssues)) {
    return { maxSsrAllowed: 8, reqKizuna: 0, hasShackles: false, hasTaetae: false };
  }
  const issues = ctx.activeIssues;
  let maxSsrAllowed = 8;
  let hasShackles = false;

  // Rehearsal Shackles (리허설 족쇄)
  if (issues.includes('Issue_055')) {
    maxSsrAllowed = Math.min(maxSsrAllowed, 2);
    hasShackles = true;
  } else if (issues.includes('Issue_054')) {
    maxSsrAllowed = Math.min(maxSsrAllowed, 4);
    hasShackles = true;
  } else if (issues.includes('Issue_053')) {
    maxSsrAllowed = Math.min(maxSsrAllowed, 6);
    hasShackles = true;
  }

  // Live Shackles (라이브 족쇄 Issue_052: 중첩당 SSR 슬롯 1명 제한)
  const liveShackleCount = issues.filter(id => id === 'Issue_052').length;
  if (liveShackleCount > 0) {
    maxSsrAllowed = Math.min(maxSsrAllowed, Math.max(0, 8 - liveShackleCount));
    hasShackles = true;
  }

  // Rehearsal Kizuna synergy requirement (리허설 테에테에)
  let reqKizuna = 0;
  let hasTaetae = false;
  if (issues.includes('Issue_058')) {
    reqKizuna = Math.max(reqKizuna, 18);
    hasTaetae = true;
  } else if (issues.includes('Issue_057')) {
    reqKizuna = Math.max(reqKizuna, 12);
    hasTaetae = true;
  } else if (issues.includes('Issue_056')) {
    reqKizuna = Math.max(reqKizuna, 8);
    hasTaetae = true;
  }

  return { maxSsrAllowed, reqKizuna, hasShackles, hasTaetae };
}

function updateDeckInfo() {
  const container = document.getElementById('deck-info-container');
  if (!container) return;
  initDecks();
  if (!PlayerData.decks || !PlayerData.decks[currentDeckIndex]) return;
  const deck = PlayerData.decks[currentDeckIndex];
  
  let count = 0;
  let totalLevel = 0;
  let ssrCount = 0;
  
  const allSlots = [...deck.supporters, ...deck.strikers];
  allSlots.forEach(id => {
    if (id) {
      count++;
      const stat = PlayerData.characterStats[id] || {level: 1};
      totalLevel += (stat.level || 1);
      const charObj = GameData.characters && GameData.characters.find(c => c.Character_ID === id);
      if (charObj && (charObj.Character_Tier || '').trim().toUpperCase() === 'SSR') {
        ssrCount++;
      }
    }
  });
  
  const kizunaData = calculateDeckKizuna(deck);
  const isFull = count === 8;
  const constraints = getDeckIssueConstraints();
  const isSsrViolated = constraints.hasShackles && (ssrCount > constraints.maxSsrAllowed);
  const isKizunaViolated = constraints.hasTaetae && (kizunaData.totalScore < constraints.reqKizuna);
  
  container.innerHTML = `
    <div style="font-size: 1.1rem; font-weight: bold; color: #2c3e50; border-bottom: 2px solid rgba(0,0,0,0.1); padding-bottom: 5px;">
      편성 정보
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-top: 10px; margin-bottom: 5px;">
      <span>편성 인원:</span>
      <span style="font-weight: bold; color: ${isFull ? '#27ae60' : '#e74c3c'}">${count} / 8</span>
    </div>
    ${!isFull ? `<div style="color: #e74c3c; font-size: 0.8rem; text-align: right;">(8명이 아니면 출전 불가)</div>` : ''}
    ${constraints.hasShackles ? `
      <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-top: 6px; margin-bottom: 5px;">
        <span>🔒 SSR 편성 (족쇄):</span>
        <span style="font-weight: bold; color: ${isSsrViolated ? '#e74c3c' : '#27ae60'}">${ssrCount} / ${constraints.maxSsrAllowed}명</span>
      </div>
      ${isSsrViolated ? `<div style="color: #e74c3c; font-size: 0.8rem; text-align: right;">(최대 ${constraints.maxSsrAllowed}명까지만 편성 가능)</div>` : ''}
    ` : ''}
    ${constraints.hasTaetae ? `
      <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-top: 6px; margin-bottom: 5px;">
        <span>🤝 키즈나 시너지 (테에테에):</span>
        <span style="font-weight: bold; color: ${isKizunaViolated ? '#e74c3c' : '#27ae60'}">${kizunaData.totalScore} / ${constraints.reqKizuna}점</span>
      </div>
      ${isKizunaViolated ? `<div style="color: #e74c3c; font-size: 0.8rem; text-align: right;">(최소 ${constraints.reqKizuna}점 이상 필요)</div>` : ''}
    ` : ''}
    <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-top: 10px; margin-bottom: 15px;">
      <span>합계 레벨:</span>
      <span style="font-weight: bold;">${totalLevel}</span>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <button id="btn-deck-kizuna" class="circle-btn" style="width: 100%; border-radius: 8px; padding: 12px; font-size: 1.05rem; font-weight: bold; background: #2d3436; color: #f1c40f; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: 0.2s;">⭐ ${kizunaData.totalScore} 키즈나</button>
      <button id="btn-deck-song" class="circle-btn" style="width: 100%; border-radius: 8px; padding: 12px; font-size: 1.05rem; font-weight: bold; background: #2d3436; color: #74b9ff; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: 0.2s;">🎵 전투 BGM 변경</button>
    </div>
    
    <div style="margin-top: 10px; font-size: 0.85rem; color: #555; text-align: center;">
      현재 BGM: <span id="deck-current-bgm-name" style="font-weight: bold; color: #0984e3;"></span>
    </div>
    
    <div style="flex: 1;"></div>
    
    ${(() => {
      const assignedIds = [...(deck.supporters || []), ...(deck.strikers || [])].filter(Boolean);
      const tooTiredIds = assignedIds.filter(cid => {
        const st = PlayerData.characterStats && PlayerData.characterStats[cid];
        const cond = st && st.condition !== undefined ? st.condition : 100;
        return cond <= 25;
      });
      const hasTooTired = tooTiredIds.length > 0;

      if (!window.pendingBattleContext) {
        return `
          <button id="btn-deck-battle-action" disabled style="width: 100%; border-radius: 8px; padding: 12px; font-size: 1.05rem; font-weight: bold; background: #95a5a6; color: white; border: none; opacity: 0.6; cursor: not-allowed; margin-top: 10px;">
            전투 시작
          </button>
        `;
      }
      if (!isFull) {
        return `
          <button id="btn-deck-battle-action" disabled style="width: 100%; border-radius: 8px; padding: 12px; font-size: 1rem; font-weight: bold; background: #95a5a6; color: white; border: none; opacity: 0.6; cursor: not-allowed; margin-top: 10px;">
            전투 시작 (8인 편성 필요)
          </button>
        `;
      }
      if (hasTooTired) {
        return `
          <button id="btn-deck-battle-action" disabled style="width: 100%; border-radius: 8px; padding: 12px; font-size: 0.95rem; font-weight: bold; background: #c0392b; color: white; border: 1px solid #e74c3c; opacity: 0.85; cursor: not-allowed; margin-top: 10px;">
            🚫 출전 불가 (컨디션 25 이하)
          </button>
        `;
      }
      if (isSsrViolated) {
        return `
          <button id="btn-deck-battle-action" disabled style="width: 100%; border-radius: 8px; padding: 12px; font-size: 0.92rem; font-weight: bold; background: #c0392b; color: white; border: 1px solid #e74c3c; opacity: 0.85; cursor: not-allowed; margin-top: 10px;">
            🚫 출전 불가 (족쇄: SSR ${ssrCount}/${constraints.maxSsrAllowed}명)
          </button>
        `;
      }
      if (isKizunaViolated) {
        return `
          <button id="btn-deck-battle-action" disabled style="width: 100%; border-radius: 8px; padding: 12px; font-size: 0.92rem; font-weight: bold; background: #c0392b; color: white; border: 1px solid #e74c3c; opacity: 0.85; cursor: not-allowed; margin-top: 10px;">
            🚫 출전 불가 (테에테에: 키즈나 ${kizunaData.totalScore}/${constraints.reqKizuna}점)
          </button>
        `;
      }
      return `
        <button id="btn-deck-battle-action" class="execute-btn" style="width: 100%; border-radius: 8px; padding: 12px; font-size: 1.05rem; font-weight: bold; background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; border: 2px solid #ff7675; box-shadow: 0 4px 10px rgba(231,76,60,0.3); cursor: pointer; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>⚔️</span> <span>전투 시작</span>
        </button>
      `;
    })()}
  `;

  // Bind Kizuna button
  const btnDeckKizuna = container.querySelector('#btn-deck-kizuna');
  if (btnDeckKizuna) {
      btnDeckKizuna.addEventListener('click', () => openDeckKizunaModal(kizunaData));
  }
  
  // Bind BGM button
  const btnDeckSong = container.querySelector('#btn-deck-song');
  if (btnDeckSong) {
      btnDeckSong.addEventListener('click', openDeckSongModal);
  }
  
  // Show current BGM name
  const bgmNameEl = container.querySelector('#deck-current-bgm-name');
  if (bgmNameEl) {
      const currentBgmId = deck.bgm || "Song_000";
      if (currentBgmId === 'random') {
          bgmNameEl.textContent = "🎲 랜덤 재생";
      } else {
          const songInfo = GameData.songs ? GameData.songs.find(s => s.Song_ID === currentBgmId) : null;
          bgmNameEl.textContent = songInfo ? songInfo.Song_Name : currentBgmId;
      }
  }

  // Bind 7 o'clock battle action button
  const btnBattleAction = container.querySelector('#btn-deck-battle-action');
  if (btnBattleAction && window.pendingBattleContext && isFull) {
    btnBattleAction.addEventListener('click', () => {
      const curDeck = PlayerData.decks ? PlayerData.decks[currentDeckIndex] : null;
      if (!curDeck) return;
      const strikers = (curDeck.strikers || []).filter(Boolean);
      const supporters = (curDeck.supporters || []).filter(Boolean);
      if (strikers.length < 5 || supporters.length < 3) {
        alert("덱에 8명의 캐릭터(스트라이커 5명, 서포터 3명)가 모두 편성되어야 출전할 수 있습니다!");
        return;
      }

      const assigned = [...supporters, ...strikers];
      const lowCondChars = assigned.filter(cid => {
        const st = PlayerData.characterStats && PlayerData.characterStats[cid];
        const cond = st && st.condition !== undefined ? st.condition : 100;
        return cond <= 25;
      });
      if (lowCondChars.length > 0) {
        const names = lowCondChars.map(cid => {
          const c = (GameData.characters || []).find(ch => ch.Character_ID === cid);
          return c ? c.Character_Name : cid;
        }).join(', ');
        alert(`컨디션이 25 이하인 캐릭터는 전투에 출전할 수 없습니다!\n(해당 캐릭터: ${names})`);
        return;
      }

      // 족쇄 및 테에테에 제약 검증
      const curConstraints = getDeckIssueConstraints();
      let currentSsrCount = 0;
      assigned.forEach(id => {
        const charObj = GameData.characters && GameData.characters.find(c => c.Character_ID === id);
        if (charObj && (charObj.Character_Tier || '').trim().toUpperCase() === 'SSR') {
          currentSsrCount++;
        }
      });
      if (curConstraints.hasShackles && currentSsrCount > curConstraints.maxSsrAllowed) {
        alert(`[이슈 제약: 족쇄] SSR 캐릭터는 최대 ${curConstraints.maxSsrAllowed}명까지만 편성할 수 있습니다!\n(현재 편성된 SSR: ${currentSsrCount}명)`);
        return;
      }

      const curKizunaData = calculateDeckKizuna(curDeck);
      if (curConstraints.hasTaetae && curKizunaData.totalScore < curConstraints.reqKizuna) {
        alert(`[이슈 제약: 테에테에] 덱 키즈나 시너지 점수가 부족합니다!\n(요구: ${curConstraints.reqKizuna}점, 현재: ${curKizunaData.totalScore}점)`);
        return;
      }

      if (!window.pendingBattleContext) {
        alert("출전할 스테이지 정보가 없습니다.");
        return;
      }

      const ctx = window.pendingBattleContext;
      if (ctx.apCost && (PlayerData.ap || 0) < ctx.apCost) {
        alert(`AP가 부족합니다. (필요: ${ctx.apCost} AP, 보유: ${PlayerData.ap || 0} AP)`);
        return;
      }

      // 리허설 모드: 편성 캐릭터 8인의 레벨 합계가 스테이지 기준 레벨 합계(Stage_Level × 8)를 초과할 경우 감액 패널티 검증 및 경고 안내
      if (ctx.type === 'rehearsal' && ctx.stage) {
        const stageLevel = parseInt(ctx.stage.Stage_Level, 10) || 1;
        let totalCharLevel = 0;
        assigned.forEach(cid => {
          const st = PlayerData.characterStats && PlayerData.characterStats[cid];
          totalCharLevel += (st && st.level) ? Number(st.level) : 1;
        });

        const levelDiff = totalCharLevel - (stageLevel * 8);
        let penaltyRate = 0;
        if (levelDiff >= 250) penaltyRate = 90;
        else if (levelDiff >= 200) penaltyRate = 75;
        else if (levelDiff >= 150) penaltyRate = 50;

        ctx.deckTotalLevel = totalCharLevel;
        ctx.stageLevel = stageLevel;
        ctx.levelDiff = levelDiff;
        ctx.levelPenaltyRate = penaltyRate;

        if (penaltyRate > 0) {
          const msg = `⚠️ [레벨 초과 보상 감액 경고]\n\n` +
            `현재 편성 캐릭터 8인의 레벨 합계: Lv.${totalCharLevel}\n` +
            `스테이지 기준 레벨 합계: Lv.${stageLevel * 8} (${stageLevel} × 8인)\n` +
            `기준 초과 레벨: +${levelDiff} (150레벨 이상 초과)\n\n` +
            `해당 스테이지 클리어 시 기본 보상(Stage_Reward)이 ${penaltyRate}% 감소(올림 처리)됩니다.\n\n` +
            `전투를 계속 진행하시겠습니까?`;
          if (!confirm(msg)) {
            return;
          }
        }
      }

      btnBattleAction.disabled = true;
      setTimeout(() => {
        if (btnBattleAction) btnBattleAction.disabled = false;
      }, 1500);

      if (typeof window.startBattleWithConfig === 'function') {
        window.startBattleWithConfig(ctx);
      } else {
        alert("전투 시스템을 초기화하는 중입니다. 잠시 후 다시 시도해주세요.");
      }
    });
  }
}


function setupSlotDragDrop(slot, charId, type, idx) {
  slot.addEventListener('dragstart', (e) => {
    if (!charId) return;
    draggedCharId = charId;
    draggedFromSlot = { type, idx };
    document.getElementById('deck-char-pool').style.display = 'none';
    document.getElementById('deck-unassign-zone').style.display = 'flex';
  });

  slot.addEventListener('dragend', (e) => {
    setTimeout(() => {
        document.getElementById('deck-char-pool').style.display = 'grid';
        document.getElementById('deck-unassign-zone').style.display = 'none';
        draggedFromSlot = null;
        draggedCharId = null;
    }, 200);
  });

  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!slot.classList.contains('locked')) {
      slot.classList.add('drag-over');
    }
  });
  
  slot.addEventListener('dragleave', (e) => {
    slot.classList.remove('drag-over');
  });
  
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    if (slot.classList.contains('locked')) return;
    if (!draggedCharId) return;
    
    const targetType = slot.classList.contains('supporter-slot') ? 'supporters' : 'strikers';
    const targetIndex = parseInt(slot.getAttribute('data-slot'));
    
    // If dragging from another slot, clear the old slot first
    if (draggedFromSlot) {
        PlayerData.decks[currentDeckIndex][draggedFromSlot.type][draggedFromSlot.idx] = "";
    }
    
    assignCharToDeck(draggedCharId, targetType, targetIndex);
    renderSlots();
    renderCharPool();
    if (typeof updateDeckInfo === 'function') updateDeckInfo();
  });
}

function openDeckSongModal() {
    const modal = document.getElementById("deck-song-modal");
    const listContainer = document.getElementById("deck-song-list-container");
    if (!modal || !listContainer) return;
    
    modal.classList.add("show");
    listContainer.innerHTML = "";
    
    const allSongs = GameData.songs || [];
    const ownedSongs = PlayerData.songs || [];
    const deck = PlayerData.decks[currentDeckIndex];
    let currentDeckBgm = deck.bgm || "Song_000";

    // 1. Top item: Random Play option
    const isRandomSelected = (currentDeckBgm === 'random');
    const randomRow = document.createElement("div");
    randomRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 15px; border-radius: 8px; background: rgba(0,0,0,0.05);
        border: 2px solid ${isRandomSelected ? '#00a8ff' : '#ccc'};
        cursor: pointer; transition: 0.2s;
        box-shadow: ${isRandomSelected ? '0 0 10px rgba(0,168,255,0.4)' : 'none'};
        margin-bottom: 10px;
    `;
    randomRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="font-size: 24px;">🎲</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <div style="font-weight: bold; font-size: 1.1rem; color: #333;">랜덤 노래 재생</div>
                <div style="font-size: 0.85rem; color: #666;">전투 시작 시 및 곡 종료 시마다 무작위 자동 전환</div>
            </div>
        </div>
        <div>
            ${isRandomSelected ? '<span style="color: #00a8ff; font-weight: bold;">[적용 중]</span>' : '<span style="color: transparent; font-weight: bold;">[적용 중]</span>'}
        </div>
    `;
    randomRow.addEventListener("click", () => {
        deck.bgm = 'random';
        if (window.savePlayerData) window.savePlayerData();
        modal.classList.remove("show");
        updateDeckInfo();
    });
    listContainer.appendChild(randomRow);
    
    allSongs.forEach(song => {
        if (!ownedSongs.includes(song.Song_ID)) return;
        
        const isSelected = (currentDeckBgm === song.Song_ID);
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
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="font-weight: bold; font-size: 1.1rem; color: #333;">${song.Song_Name}</div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">${(song.Song_Singer || "미상").split("/").map(s => `<div style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; width: fit-content;">${s.trim()}</div>`).join("")}</div>
                </div>
            </div>
            <div>
                ${isSelected ? '<span style="color: #00a8ff; font-weight: bold;">[적용 중]</span>' : '<span style="color: transparent; font-weight: bold;">[적용 중]</span>'}
            </div>
        `;
        
        row.addEventListener("click", () => {
            deck.bgm = song.Song_ID;
            if (window.savePlayerData) window.savePlayerData();
            modal.classList.remove("show");
            updateDeckInfo(); // refresh UI
        });
        
        listContainer.appendChild(row);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const btnCloseDeckSong = document.getElementById("btn-close-deck-song");
    if (btnCloseDeckSong) {
        btnCloseDeckSong.addEventListener("click", () => {
            const modal = document.getElementById("deck-song-modal");
            if (modal) modal.classList.remove("show");
        });
    }
});

function calculateDeckKizuna(deck) {
  let totalScore = 0;
  const activeTags = [];
  if (!GameData.tag || !GameData.characters) return { totalScore, activeTags };

  const tagCounts = {};
  const allSlots = [...deck.supporters, ...deck.strikers].filter(Boolean);
  
  allSlots.forEach(charId => {
    const char = GameData.characters.find(c => c.Character_ID === charId);
    if (!char) return;
    
    const mainTags = (char.Character_MainTag || "").split('/').map(s => s.trim()).filter(Boolean);
    const subTags = (char.Character_SubTag || "").split('/').map(s => s.trim()).filter(Boolean);
    const charTags = new Set([...mainTags, ...subTags]);
    
    charTags.forEach(tagName => {
      if (tagName === '스트라이커' || tagName === '서포터') return;
      tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
    });
  });
  
  Object.keys(tagCounts).forEach(tagName => {
    const count = tagCounts[tagName];
    const tagData = GameData.tag.find(t => t.Tag_Name === tagName);
    if (!tagData) return;
    
    const type = tagData.Tag_Type || "";
    const cap = parseInt(tagData.Tag_Cap) || 0;
    
    let score = 0;
    let stage = 0;
    
    if (type.includes('2인 완성')) {
      if (count >= 2) {
        score = 2;
        stage = 1;
      }
    } else {
      if (cap === 3) {
        if (count >= 3) { score = 3; stage = 1; }
      } else if (cap === 4) {
        if (count >= 4) { score = 6; stage = 2; }
        else if (count >= 2) { score = 2; stage = 1; }
      } else if (cap === 5) {
        if (count >= 5) { score = 9; stage = 2; }
        else if (count >= 3) { score = 3; stage = 1; }
      } else if (cap >= 6 && cap <= 8) {
        if (count >= 6) { score = 12; stage = 2; }
        else if (count >= 3) { score = 3; stage = 1; }
      } else if (cap >= 9) {
        if (count >= 8) { score = 20; stage = 3; }
        else if (count >= 6) { score = 12; stage = 2; }
        else if (count >= 3) { score = 3; stage = 1; }
      }
    }
    
    if (count > 0) {
      totalScore += score;
      
      const charsWithTag = GameData.characters.filter(c => {
         const mt = (c.Character_MainTag || "").split('/').map(s => s.trim()).filter(Boolean);
         const st = (c.Character_SubTag || "").split('/').map(s => s.trim()).filter(Boolean);
         return mt.includes(tagName) || st.includes(tagName);
      }).map(c => c.Character_Name);
      const uniqueCharNames = [...new Set(charsWithTag)];
      
      let thresholds = [];
      let scores = [];
      if (type.includes('2인 완성')) {
          thresholds = [2]; scores = [2];
      } else if (cap === 3) {
          thresholds = [3]; scores = [3];
      } else if (cap === 4) {
          thresholds = [2, 4]; scores = [2, 6];
      } else if (cap === 5) {
          thresholds = [3, 5]; scores = [3, 9];
      } else if (cap >= 6 && cap <= 8) {
          thresholds = [3, 6]; scores = [3, 12];
      } else if (cap >= 9) {
          thresholds = [3, 6, 8]; scores = [3, 12, 20];
      }

      activeTags.push({
        name: tagName,
        count: count,
        score: score,
        stage: stage,
        cap: cap,
        type: type,
        thresholds: thresholds,
        scores: scores,
        chars: uniqueCharNames
      });
    }
  });
  
  return { totalScore, activeTags };
}

function openDeckKizunaModal(kizunaData) {
    const modal = document.getElementById("deck-kizuna-modal");
    const container = document.getElementById("deck-kizuna-list-container");
    if (!modal || !container) return;
    
    modal.classList.add("show");
    container.innerHTML = "";
    
    if (kizunaData.activeTags.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #7f8c8d; padding: 30px;">활성화된 덱 키즈나가 없습니다.</div>`;
        return;
    }
    
    // 1. 활성화된 태그 (score > 0) 우선 정렬, 2. 점수 내림차순, 3. 인원 내림차순
    kizunaData.activeTags.sort((a, b) => {
        if ((a.score > 0) !== (b.score > 0)) return b.score > 0 ? 1 : -1;
        if (a.score !== b.score) return b.score - a.score;
        return b.count - a.count;
    });
    
    kizunaData.activeTags.forEach(tag => {
        const row = document.createElement("div");
        const isActive = tag.score > 0;
        const bg = isActive ? "#f1f2f6" : "#e0e0e0";
        const titleColor = isActive ? "#2c3e50" : "#7f8c8d";
        const scoreColor = isActive ? "#2980b9" : "#95a5a6";
        
        row.style.cssText = `
            background: ${bg}; padding: 15px; border-radius: 8px;
            display: flex; justify-content: space-between; align-items: center;
            opacity: ${isActive ? '1' : '0.7'};
            cursor: help;
        `;
        
        let stageFormat = "";
        if (tag.type.includes('2인 완성')) {
            stageFormat = tag.stage === 1 ? `<span style="color: #e67e22; font-weight: 900;">2</span>` : `2`;
        } else {
            stageFormat = tag.thresholds.map((t, idx) => {
                // tag.stage starts from 1, so idx + 1 === tag.stage means this is the currently active tier.
                if (tag.stage === idx + 1) {
                    return `<span style="color: #e67e22; font-weight: 900;">${t}</span>`;
                }
                return t;
            }).join(' / ');
        }
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                <div style="font-size: 1.1rem; font-weight: bold; color: ${titleColor}; min-width: 140px; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${tag.name}
                </div>
                <div style="font-size: 0.95rem; color: #34495e; font-weight: bold; min-width: 50px;">
                    ( <span style="color: #2980b9;">${tag.count}</span> )
                </div>
                <div style="font-size: 0.9rem; color: #7f8c8d; font-weight: bold; flex: 1; text-align: center;">
                    ${stageFormat}
                </div>
            </div>
            <div style="font-size: 1.4rem; font-weight: bold; color: ${scoreColor}; min-width: 80px; text-align: right;">
                +${tag.score} 점
            </div>
        `;
        
        row.addEventListener('mousemove', (e) => showKizunaTooltip(e, tag));
        row.addEventListener('mouseleave', hideKizunaTooltip);

        container.appendChild(row);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const btnCloseDeckKizuna = document.getElementById("btn-close-deck-kizuna");
    if (btnCloseDeckKizuna) {
        btnCloseDeckKizuna.addEventListener("click", () => {
            const modal = document.getElementById("deck-kizuna-modal");
            if (modal) modal.classList.remove("show");
        });
    }
});

function showKizunaTooltip(e, tag) {
    let ct = document.getElementById('kizuna-tooltip');
    if (!ct) {
        ct = document.createElement('div');
        ct.id = 'kizuna-tooltip';
        ct.style.position = 'fixed';
        ct.style.background = 'rgba(15, 20, 25, 0.95)';
        ct.style.border = '1px solid #e67e22';
        ct.style.borderRadius = '8px';
        ct.style.padding = '15px';
        ct.style.color = '#ecf0f1';
        ct.style.fontSize = '13px';
        ct.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6)';
        ct.style.pointerEvents = 'none';
        ct.style.zIndex = '99999';
        ct.style.lineHeight = '1.6';
        ct.style.maxWidth = '300px';
        document.body.appendChild(ct);
    }
    
    let html = `
        <div style="font-size: 1.1rem; font-weight: bold; color: #f39c12; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 5px;">
            [ ${tag.name} 시너지 ]
        </div>
        <div style="margin-bottom: 10px;">
            <div style="color: #bdc3c7; font-size: 0.85rem; margin-bottom: 3px;">필요 인원 및 점수</div>
            ${tag.thresholds.map((t, i) => `
                <div style="display: flex; justify-content: space-between; align-items: center; ${tag.stage === i + 1 ? 'color: #f1c40f; font-weight: bold;' : ''}">
                    <span>- ${t}인 달성 시</span>
                    <span>${tag.scores[i]} 점</span>
                </div>
            `).join('')}
        </div>
        <div>
            <div style="color: #bdc3c7; font-size: 0.85rem; margin-bottom: 5px;">보유 캐릭터</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${(function() {
                    const deck = PlayerData.decks[currentDeckIndex];
                    const deckCharNames = deck ? [...deck.supporters, ...deck.strikers]
                        .filter(Boolean)
                        .map(id => GameData.characters.find(charObj => charObj.Character_ID === id)?.Character_Name)
                        .filter(Boolean) : [];
                    
                    return tag.chars.map(c => {
                        const isPlaced = deckCharNames.includes(c);
                        const colorStyle = isPlaced ? 'color: #f1c40f; font-weight: bold; border-color: #f1c40f; background: rgba(241,196,15,0.1);' : 'color: inherit;';
                        return `<span style="display: inline-block; padding: 2px 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; font-size: 0.8rem; ${colorStyle}">
                            ${c}
                        </span>`;
                    }).join('');
                })()}
            </div>
        </div>
    `;
    
    ct.innerHTML = html;
    ct.style.display = 'block';
    
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    if (x + ct.offsetWidth > window.innerWidth) x = e.clientX - ct.offsetWidth - 15;
    if (y + ct.offsetHeight > window.innerHeight) y = e.clientY - ct.offsetHeight - 15;
    ct.style.left = x + 'px';
    ct.style.top = y + 'px';
}

function hideKizunaTooltip() {
    const ct = document.getElementById('kizuna-tooltip');
    if (ct) ct.style.display = 'none';
}
