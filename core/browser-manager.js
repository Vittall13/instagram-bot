// core/browser-manager.js

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger.js');

class BrowserManager {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.profileName = process.env.BOT_PROFILE || 'default';
  }

  // Вычисляем базовую директорию профиля ОДИН РАЗ
  getUserDataBaseDir() {
    // 1) Явный путь из .env приоритетнее всего (универсально)
    if (process.env.BOT_PROFILE_DATA_DIR && process.env.BOT_PROFILE_DATA_DIR.trim()) {
      return process.env.BOT_PROFILE_DATA_DIR.trim();
    }
    // 2) Если явно сказали, что это Docker — используем /app
    if ((process.env.RUN_ENV || '').toLowerCase() === 'docker') {
      return '/app';
    }
    // 3) По умолчанию — текущая рабочая папка проекта (локальный запуск)
    return process.cwd();
  }

  async ensureWritableDir(dir) {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, '.probe');
    try {
      await fs.writeFile(probe, 'ok');
      // Чисто, но не критично: можно удалить пробник
      await fs.unlink(probe).catch(() => {});
    } catch (e) {
      throw new Error(`Нет прав на запись: ${dir} (${e.message})`);
    }
  }

  async init() {
    try {
      const baseDir = this.getUserDataBaseDir();         // /app ИЛИ локальная папка проекта
      const userDataDir = path.join(baseDir, `user-data-${this.profileName}`);

      // Гарантируем, что каталог существует и доступен для записи
      await this.ensureWritableDir(userDataDir);

      // Запускаем persistent-контекст
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless: this.config.browser.headless,
        slowMo: this.config.browser.slowMo,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: process.env.LOCALE || 'ru-RU',
        timezoneId: process.env.TZ || 'Europe/Moscow',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          // Ограничение дискового кэша (~150МБ общий + ~50МБ медиа)
          '--disk-cache-size=157286400',
          '--media-cache-size=52428800'
        ]
      });

      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

      await this.setupAntiDetection();
      logger.success(`Браузер инициализирован (persistent: ${userDataDir})`);
      return true;
    } catch (error) {
      logger.error('Ошибка инициализации браузера', { message: error.message });
      return false;
    }
  }

  async setupAntiDetection() {
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  async loadSession() {
    try {
      const storageState = JSON.parse(await fs.readFile('storage.json', 'utf8'));
      await this.context.addCookies(storageState.cookies || []);
      logger.info('✅ Загружена сохранённая сессия (дополнительно к профилю)');
      return true;
    } catch {
      logger.info('ℹ️ storage.json не найден — полагаемся на persistent профиль');
      return false;
    }
  }

  async saveSession() {
    try {
      const storageState = await this.context.storageState();
      await fs.writeFile('storage.json', JSON.stringify(storageState, null, 2));
      logger.success('💾 Сессия сохранена (дублирование профиля)');
    } catch (error) {
      logger.error('Ошибка сохранения сессии', { message: error.message });
    }
  }

  async navigateTo(url, options = {}) {
    const defaults = { waitUntil: 'domcontentloaded', timeout: this.config.timeouts.navigation };
    return await this.page.goto(url, { ...defaults, ...options });
  }

  getPage() {
    return this.page;
  }

  async screenshot(filename, options = {}) {
    try {
      await this.page.screenshot({ path: filename, fullPage: true, ...options });
      logger.info(`📸 Скриншот: ${filename}`);
    } catch (error) {
      logger.error('Ошибка создания скриншота', { message: error.message });
    }
  }

  async close() {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      logger.success('🔚 Браузер закрыт');
    } catch (error) {
      logger.error('Ошибка закрытия браузера', { message: error.message });
    }
  }
}

module.exports = BrowserManager;
