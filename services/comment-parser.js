/**
 * Парсер комментариев Instagram
 * Сбор и анализ последних комментариев с поста
 */

const logger = require('../utils/logger.js');
const delays = require('../utils/delays.js');

class CommentParser {
    constructor() {
        this.config = {
            maxComments: 20,           // Максимальное количество комментариев
            minCommentLength: 10,      // Минимальная длина комментария  
            maxCommentLength: 500,     // Максимальная длина комментария
            skipBotPatterns: [         // Паттерны bot комментариев
                /^(👍|❤️|🔥|💪|✨)$/,   // Только эмодзи
                /^(спасибо|thanks)$/i,   // Короткие благодарности
                /bot/i,                  // Содержит "bot"
                /instagram\.com/i        // Содержит ссылки
            ]
        };
    }

    /**
     * Собирает последние комментарии с открытого поста
     */
    async parseCommentsFromPost(page) {
        try {
            logger.info('📖 Собираем последние комментарии для анализа...');
            
            // Прокручиваем немного вниз для загрузки комментариев
            await page.evaluate(() => {
                window.scrollBy(0, 300);
            });
            await delays.randomDelay(1000, 2000);

            // Получаем все комментарии
            const commentElements = await page.$$('[role="article"] span[dir="auto"]');
            
            const rawComments = [];
            for (const element of commentElements) {
                try {
                    const text = await element.textContent();
                    if (text && text.length > 5) {
                        rawComments.push(text.trim());
                    }
                } catch (error) {
                    // Пропускаем проблемные элементы
                    continue;
                }
            }

            // Фильтруем и обрабатываем комментарии
            const cleanComments = this.filterAndCleanComments(rawComments);
            
            logger.analysis('ПАРСИНГ КОММЕНТАРИЕВ', {
                'Найдено комментариев': rawComments.length,
                'После фильтрации': cleanComments.length,
                'Взято для анализа': Math.min(cleanComments.length, this.config.maxComments)
            });

            return cleanComments.slice(0, this.config.maxComments);
            
        } catch (error) {
            logger.error('Ошибка парсинга комментариев', { message: error.message });
            return [];
        }
    }

    /**
     * Фильтрует и очищает комментарии
     */
    filterAndCleanComments(rawComments) {
        const filtered = [];
        
        for (const comment of rawComments) {
            // Пропускаем слишком короткие или длинные
            if (comment.length < this.config.minCommentLength || 
                comment.length > this.config.maxCommentLength) {
                continue;
            }

            // Пропускаем bot-подобные комментарии
            if (this.isBotLikeComment(comment)) {
                continue;
            }

            // Очищаем от лишних символов
            const cleaned = this.cleanComment(comment);
            if (cleaned) {
                filtered.push(cleaned);
            }
        }

        // Убираем дубликаты
        return [...new Set(filtered)];
    }

    /**
     * Проверяет является ли комментарий bot-подобным
     */
    isBotLikeComment(comment) {
        return this.config.skipBotPatterns.some(pattern => pattern.test(comment));
    }

    /**
     * Очищает комментарий от лишних символов
     */
    cleanComment(comment) {
        return comment
            .replace(/\s+/g, ' ')           // Множественные пробелы в один
            .replace(/[^\w\sа-яёА-ЯЁ!?.,]/gi, '') // Только буквы, цифры, знаки препинания
            .trim();
    }

    /**
     * Анализирует тональность и стиль комментариев
     */
    analyzeCommentStyle(comments) {
        const analysis = {
            averageLength: 0,
            commonWords: [],
            sentiment: 'neutral',
            style: 'casual'
        };

        if (comments.length === 0) return analysis;

        // Средняя длина
        analysis.averageLength = Math.round(
            comments.reduce((sum, comment) => sum + comment.length, 0) / comments.length
        );

        // Частые слова (простая реализация)
        const wordFreq = {};
        comments.forEach(comment => {
            comment.toLowerCase().split(/\s+/).forEach(word => {
                if (word.length > 3) {
                    wordFreq[word] = (wordFreq[word] || 0) + 1;
                }
            });
        });

        analysis.commonWords = Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([word]) => word);

        logger.analysis('АНАЛИЗ СТИЛЯ КОММЕНТАРИЕВ', {
            'Средняя длина': analysis.averageLength,
            'Частые слова': analysis.commonWords.slice(0, 5).join(', '),
            'Общий стиль': analysis.style
        });

        return analysis;
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentParser();
