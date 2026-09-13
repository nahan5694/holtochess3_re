import { GameData, PlayerData } from './state.js?v=004276';
import { updateTopCurrencies } from './ui.js?v=004276';

let selectedShopItem = null;
let currentQuantity = 1;
let currentShopTab = 'general'; // general, song
function getCurrencyForTab(tab) { return tab === "ruby" ? "Item_039" : "Item_005"; }

export function getSongPrice(song) {
    if (!song) return 10;
    if (String(song.Song_On).trim() === "2") return 5;
    return Number(song.Song_Cost) || 10;
}

export function initShopSystem() {
    try {
        const tabGen = document.getElementById("tab-shop-general");
        const tabSong = document.getElementById("tab-shop-song");
        const tabRuby = document.getElementById("tab-shop-ruby");
        
        const updateTabs = (tab) => {
            if(tabGen) tabGen.style.background = tab === 'general' ? "#3498db" : "rgba(0,0,0,0.4)";
            if(tabSong) tabSong.style.background = tab === 'song' ? "#3498db" : "rgba(0,0,0,0.4)";
            if(tabRuby) tabRuby.style.background = tab === 'ruby' ? "#e74c3c" : "rgba(0,0,0,0.4)";
        };

        if (tabGen) {
            tabGen.addEventListener("click", () => {
                currentShopTab = 'general';
                updateTabs('general');
                renderShopItems();
                selectShopItem(null);
            });
        }
        if (tabSong) {
            tabSong.addEventListener("click", () => {
                currentShopTab = 'song';
                updateTabs('song');
                renderShopItems();
                selectShopItem(null);
            });
        }
        if (tabRuby) {
            tabRuby.addEventListener("click", () => {
                currentShopTab = 'ruby';
                updateTabs('ruby');
                renderShopItems();
                selectShopItem(null);
            });
        }

        const btnMinus = document.getElementById("shop-btn-minus");
        const btnPlus = document.getElementById("shop-btn-plus");
        const bulkBtns = document.querySelectorAll(".shop-bulk-btn");
        const btnBuy = document.getElementById("shop-btn-buy");

        if(btnMinus) btnMinus.addEventListener("click", () => updateQuantity(currentQuantity - 1));
        if(btnPlus) btnPlus.addEventListener("click", () => updateQuantity(currentQuantity + 1));

        bulkBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.id === "shop-btn-max") {
                    if (!selectedShopItem) return;
                    const price = Number(selectedShopItem.Shop_Price) || 0;
                    if (price <= 0) return;
                    const playerCurrency = PlayerData.items[getCurrencyForTab(currentShopTab)] || 0;
                    const maxQty = Math.floor(playerCurrency / price);
                    updateQuantity(maxQty > 0 ? maxQty : 1);
                } else {
                    const addAmount = Number(btn.getAttribute("data-amount") || btn.getAttribute("data-val")) || 0;
                    updateQuantity(currentQuantity + addAmount);
                }
            });
        });

        if(btnBuy) {
            btnBuy.addEventListener("click", () => {
                if (!selectedShopItem) return;
                handleBuyClick();
            });
        }
    } catch(e) {
        console.error("initShopSystem failed", e);
    }
}

export function openShopScene() {
    try {
        updateShopCurrencyDisplay();
        renderShopItems();
        selectedShopItem = null;
        currentQuantity = 1;
        const panel = document.getElementById("shop-purchase-panel");
        if(panel) panel.style.display = "none";
    } catch(e) {
        console.error("openShopScene failed", e);
        alert("상점 로드 중 오류: " + e.message);
    }
}

