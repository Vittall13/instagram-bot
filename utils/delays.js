const config = require('../config/config.js');
const logger = require('./logger.js');

class DelayUtils {
    constructor() {
        this.config = config;
    }

    /**
     * Случайная задержка с человекоподобным поведением
     * @param {number} min - Минимальная задержка (мс)
     * @param {number} max - Максимальная задержка (мс)
     */
    async randomDelay(min = null, max = null) {
        const minDelay = min || this.config.delays.min;
        const maxDelay = max || this.config.delays.max;
        
        const delay = minDelay + Math.random() * (maxDelay - minDelay);
        
        // Логируем только значительные паузы
        if (delay > 2000) {
            logger.info(`Пауза ${Math.round(delay/1000)}с`);
        }
        
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Ожидание отклика после клика
     */
    async waitForClickResponse() {
        const delay = this.config.delays.clickWait || 3000;
        logger.info(`⏳ Ждём отклик на клик (${delay}мс)...`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Проверка рабочего времени
     */
    isActiveTime() {
        const now = new Date();
        const hour = now.getHours();
        return hour >= this.config.workingHours.start && hour <= this.config.workingHours.end;
    }

    /**
     * Человекоподобная задержка между действиями
     */
    async betweenActions() {
        // Более длинные паузы для имитации размышления
        const min = this.config.delays.min * 1.5;
        const max = this.config.delays.max * 1.2;
        await this.randomDelay(min, max);
    }

    /**
     * Пауза после успешного действия
     */
    async afterSuccess() {
        // Короткая пауза после успешных действий
        await this.randomDelay(1000, 2000);
    }

    /**
     * Задержка перед критическими действиями
     */
    async beforeCriticalAction(actionName = '') {
        // Более длинная пауза перед важными действиями
        const delay = this.config.delays.max * 1.5;
        if (actionName) {
            logger.info(`⏳ Подготовка к: ${actionName}`);
        }
        await this.randomDelay(delay, delay * 1.3);
    }

    /**
     * Умная задержка на основе времени работы
     */
    async adaptiveDelay() {
        // Более длинные паузы в начале/конце рабочего дня
        const now = new Date();
        const hour = now.getHours();
        
        let multiplier = 1;
        
        // Утренние и вечерние часы - более аккуратно
        if (hour <= this.config.workingHours.start + 1 || hour >= this.config.workingHours.end - 1) {
            multiplier = 1.5;
        }
        
        const baseMin = this.config.delays.min * multiplier;
        const baseMax = this.config.delays.max * multiplier;
        
        await this.randomDelay(baseMin, baseMax);
    }
}

// Экспортируем готовый экземпляр
module.exports = new DelayUtils();
