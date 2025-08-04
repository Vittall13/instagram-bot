require('dotenv').config();
const selectors = require('./selectors.js');

module.exports = {
    // Instagram настройки
    instagram: {
        targetProfile: process.env.INSTAGRAM_TARGET_PROFILE,
        comment: process.env.INSTAGRAM_COMMENT
    },
    
    // Тайминги
    timeouts: {
        navigation: parseInt(process.env.NAVIGATION_TIMEOUT) || 20000,
        element: parseInt(process.env.ELEMENT_TIMEOUT) || 10000,
        clickResponse: parseInt(process.env.CLICK_RESPONSE_TIMEOUT) || 5000
    },
    
    // Расширенные настройки задержек
    delays: {
        min: parseInt(process.env.MIN_DELAY) || 2000,
        max: parseInt(process.env.MAX_DELAY) || 5000,
        clickWait: parseInt(process.env.CLICK_WAIT_DELAY) || 3000,
        
        // Новые настройки
        adaptive: process.env.ADAPTIVE_DELAYS === 'true',
        criticalAction: parseInt(process.env.CRITICAL_ACTION_DELAY) || 4000,
        betweenActionsMultiplier: parseFloat(process.env.BETWEEN_ACTIONS_MULTIPLIER) || 1.5
    },
    
    // Рабочие часы
    workingHours: {
        start: parseInt(process.env.WORK_START_HOUR) || 9,
        end: parseInt(process.env.WORK_END_HOUR) || 18
    },
    
    // Браузер
    browser: {
        headless: process.env.HEADLESS === 'true',
        slowMo: parseInt(process.env.SLOW_MO) || 300
    },
    
    // Дебаг
    debug: {
        screenshotOnError: process.env.SCREENSHOT_ON_ERROR !== 'false'
    },

    // Логирование
        logging: {
        level: process.env.LOG_LEVEL || 'INFO',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        productionMode: process.env.NODE_ENV === 'production'
    },

    // Этап интеграции kimi-k2 для генерации комментария:
    openai: {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENAI_MODEL || 'moonshotai/kimi-k2:free',
        maxRetries: parseInt(process.env.MAX_GENERATION_ATTEMPTS) || 5,
        similarity: parseInt(process.env.SIMILARITY_CONST) || 50
    },

    // Добавить в конец:
    selectors: selectors
};
