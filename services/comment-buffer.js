/**
 * Буфер комментариев для Instagram бота
 * Управление очередью сгенерированных комментариев
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger.js');

class CommentBuffer {
    constructor() {
        this.bufferFile = path.join('data', 'comment-buffer.json');
        this.maxBufferSize = 10;  // Максимум комментариев в буфере
        this.minBufferSize = 3;   // Минимум комментариев для пополнения
        this.buffer = [];
        
        // Создаем папку data если её нет
        this.ensureDataDirectory();
    }

    /**
     * Создает папку data если её нет
     */
    async ensureDataDirectory() {
        try {
            await fs.mkdir('data', { recursive: true });
        } catch (error) {
            // Папка уже существует - это нормально
        }
    }

    /**
     * Загружает буфер из файла
     */
    async loadBuffer() {
        try {
            const data = await fs.readFile(this.bufferFile, 'utf8');
            const parsed = JSON.parse(data);
            this.buffer = parsed.comments || [];
            
            logger.info(`📥 Буфер загружен: ${this.buffer.length} комментариев`);
            return true;
        } catch (error) {
            // Файл не существует или поврежден - создаем пустой буфер
            logger.info('📄 Создаем новый пустой буфер');
            this.buffer = [];
            return false;
        }
    }

    /**
     * Сохраняет буфер в файл
     */
    async saveBuffer() {
        try {
            const data = {
                comments: this.buffer,
                lastUpdated: new Date().toISOString(),
                version: '1.0'
            };
            
            await fs.writeFile(this.bufferFile, JSON.stringify(data, null, 2), 'utf8');
            logger.debug(`💾 Буфер сохранен: ${this.buffer.length} комментариев`);
            return true;
        } catch (error) {
            logger.error('Ошибка сохранения буфера', { message: error.message });
            return false;
        }
    }

    /**
     * Добавляет комментарии в буфер
     */
    async addComments(comments) {
        if (!Array.isArray(comments)) {
            comments = [comments];
        }
        
        // Фильтруем и добавляем только валидные комментарии
        const validComments = comments.filter(comment => {
            return comment && 
                   comment.text && 
                   comment.text.length > 10 && 
                   comment.text.length < 1000;
        });
        
        // Добавляем временные метки
        const timestampedComments = validComments.map(comment => ({
            ...comment,
            addedAt: new Date().toISOString(),
            used: false
        }));
        
        // Добавляем в буфер
        this.buffer.push(...timestampedComments);
        
        // Ограничиваем размер буфера
        if (this.buffer.length > this.maxBufferSize) {
            const removed = this.buffer.splice(0, this.buffer.length - this.maxBufferSize);
            logger.info(`🗑️ Удалено ${removed.length} старых комментариев из буфера`);
        }
        
        await this.saveBuffer();
        
        logger.success(`➕ Добавлено ${validComments.length} комментариев в буфер. Всего: ${this.buffer.length}`);
        return validComments.length;
    }

    /**
     * Получает следующий комментарий из буфера
     */
    async getNextComment() {
        await this.loadBuffer();
        
        // Ищем неиспользованный комментарий
        const unusedComments = this.buffer.filter(comment => !comment.used);
        
        if (unusedComments.length === 0) {
            logger.warning('⚠️ В буфере нет неиспользованных комментариев');
            return null;
        }
        
        // Берем первый неиспользованный
        const selectedComment = unusedComments[0];
        
        // Помечаем как использованный
        const index = this.buffer.findIndex(c => c === selectedComment);
        if (index !== -1) {
            this.buffer[index].used = true;
            this.buffer[index].usedAt = new Date().toISOString();
        }
        
        await this.saveBuffer();
        
        logger.info(`📤 Взят комментарий из буфера: "${selectedComment.text.substring(0, 40)}..."`);
        logger.info(`📊 Осталось неиспользованных: ${unusedComments.length - 1}`);
        
        return selectedComment;
    }

    /**
     * Проверяет нужно ли пополнить буфер
     */
    async needsRefill() {
        await this.loadBuffer();
        
        const unusedCount = this.buffer.filter(comment => !comment.used).length;
        const needsRefill = unusedCount < this.minBufferSize;
        
        if (needsRefill) {
            logger.info(`🔔 Буфер требует пополнения: ${unusedCount} < ${this.minBufferSize}`);
        }
        
        return needsRefill;
    }

    /**
     * Получает статистику буфера
     */
    async getBufferStats() {
        await this.loadBuffer();
        
        const stats = {
            total: this.buffer.length,
            unused: this.buffer.filter(c => !c.used).length,
            used: this.buffer.filter(c => c.used).length,
            sources: {}
        };
        
        // Статистика по источникам
        this.buffer.forEach(comment => {
            const source = comment.source || 'unknown';
            stats.sources[source] = (stats.sources[source] || 0) + 1;
        });
        
        logger.analysis('СТАТИСТИКА БУФЕРА', {
            'Всего комментариев': stats.total,
            'Неиспользованных': stats.unused,
            'Использованных': stats.used,
            'Источники': Object.keys(stats.sources).join(', ')
        });
        
        return stats;
    }

    /**
     * Очищает использованные комментарии
     */
    async cleanupUsedComments() {
        await this.loadBuffer();
        
        const beforeCount = this.buffer.length;
        this.buffer = this.buffer.filter(comment => !comment.used);
        const removedCount = beforeCount - this.buffer.length;
        
        if (removedCount > 0) {
            await this.saveBuffer();
            logger.info(`🧹 Очищено ${removedCount} использованных комментариев`);
        }
        
        return removedCount;
    }

    /**
     * Полная очистка буфера
     */
    async clearBuffer() {
        this.buffer = [];
        await this.saveBuffer();
        logger.warning('🗑️ Буфер полностью очищен');
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentBuffer();
