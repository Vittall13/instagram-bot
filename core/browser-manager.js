/**
 * Управление браузером для Instagram бота
 * Централизованная настройка Playwright
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const logger = require('../utils/logger.js');

class BrowserManager {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    /**
     * Инициализация браузера
     */
    async init() {
    try {
        this.browser = await chromium.launch({
        headless: this.config.browser.headless,
        slowMo: this.config.browser.slowMo,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security'
        ]
        });

        this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: process.env.LOCALE || 'ru-RU',
        timezoneId: process.env.TZ || 'Europe/Moscow'
        });

        this.page = await this.context.newPage();
        await this.setupAntiDetection();
        logger.success('Браузер инициализирован');
        return true;
    } catch (error) {
        logger.error('Ошибка инициализации браузера', { message: error.message });
        return false;
    }
    }


    /**
     * Настройка анти-детекции
     */
    async setupAntiDetection() {
        await this.page.addInitScript(() => {
            // Убираем признаки автоматизации
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            delete navigator.__proto__.webdriver;
        });
    }

    /**
     * Загрузка сохраненной сессии
     */
    async loadSession() {
        try {
            const storageState = JSON.parse(await fs.readFile('storage.json', 'utf8'));
            await this.context.addCookies(storageState.cookies || []);
            logger.info('✅ Загружена сохранённая сессия');
            return true;
        } catch {
            logger.info('ℹ️ Сохранённая сессия не найдена');
            return false;
        }
    }

    /**
     * Сохранение текущей сессии
     */
    async saveSession() {
        try {
            const storageState = await this.context.storageState();
            await fs.writeFile('storage.json', JSON.stringify(storageState, null, 2));
            logger.success('💾 Сессия сохранена');
        } catch (error) {
            logger.error('Ошибка сохранения сессии', { message: error.message });
        }
    }

    /**
     * Переход на страницу с таймаутом
     */
    async navigateTo(url, options = {}) {
        const defaultOptions = {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeouts.navigation
        };
        
        return await this.page.goto(url, { ...defaultOptions, ...options });
    }

    /**
     * Получение объекта страницы
     */
    getPage() {
        return this.page;
    }

    /**
     * Создание скриншота
     */
    async screenshot(filename, options = {}) {
        try {
            await this.page.screenshot({
                path: filename,
                fullPage: true,
                ...options
            });
            logger.info(`📸 Скриншот: ${filename}`);
        } catch (error) {
            logger.error('Ошибка создания скриншота', { message: error.message });
        }
    }

    /**
     * Закрытие браузера
     */
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
