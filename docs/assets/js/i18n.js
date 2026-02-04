/**
 * 客户端国际化系统
 * 直接在浏览器中切换语言，无需生成多个文件
 */

// 支持的语言
const LANGUAGES = {
  'zh-CN': { name: '中文', flag: '🇨🇳' },
  'en': { name: 'English', flag: '🇺🇸' },
  'ja': { name: '日本語', flag: '🇯🇵' },
  'ko': { name: '한국어', flag: '🇰🇷' },
};

// 当前语言
let currentLang = localStorage.getItem('lang') || 'zh-CN';

// 翻译数据缓存
const translations = {};

/**
 * 加载翻译文件
 */
async function loadTranslations(lang) {
  if (translations[lang]) {
    return translations[lang];
  }
  
  try {
    // 根据当前页面路径确定翻译文件路径
    const isInPages = window.location.pathname.includes('/pages/');
    const isAllToolsPage = window.location.pathname.includes('all-tools.html');
    
    let basePath = isInPages ? '../i18n' : './i18n';
    
    // 如果是 all-tools 页面，需要加载两个翻译文件
    if (isAllToolsPage) {
      // 1. 先加载通用翻译（侧边栏等）
      const commonPath = `${basePath}/${lang}.json`;
      console.log(`[i18n] Loading common translation: ${lang}, path: ${commonPath}`);
      
      let commonTranslations = {};
      try {
        const commonResponse = await fetch(commonPath);
        if (commonResponse.ok) {
          commonTranslations = await commonResponse.json();
          console.log(`[i18n] Common translation loaded successfully:`, lang);
        }
      } catch (error) {
        console.warn(`通用翻译文件加载失败: ${commonPath}`, error);
      }
      
      // 2. 再加载页面特定翻译（工具数据）
      const toolsPath = `${basePath}/all-tools/${lang}.json`;
      console.log(`[i18n] Loading all-tools translation: ${lang}, path: ${toolsPath}`);
      
      const toolsResponse = await fetch(toolsPath);
      if (!toolsResponse.ok) {
        console.warn(`工具翻译文件不存在: ${toolsPath}，回退到中文`);
        // 回退到中文
        if (lang !== 'zh-CN') {
          const fallbackCommonPath = `${basePath}/zh-CN.json`;
          const fallbackToolsPath = `${basePath}/all-tools/zh-CN.json`;
          
          const [fallbackCommonRes, fallbackToolsRes] = await Promise.all([
            fetch(fallbackCommonPath),
            fetch(fallbackToolsPath)
          ]);
          
          if (fallbackCommonRes.ok && fallbackToolsRes.ok) {
            const fallbackCommon = await fallbackCommonRes.json();
            const fallbackTools = await fallbackToolsRes.json();
            translations[lang] = { ...fallbackCommon, ...fallbackTools };
            return translations[lang];
          }
        }
        return null;
      }
      
      const toolsTranslations = await toolsResponse.json();
      
      console.log(`[i18n] Tools translations loaded, checking toolShortDesc...`);
      console.log(`[i18n] toolsTranslations keys:`, Object.keys(toolsTranslations));
      console.log(`[i18n] toolsTranslations full content:`, JSON.stringify(toolsTranslations, null, 2).substring(0, 500));
      console.log(`[i18n] toolsTranslations.toolShortDesc exists:`, !!toolsTranslations.toolShortDesc);
      console.log(`[i18n] toolsTranslations.toolShortDesc content:`, toolsTranslations.toolShortDesc);
      
      // 3. 合并两个翻译对象
      // 使用深度合并：commonTranslations 作为基础，toolsTranslations 覆盖同名键
      // 但保留 toolsTranslations 中独有的键（如 toolShortDesc）
      translations[lang] = {
        ...commonTranslations,
        ...toolsTranslations,
        // 确保 toolShortDesc 不会被覆盖
        toolShortDesc: toolsTranslations.toolShortDesc || {}
      };
      
      console.log(`[i18n] All-tools translation loaded and merged successfully:`, lang);
      console.log(`[i18n] Common translations keys:`, Object.keys(commonTranslations));
      console.log(`[i18n] Tools translations keys:`, Object.keys(toolsTranslations));
      console.log(`[i18n] Merged translations keys:`, Object.keys(translations[lang]));
      console.log(`[i18n] toolShortDesc in tools:`, !!toolsTranslations.toolShortDesc);
      console.log(`[i18n] toolShortDesc in merged:`, !!translations[lang].toolShortDesc);
      if (translations[lang].toolShortDesc) {
        console.log(`[i18n] toolShortDesc content:`, translations[lang].toolShortDesc);
      }
      return translations[lang];
    } else {
      // 其他页面使用通用翻译文件
      const translationPath = `${basePath}/${lang}.json`;
      console.log(`[i18n] Loading translation: ${lang}, path: ${translationPath}`);
      
      const response = await fetch(translationPath);
      if (!response.ok) {
        console.warn(`翻译文件不存在: ${translationPath}`);
        return null;
      }
      translations[lang] = await response.json();
      console.log(`[i18n] Translation loaded successfully:`, lang);
      return translations[lang];
    }
  } catch (error) {
    console.error(`加载翻译失败: ${lang}`, error);
    return null;
  }
}

/**
 * 翻译文本
 */
function t(key, lang = currentLang) {
  const trans = translations[lang];
  if (!trans) return key;
  
  const keys = key.split('.');
  let value = trans;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  
  return value;
}

/**
 * 应用翻译到页面
 */
