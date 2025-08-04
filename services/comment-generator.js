/**
 * Генератор комментариев для Instagram бота
 * Создает уникальные комментарии на основе собранных данных
 */

const logger = require('../utils/logger.js');

class CommentGenerator {
    constructor() {
        this.templates = [
            // Шаблоны позитивных комментариев
            "Отлично сказано! Полностью поддерживаю эту позицию.",
            "Очень правильные слова. Спасибо за такой важный пост.",
            "Абсолютно согласен с каждым словом. Мудрые мысли.",
            "Браво! Именно так и нужно говорить о важных вещах.",
            "Прекрасно выражено. Это действительно имеет значение.",
            
            // Шаблоны поддержки  
            "Поддерживаю все сто процентов! Так держать!",
            "Очень важные слова в нужное время. Респект!",
            "Именно эти мысли нужно доносить до людей. Молодец!",
            "Отличная позиция! Полностью разделяю эти взгляды.",
            "Правильно говорите! Такие слова всегда находят отклик.",
            
            // Шаблоны восхищения
            "Всегда восхищаюсь такими мудрыми словами!",
            "Как точно подмечено! Действительно стоящие мысли.",
            "Очень глубокие размышления. Благодарю за пост!",
            "Такие слова вдохновляют и дают силы. Спасибо!",
            "Мощно и по делу! Уважение за такую позицию."
        ];
        
        this.usedTemplates = new Set(); // Отслеживаем использованные шаблоны
    }

    /**
     * Генерирует комментарий на основе контекста поста и собранных комментариев
     */
    generateComment(postContext = null, parsedComments = [], styleAnalysis = null) {
        try {
            logger.info('🤖 Генерируем уникальный комментарий...');
            
            // Выбираем неиспользованный шаблон
            const availableTemplates = this.templates.filter(
                template => !this.usedTemplates.has(template)
            );
            
            // Если все шаблоны использованы - очищаем историю
            if (availableTemplates.length === 0) {
                logger.info('🔄 Все шаблоны использованы, очищаем историю...');
                this.usedTemplates.clear();
                availableTemplates.push(...this.templates);
            }
            
            // Выбираем случайный шаблон
            const selectedTemplate = availableTemplates[
                Math.floor(Math.random() * availableTemplates.length)
            ];
            
            // Помечаем как использованный
            this.usedTemplates.add(selectedTemplate);
            
            // В будущем здесь может быть интеграция с OpenAI API
            const generatedComment = this.enhanceComment(
                selectedTemplate, 
                postContext, 
                parsedComments, 
                styleAnalysis
            );
            
            logger.success(`✅ Комментарий сгенерирован: "${generatedComment.substring(0, 50)}..."`);
            
            return {
                text: generatedComment,
                source: 'template',
                confidence: 0.8,
                uniqueness: this.calculateUniqueness(generatedComment, parsedComments)
            };
            
        } catch (error) {
            logger.error('Ошибка генерации комментария', { message: error.message });
            
            // Fallback - простейший комментарий
            return {
                text: "🙂 Полностью согласен с мнением автора.",
                source: 'fallback',
                confidence: 0.5,
                uniqueness: 0.3
            };
        }
    }

    /**
     * Улучшает комментарий на основе контекста
     */
    enhanceComment(baseComment, postContext, parsedComments, styleAnalysis) {
        let enhanced = baseComment;
        
        // Добавляем вариативность на основе анализа стиля
        if (styleAnalysis && styleAnalysis.averageLength > 100) {
            // Для длинных комментариев добавляем детали
            const additions = [
                " Это очень актуальная тема.",
                " Всегда важно об этом напоминать.",
                " Такие мысли особенно ценны сегодня.",
                " Нужные слова в нужное время.",
                " Это достойно уважения и поддержки."
            ];
            
            if (Math.random() < 0.4) { // 40% вероятность добавления
                const addition = additions[Math.floor(Math.random() * additions.length)];
                enhanced += addition;
            }
        }
        
        return enhanced;
    }

    /**
     * Рассчитывает уникальность комментария
     */
    calculateUniqueness(comment, existingComments) {
        if (!existingComments || existingComments.length === 0) {
            return 1.0;
        }
        
        const commentWords = comment.toLowerCase().split(/\s+/);
        let maxSimilarity = 0;
        
        existingComments.forEach(existing => {
            const existingWords = existing.toLowerCase().split(/\s+/);
            const commonWords = commentWords.filter(word => existingWords.includes(word));
            const similarity = commonWords.length / Math.max(commentWords.length, existingWords.length);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        });
        
        return Math.max(0, 1 - maxSimilarity);
    }

    /**
     * Генерирует несколько вариантов комментариев
     */
    generateMultipleComments(count = 3, postContext = null, parsedComments = [], styleAnalysis = null) {
        const comments = [];
        
        for (let i = 0; i < count; i++) {
            const comment = this.generateComment(postContext, parsedComments, styleAnalysis);
            comments.push(comment);
        }
        
        // Сортируем по уникальности (самые уникальные первыми)
        comments.sort((a, b) => b.uniqueness - a.uniqueness);
        
        logger.analysis('ГЕНЕРАЦИЯ НЕСКОЛЬКИХ КОММЕНТАРИЕВ', {
            'Сгенерировано': comments.length,
            'Средняя уникальность': (comments.reduce((sum, c) => sum + c.uniqueness, 0) / comments.length).toFixed(2),
            'Лучший вариант': comments[0] ? comments[0].text.substring(0, 40) + '...' : 'Нет'
        });
        
        return comments;
    }

    /**
     * Очищает историю использованных шаблонов
     */
    resetUsedTemplates() {
        this.usedTemplates.clear();
        logger.info('🔄 История использованных шаблонов очищена');
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentGenerator();
