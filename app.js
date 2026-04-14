let recipeData = [];

// 初始化加载 CSV 数据
document.addEventListener('DOMContentLoaded', () => {
    Papa.parse('sample-data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            recipeData = results.data;
            console.log("加载了食谱数据:", recipeData);
            document.getElementById('generateBtn').addEventListener('click', generatePlan);
        }
    });
});

// 更聪明的抽取算法：如果池子里不够，会智能放宽历史过滤条件，绝对不会空手而归
function getRandomItems(array, desiredCount, recentIds = []) {
    // 第一梯队：过滤掉最近吃过且同类别的菜
    let available = array.filter(item => !recentIds.includes(item.id));
    available.sort(() => 0.5 - Math.random());
    
    let result = [];
    let heavyCount = 0;
    
    for (let item of available) {
        if (result.length >= desiredCount) break;
        // 控制一顿饭重口味不过量
        if (item.heaviness === '重口' && heavyCount >= 1) continue;
        result.push(item);
        if (item.heaviness === '重口') heavyCount++;
    }
    
    // 如果排除了最近吃过的菜之后，发现不够填满坑位（比如菜谱太少）
    // 第二梯队：把前面排除的 recentIds 重新放进来凑数，但是尽量保持不彻底重复
    if (result.length < desiredCount) {
        let fallback = array.filter(item => !result.includes(item));
        fallback.sort(() => 0.5 - Math.random());
        for (let item of fallback) {
            if (result.length >= desiredCount) break;
            result.push(item);
        }
    }
    
    return result;
}

// 核心：生成排班与采买清单
function generatePlan() {
    const days = parseInt(document.getElementById('daysCount').value);
    const lunchPax = parseInt(document.getElementById('lunchPax').value);
    const dinnerPax = parseInt(document.getElementById('dinnerPax').value);

    const meats = recipeData.filter(d => d.category.includes('荤'));
    const vegs = recipeData.filter(d => d.category.includes('素'));
    const soups = recipeData.filter(d => d.category.includes('汤'));

    const dailyPlans = [];
    let shoppingListRaw = [];
    
    // 记录每天吃过的菜的ID池，滑动窗口，尽量保证短期不重样
    let history = []; 

    for (let i = 1; i <= days; i++) {
        // 近期吃过的菜（往前推2天），排菜时尽量避开这些
        let recentIds = history.slice(-2).flat();
        
        // --- 午餐排班 (1荤 1素) ---
        let lunchMeats = getRandomItems(meats, 1, recentIds);
        recentIds.push(...lunchMeats.map(m=>m.id)); // 挑出来的菜马上加入排重名单，防止同顿饭/当天的晚餐重复
        
        let lunchVegs = getRandomItems(vegs, 1, recentIds);
        recentIds.push(...lunchVegs.map(v=>v.id));

        let lunchItems = [...lunchMeats, ...lunchVegs];
        lunchItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: lunchPax }));

        // --- 晚餐排班 (2荤 1素 1汤) ---
        let dinnerMeats = getRandomItems(meats, 2, recentIds);
        recentIds.push(...dinnerMeats.map(m=>m.id));

        let dinnerVegs = getRandomItems(vegs, 1, recentIds);
        recentIds.push(...dinnerVegs.map(v=>v.id));

        let dinnerSoups = getRandomItems(soups, 1, recentIds);
        recentIds.push(...dinnerSoups.map(s=>s.id));

        let dinnerItems = [...dinnerMeats, ...dinnerVegs, ...dinnerSoups];
        dinnerItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: dinnerPax }));

        // 保存今天的菜单ID到历史窗口，供明天参考
        let todaysIds = [...lunchItems, ...dinnerItems].map(item => item.id);
        history.push(todaysIds);

        dailyPlans.push({ day: i, lunch: lunchItems, dinner: dinnerItems });
    }

    renderMenu(dailyPlans);
    processAndRenderShoppingList(shoppingListRaw);
}