function updateShopCurrencyDisplay() {
    const info005 = (GameData.items || GameData.item || []).find(i => i.Item_ID === 'Item_005');
    const icon005 = document.getElementById("shop-currency-icon-005");
    const amt005 = document.getElementById("shop-currency-amount-005");
    if (info005 && icon005) icon005.src = info005.Item_Icon;
    if (amt005) amt005.textContent = (PlayerData.items['Item_005'] || 0).toLocaleString();
    
    const info039 = (GameData.items || GameData.item || []).find(i => i.Item_ID === 'Item_039');
    const icon039 = document.getElementById("shop-currency-icon-039");
    const amt039 = document.getElementById("shop-currency-amount-039");
    if (info039 && icon039) icon039.src = info039.Item_Icon;
    if (amt039) amt039.textContent = (PlayerData.items['Item_039'] || 0).toLocaleString();
}
function renderShopItems() {
  try {
    const grid = document.getElementById("shop-items-grid");
    const panel = document.getElementById("shop-purchase-panel");
    if (!grid) return;
    grid.innerHTML = "";
    
    const activeCurrency = getCurrencyForTab(currentShopTab);
    const currencyInfo = (GameData.items || GameData.item || []).find(i => i.Item_ID === activeCurrency);

    if (currentShopTab === 'general' || currentShopTab === 'ruby') {
        grid.style.flexDirection = "row";
        grid.style.flexWrap = "wrap";
        grid.style.alignContent = "flex-start";
        if (panel) panel.style.display = selectedShopItem ? "flex" : "none";
        
        const shopData = (GameData.shop || GameData.shops || []) || [];
        const itemsList = GameData.items || GameData.item || [];
        const songsList = GameData.songs || GameData.song || [];
        
        


        
        
        
        
        

        let renderedCount = 0;
        shopData.forEach(shopRow => {
            const sItem = (shopRow.Shop_Item || "").trim();
            if (!sItem || sItem === '아이템ID') return; // Skip description rows or empty
            
            const typeVal = String(shopRow.Shop_Type || '1').trim();
            if (currentShopTab === 'general' && typeVal !== '1') return;
            if (currentShopTab === 'ruby' && typeVal !== '2') return;
            
            const itemInfo = itemsList.find(i => (i.Item_ID || "").trim() === sItem);
            if (!itemInfo) {
                console.warn("Shop item not found in GameData.items:", sItem);
                return;
            }
            renderedCount++;


            const card = document.createElement("div");
            card.className = "shop-item-card";
            card.style.cssText = `
                width: 140px; height: 180px; background: rgba(0,0,0,0.4); 
                border: 2px solid #555; border-radius: 12px; padding: 10px;
                display: flex; flex-direction: column; align-items: center; justify-content: space-between;
                cursor: pointer; transition: 0.2s;
            `;
            
            card.innerHTML = `
                <div style="width: 80px; height: 80px; background: url('${itemInfo.Item_Icon}') center/cover; border-radius: 8px;"></div>
                <div style="font-size: 1rem; color: white; text-align: center; word-break: keep-all; line-height: 1.2;">${itemInfo.Item_Name}</div>
                <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 12px; margin-top: 5px;">
                    <img src="${currencyInfo ? currencyInfo.Item_Icon : ''}" style="width: 16px; height: 16px;">
                    <span style="color: #f1c40f; font-weight: bold;">${Number(shopRow.Shop_Price).toLocaleString()}</span>
                </div>
            `;
            
            card.addEventListener("click", () => {
                document.querySelectorAll(".shop-item-card").forEach(c => {
                    c.style.borderColor = "#555";
                    c.style.boxShadow = "none";
                });
                card.style.borderColor = "#ffcc00";
                card.style.boxShadow = "0 0 15px rgba(255,204,0,0.5)";
                selectShopItem(shopRow, itemInfo);
            });
            grid.appendChild(card);
        });
    } else if (currentShopTab === 'song') {
        grid.style.flexDirection = "column";
        grid.style.flexWrap = "nowrap";
        grid.style.alignContent = "stretch";
        grid.style.width = "100%";
        if (panel) panel.style.display = "none";
        
        const songsData = (GameData.songs || GameData.song || []) || [];
        const ownedSongs = PlayerData.songs || [];
        
        const unowned = [];
        const owned = [];
        songsData.forEach(song => {
            if (song.Song_ID === "Song_000") return;
            const isOn = String(song.Song_On).trim();
            if (isOn !== "1" && isOn !== "2") return;
            if (ownedSongs.includes(song.Song_ID)) owned.push(song);
            else unowned.push(song);
        });

        // Song_On이 2인 테마곡을 상점 리스트 맨 위로 정렬
        const isTheme = s => String(s.Song_On).trim() === "2";
        unowned.sort((a, b) => (isTheme(b) ? 1 : 0) - (isTheme(a) ? 1 : 0));
        owned.sort((a, b) => (isTheme(b) ? 1 : 0) - (isTheme(a) ? 1 : 0));
        
        const renderSongList = (list, isOwned) => {
            list.forEach(song => {
                const isThemeSong = isTheme(song);
                const row = document.createElement("div");
                const bgColor = isOwned 
                    ? "rgba(0,0,0,0.2)" 
                    : (isThemeSong ? "linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(20, 40, 80, 0.88))" : "rgba(20,40,80,0.7)");
                const borderColor = isOwned ? "#444" : (isThemeSong ? "#f59e0b" : "#005ce6");
                const filter = isOwned ? "grayscale(100%) opacity(0.7)" : "none";
                const themeGlow = (isThemeSong && !isOwned) ? "box-shadow: 0 0 16px rgba(245, 158, 11, 0.45);" : "";
                
                row.style.cssText = `
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 15px 20px; border-radius: 12px; background: ${bgColor};
                    border: 2px solid ${borderColor}; margin-bottom: 10px;
                    filter: ${filter}; ${themeGlow}
                `;
                if (isThemeSong && !isOwned) {
                    row.classList.add("shop-theme-song-highlight");
                }
                
                let badgeColor = "#3498db";
                if (song.Song_Type == "1") badgeColor = "#f1c40f";
                else if (song.Song_Type == "2") badgeColor = "#e84393";
                
                const singers = (song.Song_Singer || "미상").split("/");
                const badgeHtml = singers.map(s => `<span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 0.8rem; margin-left: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${s.trim()}</span>`).join("");
                
                const themeBadgeHtml = isThemeSong 
                    ? `<span style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 2px 10px; border-radius: 12px; font-weight: bold; font-size: 0.82rem; margin-left: 10px; box-shadow: 0 0 8px rgba(245, 158, 11, 0.8); animation: pulseThemeBadge 1.5s infinite alternate ease-in-out;">🔥 NEW 테마곡 (50% OFF)</span>` 
                    : "";

                const songPrice = getSongPrice(song);
                const btnHtml = isOwned 
                    ? `<div style="color: #aaa; font-weight: bold; font-size: 1.1rem; padding: 10px;">보유 중</div>`
                    : `<button class="buy-song-btn" style="background: ${isThemeSong ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#f1c40f'}; color: #333; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 8px;">
                        <img src="${currencyInfo ? currencyInfo.Item_Icon : ''}" style="width: 20px; height: 20px;">
                        ${songPrice.toLocaleString()} 구매
                       </button>`;
                
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div style="font-size: 40px; text-shadow: 0 2px 5px rgba(0,0,0,0.5);">${isThemeSong ? '🌟' : '🎵'}</div>
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span style="font-size: 1.2rem; color: ${isThemeSong ? '#fef08a' : 'white'}; font-weight: bold; text-shadow: 1px 1px 2px #000;">${song.Song_Name}</span>
                            ${themeBadgeHtml}
                            ${badgeHtml}
                        </div>
                    </div>
                    <div>
                        ${btnHtml}
                    </div>
                `;
                
                if (!isOwned) {
                    const btn = row.querySelector(".buy-song-btn");
                    btn.addEventListener("click", () => {
                        selectedShopItem = { isSong: true, songData: song };
                        currentQuantity = 1;
                        handleBuyClick();
                    });
                }
                
                grid.appendChild(row);
            });
        };
        
        renderSongList(unowned, false);
        renderSongList(owned, true);
    }
  } catch(e) { console.error("renderShopItems error", e); alert("상점 아이템 표시 오류: " + e.message); }
}
function selectShopItem(shopRow, itemInfo) {
    if (!shopRow) {
        selectedShopItem = null;
        const panel = document.getElementById("shop-purchase-panel");
        if (panel) panel.style.display = "none";
        return;
    }
    if (selectedShopItem) {
        if (!shopRow.isSong && selectedShopItem.Shop_ID === shopRow.Shop_ID) {
            updateQuantity(currentQuantity + 1);
            return;
        } else if (shopRow.isSong && selectedShopItem.isSong && selectedShopItem.songData.Song_ID === shopRow.songData.Song_ID) {
            updateQuantity(currentQuantity + 1);
            return;
        }
    }

    selectedShopItem = shopRow;
    currentQuantity = 1;
    document.getElementById("shop-purchase-panel").style.display = "flex";

    const currencyInfo = (GameData.items || GameData.item || []).find(i => i.Item_ID === getCurrencyForTab(currentShopTab));
    const currencyIcon = currencyInfo ? currencyInfo.Item_Icon : '';

    if (shopRow.isSong) {
        document.getElementById("shop-panel-icon").style.display = "none"; // Hide icon or set to music note
        document.getElementById("shop-panel-name").textContent = itemInfo.Item_Name;
        document.getElementById("shop-panel-desc").innerHTML = itemInfo.Item_Desc;
        
        const ownedEl = document.getElementById("shop-panel-owned");
        if (ownedEl) ownedEl.textContent = ``;
        
        document.querySelectorAll(".shop-panel-currency-icon").forEach(el => el.src = currencyIcon);
        document.getElementById("shop-panel-price").textContent = getSongPrice(shopRow.songData).toLocaleString();
    } else {
        document.getElementById("shop-panel-icon").style.display = "inline-block";
        document.getElementById("shop-panel-icon").src = itemInfo.Item_Icon;
        document.getElementById("shop-panel-name").textContent = itemInfo.Item_Name;
        document.getElementById("shop-panel-desc").innerHTML = (itemInfo.Item_Desc || "").replace(/\n/g, '<br>');
        
        const ownedEl = document.getElementById("shop-panel-owned");
        if (ownedEl) {
            const ownedQty = PlayerData.items[itemInfo.Item_ID] || 0;
            ownedEl.textContent = `보유 중: ${ownedQty.toLocaleString()}개`;
        }
        
        document.querySelectorAll(".shop-panel-currency-icon").forEach(el => el.src = currencyIcon);
        document.getElementById("shop-panel-price").textContent = Number(shopRow.Shop_Price).toLocaleString();
    }
    
    updateQuantity(1);
}

function updateQuantity(newQty) {
    if (!selectedShopItem) return;
    const price = selectedShopItem.isSong ? getSongPrice(selectedShopItem.songData) : (Number(selectedShopItem.Shop_Price) || 0);
    const playerCurrency = PlayerData.items[getCurrencyForTab(currentShopTab)] || 0;
    
    let maxQty = 1;
    if (price > 0) {
        maxQty = Math.floor(playerCurrency / price);
    }
    if (maxQty < 1) maxQty = 1; // 최소 1개는 표시하되 구매 불가 처리
    if (selectedShopItem.isSong) maxQty = 1; // 노래는 무조건 1개만 구매 가능

    currentQuantity = Math.max(1, Math.min(newQty, maxQty));
    const qtyInput = document.getElementById("shop-quantity-input"); if(qtyInput) qtyInput.value = currentQuantity;
    const pTotal = document.getElementById("shop-panel-total"); if(pTotal) pTotal.textContent = (price * currentQuantity).toLocaleString();

    const btnBuy = document.getElementById("shop-btn-buy");
    if (playerCurrency >= price * currentQuantity) {
        btnBuy.style.opacity = "1";
        btnBuy.style.pointerEvents = "auto";
    } else {
        btnBuy.style.opacity = "0.5";
        btnBuy.style.pointerEvents = "none";
    }
}
function showMessage(msg) {
    alert(msg); // 간단한 알림용
}

function handleBuyClick() {
    if (!selectedShopItem) return;
    const price = selectedShopItem.isSong ? getSongPrice(selectedShopItem.songData) : (Number(selectedShopItem.Shop_Price) || 0);
    const totalCost = price * currentQuantity;
    const playerCurrency = PlayerData.items[getCurrencyForTab(currentShopTab)] || 0;

    let itemName = "알 수 없는 아이템";
    if (selectedShopItem.isSong) {
        itemName = selectedShopItem.songData.Song_Name;
    } else {
        const itemInfo = (GameData.items || GameData.item || []).find(i => i.Item_ID === selectedShopItem.Shop_Item);
        itemName = itemInfo ? itemInfo.Item_Name : "알 수 없는 아이템";
    }

    if (playerCurrency < totalCost) {
        showMessage(`재화가 부족합니다. (필요: ${totalCost.toLocaleString()})`);
        return;
    }
    
    // Show custom modal
    const modal = document.getElementById("shop-confirm-modal");
    const textEl = document.getElementById("shop-confirm-text");
    const okBtn = document.getElementById("shop-btn-confirm-ok");
    const cancelBtn = document.getElementById("shop-btn-confirm-cancel");
    
    if (modal && textEl) {
        textEl.innerHTML = selectedShopItem.isSong ? `[<span style="color:#ffcc00">${itemName}</span>]을(를) 구매하시겠습니까?<br><br>소모: ${totalCost.toLocaleString()}` : `[<span style="color:#ffcc00">${itemName}</span>] ${currentQuantity}개를 구매하시겠습니까?<br><br>소모: ${totalCost.toLocaleString()}`;
        
        // Remove old listeners by cloning
        const newOkBtn = okBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener("click", () => {
            modal.classList.remove("show");
        });
        
        newOkBtn.addEventListener("click", () => {
            modal.classList.remove("show");
            executeShopBuy();
        });
        
        modal.classList.add("show");
    }
}

// ui.js의 confirm modal 결과 처리 연동용 함수
export function executeShopBuy() {
    if (!selectedShopItem) return;
    const price = selectedShopItem.isSong ? getSongPrice(selectedShopItem.songData) : (Number(selectedShopItem.Shop_Price) || 0);
    const totalCost = price * currentQuantity;
    const playerCurrency = PlayerData.items[getCurrencyForTab(currentShopTab)] || 0;

    if (playerCurrency >= totalCost) {
        PlayerData.items[getCurrencyForTab(currentShopTab)] -= totalCost;
        
        if (selectedShopItem.isSong) {
            const songId = selectedShopItem.songData.Song_ID;
            if (!PlayerData.songs) PlayerData.songs = [];
            if (!PlayerData.songs.includes(songId)) {
                PlayerData.songs.push(songId);
            }
            updateShopCurrencyDisplay();
            updateTopCurrencies();
            // removed alert
            document.getElementById("shop-purchase-panel").style.display = "none";
            selectedShopItem = null;
            renderShopItems(); // 재렌더링하여 이미 산 거 숨김
        } else {
            const itemId = selectedShopItem.Shop_Item;
            PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + currentQuantity;
            
            updateShopCurrencyDisplay();
            updateTopCurrencies();
            
            const itemInfo = (GameData.items || GameData.item || []).find(i => i.Item_ID === itemId);
            // removed alert
            
            const ownedEl = document.getElementById("shop-panel-owned");
            if (ownedEl) {
                const ownedQty = PlayerData.items[itemId] || 0;
                ownedEl.textContent = `보유 중: ${ownedQty.toLocaleString()}개`;
            }
            
            updateQuantity(1); // 구매 후 1개로 초기화
        }
    }
}