function applyTranslations() {
  // 翻译所有带 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text !== key) {
      el.textContent = text;
    }
  });
  
  // 翻译所有带 data-i18n-placeholder 属性的元素
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const text = t(key);
    if (text !== key) {
      el.placeholder = text;
    }
  });
  
  // 翻译所有带 data-i18n-title 属性的元素
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const text = t(key);
    if (text !== key) {
      el.title = text;
    }
  });
  
  // 更新 HTML lang 属性
  document.documentElement.lang = currentLang;
  
  // 更新页面标题
  const titleKey = document.querySelector('meta[name="i18n-title"]')?.content;
  if (titleKey) {
    const title = t(titleKey);
    if (title !== titleKey) {
      document.title = title;
    }
  }
  
  // 标记 i18n 已准备好，显示页面内容
  document.body.classList.add('i18n-ready');
}

/**
 * 切换语言
 */
async function switchLanguage(lang) {
  if (!LANGUAGES[lang]) {
    console.error(`不支持的语言: ${lang}`);
    return;
  }
  
  currentLang = lang;
  window.currentLang = lang; // 同步更新全局变量
  localStorage.setItem('lang', lang);
  
  // 加载翻译
  await loadTranslations(lang);
  
  // 应用翻译
  applyTranslations();
  
  // 更新语言切换器
  updateLanguageSwitcher();
  
  // 关闭菜单
  const menu = document.getElementById('lang-menu');
  const icon = document.getElementById('lang-icon');
  if (menu && icon) {
    menu.classList.add('hidden');
    icon.style.transform = 'rotate(0deg)';
  }
  
  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}

/**
 * 创建语言切换器
 */
function createLanguageSwitcher() {
  const container = document.getElementById('lang-switcher-container');
  if (!container) {
    console.warn('语言切换器容器不存在: #lang-switcher-container');
    return;
  }
  
  console.log('创建语言切换器...');
  
  const currentLangInfo = LANGUAGES[currentLang];
  
  const html = `
    <div class="relative inline-block" id="lang-switcher">
      <button onclick="toggleLangMenu()" class="flex items-center gap-1 px-3 py-2 text-sm text-text-secondary hover:text-primary transition-colors rounded-md hover:bg-bg-hover">
        <span id="current-lang-display">${currentLangInfo.flag} ${currentLangInfo.name}</span>
        <svg class="w-4 h-4 transition-transform" id="lang-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div id="lang-menu" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-border py-1 z-50">
        ${Object.entries(LANGUAGES).map(([code, info]) => `
          <a href="#" onclick="switchLanguage('${code}'); return false;" 
             class="block px-4 py-2 text-sm hover:bg-bg-hover transition-colors ${code === currentLang ? 'bg-blue-50 text-primary font-medium' : ''}">
            ${info.flag} ${info.name}
          </a>
        `).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  console.log('语言切换器创建完成');
}

/**
 * 更新语言切换器显示
 */
function updateLanguageSwitcher() {
  const display = document.getElementById('current-lang-display');
  if (display) {
    const info = LANGUAGES[currentLang];
    display.textContent = `${info.flag} ${info.name}`;
  }
  
  // 更新选中状态
  document.querySelectorAll('#lang-menu a').forEach(link => {
    const lang = link.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (lang === currentLang) {
      link.classList.add('bg-blue-50', 'text-primary', 'font-medium');
    } else {
      link.classList.remove('bg-blue-50', 'text-primary', 'font-medium');
    }
  });
}

/**
 * 切换语言菜单
 */
function toggleLangMenu() {
  const menu = document.getElementById('lang-menu');
  const icon = document.getElementById('lang-icon');
  
  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');
    icon.style.transform = 'rotate(180deg)';
  } else {
    menu.classList.add('hidden');
    icon.style.transform = 'rotate(0deg)';
  }
}

/**
 * 点击外部关闭菜单
 */
document.addEventListener('click', (e) => {
  const switcher = document.getElementById('lang-switcher');
  if (switcher && !switcher.contains(e.target)) {
    const menu = document.getElementById('lang-menu');
    const icon = document.getElementById('lang-icon');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      icon.style.transform = 'rotate(0deg)';
    }
  }
});

/**
 * 初始化
 */
async function initI18n() {
  // 从 localStorage 读取保存的语言，如果没有则检测浏览器语言
  const savedLang = localStorage.getItem('lang');
  
  if (savedLang && LANGUAGES[savedLang]) {
    // 使用保存的语言
    currentLang = savedLang;
    console.log('[i18n] Using saved language:', currentLang);
  } else {
    // 检测浏览器语言（仅首次访问）
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) currentLang = 'zh-CN';
    else if (browserLang.startsWith('ja')) currentLang = 'ja';
    else if (browserLang.startsWith('ko')) currentLang = 'ko';
    else currentLang = 'en'; // 默认英文
    
    localStorage.setItem('lang', currentLang);
    console.log('[i18n] Detected browser language:', currentLang);
  }
  
  // 同步到全局变量
  window.currentLang = currentLang;
  
  // 加载当前语言的翻译
  await loadTranslations(currentLang);
  
  // 创建语言切换器
  createLanguageSwitcher();
  
  // 应用翻译
  applyTranslations();
  
  // 触发 i18n 准备完成事件
  console.log('[i18n] i18n initialization completed, dispatching i18nReady event');
  window.dispatchEvent(new CustomEvent('i18nReady', { detail: { lang: currentLang } }));
}

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }

  // 导出到全局
  window.switchLanguage = switchLanguage;
  window.toggleLangMenu = toggleLangMenu;
  window.t = t;
  window.currentLang = currentLang;
  window.translations = translations;
  window.LANGUAGES = LANGUAGES;
  window.applyTranslations = applyTranslations;