// 渲染排菜单至UI
function renderMenu(dailyPlans) {
    const container = document.getElementById('menuContainer');
    container.innerHTML = '';
    document.getElementById('menuSection').classList.remove('hidden');

    dailyPlans.forEach(plan => {
        let dayCard = document.createElement('div');
        dayCard.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
        
        let lunchHTML = plan.lunch.map(item => `<div class="flex flex-col text-sm bg-blue-50 p-2 rounded"><span class="font-semibold text-gray-700">${item.name_zh || item.name_my}</span><span class="text-xs text-gray-500">${item.name_my || ''}</span></div>`).join('');
        let dinnerHTML = plan.dinner.map(item => `<div class="flex flex-col text-sm bg-orange-50 p-2 rounded"><span class="font-semibold text-gray-700">${item.name_zh || item.name_my}</span><span class="text-xs text-gray-500">${item.name_my || ''}</span></div>`).join('');

        dayCard.innerHTML = `
            <h3 class="font-bold text-lg text-teal-700 mb-3 border-b pb-1">第 ${plan.day} 天 (Day ${plan.day})</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="text-sm font-bold text-gray-400 mb-2 uppercase flex items-center gap-2">☀️ 午餐 Lunch</h4>
                    <div class="flex flex-wrap gap-2">${lunchHTML}</div>
                </div>
                <div>
                    <h4 class="text-sm font-bold text-gray-400 mb-2 uppercase flex items-center gap-2">🌙 晚餐 Dinner</h4>
                    <div class="flex flex-wrap gap-2">${dinnerHTML}</div>
                </div>
            </div>
        `;
        container.appendChild(dayCard);
    });
}

// 核心：处理食材合并并渲染清单
function processAndRenderShoppingList(rawItems) {
    const mergedIngredients = {};

    rawItems.forEach(mealRecord => {
        const item = mealRecord.recipe;
        const actualPax = mealRecord.pax;
        if (!item.base_portions || parseInt(item.base_portions) <= 0) return;
        const ratio = actualPax / parseInt(item.base_portions);
        
        if(!item.ingredients_zh) return;
        let zhParts = item.ingredients_zh.split(';');
        let myParts = item.ingredients_my ? item.ingredients_my.split(';') : [];

        for (let i = 0; i < zhParts.length; i++) {
            let zhIng = zhParts[i].trim();
            if (!zhIng) continue;
            let myIng = (myParts[i] || "").trim();

            let zInfo = zhIng.split(':');
            let mInfo = myIng.split(':');

            if (zInfo.length >= 2) {
                let nameZh = zInfo[0].trim();
                let amount = parseFloat(zInfo[1]) || 0;
                let unit = zInfo[2] ? zInfo[2].trim() : "";
                
                let nameMy = (mInfo.length > 0 && mInfo[0]) ? mInfo[0].trim() : "";
                
                let finalAmount = amount * ratio;
                let key = nameZh + "_" + unit;

                if (!mergedIngredients[key]) {
                    mergedIngredients[key] = {
                        nameZh: nameZh,
                        nameMy: nameMy,
                        unit: unit,
                        totalAmount: 0
                    };
                }
                mergedIngredients[key].totalAmount += finalAmount;
            }
        }
    });

    const container = document.getElementById('shoppingListContainer');
    container.innerHTML = '';
    document.getElementById('shoppingSection').classList.remove('hidden');

    Object.values(mergedIngredients).forEach(ing => {
        let amountStr = Number.isInteger(ing.totalAmount) ? ing.totalAmount : ing.totalAmount.toFixed(1);
        
        let row = document.createElement('label');
        row.className = 'flex items-center p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors bg-white shadow-sm';
        row.innerHTML = `
            <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 mr-4">
            <div class="flex flex-col flex-1">
                <div class="flex justify-between items-center">
                    <span class="font-medium text-gray-800 text-lg">${ing.nameZh}</span>
                    <span class="font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded text-sm">${amountStr} ${ing.unit}</span>
                </div>
                <span class="text-sm text-gray-500">${ing.nameMy}</span>
            </div>
        `;
        let checkbox = row.querySelector('input');
        checkbox.addEventListener('change', function() {
            let textDiv = this.nextElementSibling;
            if (this.checked) {
                textDiv.classList.add('line-through', 'opacity-50');
            } else {
                textDiv.classList.remove('line-through', 'opacity-50');
            }
        });
        container.appendChild(row);
    });
}
