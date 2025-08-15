const config = require('../config/config.js');
const logger = require('./logger.js');

class DelayUtils {
  constructor() {
    this.config = config;
  }

  async randomDelay(min = null, max = null) {
    const minDelay = Number.isFinite(min) ? min : this.config.delays.min;
    const maxDelay = Number.isFinite(max) ? max : this.config.delays.max;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    if (delay > 2000) {
      logger.info(`Пауза ${Math.round(delay / 1000)}с`);
    }
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async waitForClickResponse() {
    const delay = this.config.delays.clickWait || 3000;
    logger.info(`⏳ Ждём отклик на клик (${delay}мс)...`);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  isActiveTime() {
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(process.env.WORKING_HOURS_START) || 8;
    const endHour = parseInt(process.env.WORKING_HOURS_END) || 21;
    const isActive = currentHour >= startHour && currentHour < endHour;
    if (!isActive) {
      console.log(`⏰ Текущее время: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
      console.log(`⏰ Рабочие часы (.env): ${startHour}:00 - ${endHour}:00`);
    }
    return isActive;
  }

  async betweenActions() {
    const min = this.config.delays.min * 1.5;
    const max = this.config.delays.max * 1.2;
    await this.randomDelay(min, max);
  }

  async afterSuccess() {
    await this.randomDelay(1000, 2000);
  }

  async beforeCriticalAction(actionName = '') {
    const delay = this.config.delays.max * 1.5;
    if (actionName) {
      logger.info(`⏳ Подготовка к: ${actionName}`);
    }
    await this.randomDelay(delay, delay * 1.3);
  }

  async adaptiveDelay() {
    const now = new Date();
    const hour = now.getHours();
    let multiplier = 1;
    const start = this.config.workingHours?.start ?? 9;
    const end = this.config.workingHours?.end ?? 21;
    if (hour <= start + 1 || hour >= end - 1) {
      multiplier = 1.5;
    }
    const baseMin = this.config.delays.min * multiplier;
    const baseMax = this.config.delays.max * multiplier;
    await this.randomDelay(baseMin, baseMax);
  }

  getNextActiveTime() {
    const now = new Date();
    const currentHour = now.getHours();
    const workingHours = this.config.workingHours || [9, 21];
    const startHour = Array.isArray(workingHours) ? workingHours[0] : 9;
    const endHour = Array.isArray(workingHours) ? workingHours[1] : 21;

    if (currentHour < startHour) {
      const nextActive = new Date(now);
      nextActive.setHours(startHour, 0, 0, 0);
      return nextActive;
    }
    if (currentHour >= endHour) {
      const nextActive = new Date(now);
      nextActive.setDate(nextActive.getDate() + 1);
      nextActive.setHours(startHour, 0, 0, 0);
      return nextActive;
    }
    return now;
  }
}

module.exports = new DelayUtils();
