const fs = require('fs').promises;
const path = require('path');

class SafeLogger {
    constructor() {
        this.levels = {
            SILENT: 0,
            ERROR: 1, 
            WARNING: 2,
            INFO: 3,
            DEBUG: 4
        };
        
        this.currentLevel = this.getLevelFromEnv();
        this.enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true' && 
                                 process.env.NODE_ENV !== 'production'; // Файлы ТОЛЬКО в dev
        this.colors = {
            error: '\x1b[31m',    // Красный
            warning: '\x1b[33m',  // Желтый  
            info: '\x1b[36m',     // Голубой
            debug: '\x1b[90m',    // Серый
            success: '\x1b[32m',  // Зеленый
            reset: '\x1b[0m'      // Сброс
        };
    }
    
    getLevelFromEnv() {
        if (process.env.NODE_ENV === 'production') {
            return this.levels.ERROR; // В production только ошибки!
        }
        
        const envLevel = process.env.LOG_LEVEL || 'INFO';
        return this.levels[envLevel] || this.levels.INFO;
    }
    
    log(level, message, data = null) {
        if (this.levels[level] > this.currentLevel) return;
        
        const timestamp = new Date().toLocaleString('ru-RU');
        const emoji = this.getEmoji(level);
        const color = this.colors[level] || '';
        
        // Безопасное сообщение (фильтруем чувствительные данные)
        const safeMessage = this.sanitizeMessage(message);
        
        // Консольный вывод
        console.log(`${color}${emoji} [${timestamp}] ${safeMessage}${this.colors.reset}`);
        
        // Данные только в DEBUG режиме
        if (data && level === 'DEBUG') {
            console.log(`${this.colors.debug}   Данные:`, data, `${this.colors.reset}`);
        }
        
        // Файловое логирование ТОЛЬКО в development
        if (this.enableFileLogging && process.env.NODE_ENV !== 'production') {
            this.writeToFile(level, timestamp, safeMessage, data);
        }
    }
    
    sanitizeMessage(message) {
        // Удаляем потенциально чувствительные данные
        return message
            .replace(/password[:\s]*[^\s]*/gi, 'password: ***')
            .replace(/token[:\s]*[^\s]*/gi, 'token: ***')
            .replace(/cookie[:\s]*[^\s]*/gi, 'cookie: ***')
            .replace(/session[:\s]*[^\s]*/gi, 'session: ***');
    }
    
    getEmoji(level) {
        const emojis = {
            ERROR: '❌',
            WARNING: '⚠️',
            INFO: 'ℹ️',
            DEBUG: '🔍',
            SUCCESS: '✅'
        };
        return emojis[level] || 'ℹ️';
    }
    
    // Удобные методы
    error(message, data = null) { this.log('ERROR', message, data); }
    warning(message, data = null) { this.log('WARNING', message, data); }
    info(message, data = null) { this.log('INFO', message, data); }
    debug(message, data = null) { this.log('DEBUG', message, data); }
    success(message, data = null) { this.log('SUCCESS', message, data); }
    
    // Специальные методы для Instagram бота
    action(action, details = '') {
        this.info(`🎯 ${action}${details ? ': ' + details : ''}`);
    }
    
    step(step, number = null) {
        const stepNum = number ? `Шаг ${number}: ` : '';
        this.info(`🔄 ${stepNum}${step}`);
    }
    
    analysis(title, data) {
        this.info(`📊 ${title}`);
        if (this.currentLevel >= this.levels.DEBUG && data) {
            Object.entries(data).forEach(([key, value]) => {
                this.debug(`   ${key}: ${value}`);
            });
        }
    }
}

// Экспортируем готовый экземпляр
module.exports = new SafeLogger();
