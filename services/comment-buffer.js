/**
 * Улучшенная система буфера комментариев
 * Интегрированная логика из основного проекта
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger.js');

class CommentBuffer {
    constructor() {
        this.bufferFile = path.join('data', 'comments_buffer.json');
        this.bufferSize = 5;          // Как в основном проекте
        this.refillThreshold = 2;     // Пополнять когда меньше 2
        this.buffer = [];
        this.previousComment = "";    // Для проверки схожести
        
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
     * Загружает буфер из файла (улучшенная версия)
     */
    async loadBuffer() {
        try {
            const data = await fs.readFile(this.bufferFile, 'utf8');
            const parsed = JSON.parse(data);
            this.buffer = parsed.comments || [];
            this.previousComment = parsed.previousComment || "";
            
            logger.debug(` Буфер загружен: ${this.buffer.length} комментариев`);
            return true;
        } catch (error) {
            logger.info(' Создаем новый пустой буфер');
            this.buffer = [];
            this.previousComment = "";
            return false;
        }
    }

    /**
     * Сохраняет буфер в файл (с метаданными)
     */
    async saveBuffer() {
        try {
            const data = {
                comments: this.buffer,
                previousComment: this.previousComment,
                lastUpdated: new Date().toISOString(),
                version: '2.0'
            };
            
            await fs.writeFile(this.bufferFile, JSON.stringify(data, null, 2), 'utf8');
            logger.debug(` Буфер сохранен: ${this.buffer.length} комментариев`);
            return true;
        } catch (error) {
            logger.error('❌ Ошибка сохранения буфера:', error.message);
            return false;
        }
    }

    /**
     * ГЛАВНАЯ ФУНКЦИЯ - Получение комментария с проверкой схожести (из основного проекта)
     * Почему проверка схожести: избегаем повторяющихся комментариев подряд
     */
    async getNextComment() {
        await this.loadBuffer();

        if (this.buffer.length === 0) {
            logger.warning(' Попытка взять комментарий из пустого буфера');
            return null;
        }

        // Берем первый комментарий
        const selectedComment = this.buffer.shift();
        
        // Проверяем схожесть с предыдущим (как в основном проекте)
        if (this.previousComment) {
            const commentGenerator = require('./comment-generator.js');
            const similarity = commentGenerator.calculateSimilarity(selectedComment, this.previousComment);
            const similarityThreshold = parseInt(process.env.SIMILARITY_CONST || "50");
            
            if (similarity >= similarityThreshold) {
                logger.warning(` Комментарий слишком похож на предыдущий: ${similarity.toFixed(2)}%`);
                
                // Пытаемся взять альтернативный комментарий
                if (this.buffer.length > 0) {
                    const alternativeComment = this.buffer.shift();
                    const alternativeSimilarity = commentGenerator.calculateSimilarity(alternativeComment, this.previousComment);
                    
                    if (alternativeSimilarity < similarity) {
                        logger.info(` Использован альтернативный комментарий. Схожесть: ${alternativeSimilarity.toFixed(2)}%`);
                        // Возвращаем первый комментарий обратно в конец буфера
                        this.buffer.push(selectedComment);
                        this.previousComment = alternativeComment;
                        await this.saveBuffer();
                        
                        logger.info(` Взят альтернативный комментарий. Осталось: ${this.buffer.length}`);
                        return alternativeComment;
                    } else {
                        logger.warning(` Альтернативный комментарий тоже похож (${alternativeSimilarity.toFixed(2)}%). Используем первый.`);
                        // Возвращаем альтернативный комментарий обратно
                        this.buffer.unshift(alternativeComment);
                    }
                } else {
                    logger.warning(' Нет альтернативного комментария. Используем текущий несмотря на схожесть.');
                }
            }
        }

        // Сохраняем текущий комментарий как предыдущий
        this.previousComment = selectedComment;
        await this.saveBuffer();
        
        logger.info(` Взят комментарий из буфера: "${selectedComment.substring(0, 40)}..."`);
        logger.info(` Осталось комментариев: ${this.buffer.length}`);
        
        return selectedComment;
    }

    /**
     * Добавление batch комментариев (из основного проекта)
     */
    async addBatchComments(newComments) {
        if (!Array.isArray(newComments) || newComments.length === 0) {
            logger.warning(' Попытка добавить пустой или некорректный batch комментариев');
            return 0;
        }

        await this.loadBuffer();

        // Фильтруем и добавляем валидные комментарии
        const validComments = newComments.filter(comment => {
            return comment && 
                   typeof comment === 'string' && 
                   comment.trim().length > 10 && 
                   comment.trim().length < 1000;
        });

        if (validComments.length === 0) {
            logger.warning(' Нет валидных комментариев для добавления');
            return 0;
        }

        // Добавляем комментарии в конец буфера
        this.buffer.push(...validComments);

        // Ограничиваем размер буфера
        if (this.buffer.length > this.bufferSize) {
            const removed = this.buffer.splice(0, this.buffer.length - this.bufferSize);
            logger.info(` Удалено ${removed.length} старых комментариев (превышен лимит)`);
        }

        await this.saveBuffer();
        
        logger.success(` Добавлено ${validComments.length} комментариев в буфер. Всего: ${this.buffer.length}`);
        return validComments.length;
    }

    /**
     * Проверка нужно ли пополнять буфер (из основного проекта)
     */
    async needsRefill() {
        await this.loadBuffer();
        const needsRefill = this.buffer.length < this.refillThreshold;
        
        if (needsRefill) {
            logger.info(` Буфер требует пополнения: ${this.buffer.length} < ${this.refillThreshold}`);
        }
        
        return needsRefill;
    }

    /**
     * Принудительное заполнение буфера (для первого запуска)
     */
    async ensureBufferReady(parsedComments, styleAnalysis) {
        await this.loadBuffer();
        
        if (this.buffer.length === 0) {
            logger.warning(' Буфер пуст! Выполняем первоначальное заполнение...');
            
            const commentGenerator = require('./comment-generator.js');
            const newComments = await commentGenerator.generateBatchComments(parsedComments);
            
            if (newComments && newComments.length > 0) {
                await this.addBatchComments(newComments);
                logger.success(`✅ Первоначальное заполнение завершено. Размер буфера: ${this.buffer.length}`);
            } else {
                logger.error('❌ Не удалось заполнить буфер при первом запуске');
            }
        } else {
            logger.info(` Буфер готов к работе. Доступно комментариев: ${this.buffer.length}`);
        }
    }

    /**
     * Фоновое пополнение буфера
     */
    async refillBufferBackground(parsedComments, styleAnalysis) {
        try {
            logger.info(' Запуск фонового пополнения буфера...');
            
            const commentGenerator = require('./comment-generator.js');
            const newComments = await commentGenerator.generateBatchComments(parsedComments);
            
            if (newComments && newComments.length > 0) {
                await this.addBatchComments(newComments);
                logger.success('✅ Фоновое пополнение буфера завершено успешно');
            } else {
                logger.warning(' Фоновое пополнение не дало результатов');
            }
        } catch (error) {
            logger.error('❌ Ошибка фонового пополнения буфера:', error.message);
        }
    }

    /**
     * Статистика буфера
     */
    async getBufferStats() {
        await this.loadBuffer();
        
        const stats = {
            total: this.buffer.length,
            needsRefill: this.buffer.length < this.refillThreshold,
            threshold: this.refillThreshold,
            capacity: this.bufferSize,
            hasPrevious: !!this.previousComment
        };
        
        logger.analysis(' СТАТИСТИКА БУФЕРА', {
            'Комментариев в буфере': stats.total,
            'Требует пополнения': stats.needsRefill ? 'Да' : 'Нет',
            'Порог пополнения': stats.threshold,
            'Максимальная емкость': stats.capacity,
            'Есть предыдущий комментарий': stats.hasPrevious ? 'Да' : 'Нет'
        });
        
        return stats;
    }

    /**
     * Очистка буфера
     */
    async clearBuffer() {
        this.buffer = [];
        this.previousComment = "";
        await this.saveBuffer();
        logger.warning(' Буфер полностью очищен');
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentBuffer();
