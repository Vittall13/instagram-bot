/**
 * Генератор комментариев для Instagram бота
 * Интеграция с OpenAI API через OpenRouter 
 * model = "moonshotai/kimi-k2:free" (из основного проекта)
 */

const logger = require('../utils/logger.js');
const { OpenAI } = require('openai');

class CommentGenerator {
    constructor() {
        // Настройки API из основного проекта
        this.openaiClient = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY
        });
        
        this.model = "moonshotai/kimi-k2:free"; // Бесплатная модель как в основном проекте
        this.similarityThreshold = parseInt(process.env.SIMILARITY_CONST || "50");
        this.maxRetries = 5;
        this.retryDelay = parseInt(process.env.PRE_POST_DELAY || "30");
        
        // Fallback комментарии из основного проекта
        this.fallbackComments = [
            "🙂 Полностью согласен с мнением автора.",
            "Очень правильные слова. Спасибо за такой важный пост.",
            "Именно эти мысли нужно доносить до людей. Молодец!",
            "Такие слова вдохновляют и дают силы. Спасибо!",
            "Отличная позиция! Полностью разделяю эти взгляды."
        ];
    }

    /**
     * ГЛАВНАЯ ФУНКЦИЯ - Batch генерация 5 комментариев (как в основном проекте)
     * Почему batch: эффективнее по API лимитам, быстрее заполнение буфера
     */
    async generateBatchComments(contextComments = [], maxAttempts = 5) {
        try {
            logger.info('🤖 Запуск batch-генерации 5 комментариев...');
            
            // Проверяем есть ли контекст для анализа
            if (!contextComments || contextComments.length === 0) {
                logger.warning(' Нет комментариев для анализа. Используем fallback.');
                return this.fallbackComments.slice(0, 5);
            }

            // Пытаемся сгенерировать комментарии несколько раз
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                logger.info(`Попытка генерации #${attempt} из ${maxAttempts}`);
                
                try {
                    // Формируем промпт как в основном проекте
                    const prompt = this.buildBatchPrompt(contextComments);
                    
                    // Генерируем с retry логикой
                    const generatedText = await this.generateWithRetry(prompt);
                    
                    // Парсим результат в список комментариев
                    const parsedComments = this.parseBatchComments(generatedText, 5);
                    
                    if (parsedComments && parsedComments.length >= 5) {
                        logger.success(`✅ Успешно сгенерировано ${parsedComments.length} комментариев с попытки #${attempt}`);
                        return parsedComments.slice(0, 5); // Берём ровно 5
                    } else {
                        logger.warning(`❌ Попытка #${attempt} не удалась. Повторяем генерацию...`);
                        continue;
                    }
                    
                } catch (error) {
                    logger.warning(`❌ Ошибка в попытке #${attempt}: ${error.message}`);
                    if (attempt === maxAttempts) {
                        throw error; // Если последняя попытка - пробрасываем ошибку
                    }
                }
            }

            // Если все попытки неудачны - используем fallback
            logger.error('❌ Не удалось сгенерировать комментарии. Используем fallback.');
            return this.fallbackComments.slice(0, 5);

        } catch (error) {
            logger.error('❌ Критическая ошибка в generateBatchComments:', error.message);
            return this.fallbackComments.slice(0, 5);
        }
    }

    /**
     * Формирует промпт для batch генерации (точно как в основном проекте)
     * Почему так: проверенный промпт дает стабильные результаты
     */
    buildBatchPrompt(contextComments) {
        let prompt = "Ты профессиональный копирайтер, напиши 5 разных, оригинальных комментариев на основе следующих комментариев:\n";
        prompt += contextComments.join('\n');
        prompt += "\nКаждый комментарий должен быть написан в спокойной манере и длиной около 250 символов. ";
        prompt += "Пожалуйста, всегда нумеруй комментарии строго в виде: 1. ... 2. ... 3. ... и так далее!!!";
        
        return prompt;
    }

    /**
     * Генерация с умной retry логикой (из основного проекта)
     * Почему разные задержки: для 429 ошибок нужны длительные паузы, для других - короткие
     */
    async generateWithRetry(prompt) {
        let retryCount = 0;
        const maxQuickRetries = 3;
        const hourDelay = 3600; // 60 минут для rate limit

        while (true) {
            try {
                const completion = await this.openaiClient.chat.completions.create({
                    model: this.model,
                    messages: [{ role: "user", content: prompt }]
                });

                // Проверяем корректность ответа
                if (!completion?.choices?.[0]?.message?.content) {
                    throw new Error("API вернул пустой ответ");
                }

                const generatedText = completion.choices[0].message.content.strip();
                
                if (retryCount > 0) {
                    logger.info(`✅ Успешная генерация после ${retryCount} попыток`);
                }
                
                return generatedText;

            } catch (error) {
                retryCount++;
                
                // Обработка 429 ошибок (rate limit) - как в основном проекте
                if (error.message.includes("429") || error.status === 429) {
                    if (retryCount <= maxQuickRetries) {
                        logger.warning(`Rate limit попытка ${retryCount}/${maxQuickRetries}. Ждем ${this.retryDelay} секунд...`);
                        await this.sleep(this.retryDelay * 1000);
                    } else {
                        logger.warning(`Rate limit после ${maxQuickRetries} быстрых попыток. Переходим на ожидание ${hourDelay/60} минут.`);
                        await this.sleep(hourDelay * 1000);
                    }
                } else {
                    // Для других ошибок - стандартные паузы
                    logger.error(`❌ Ошибка генерации (попытка #${retryCount}): ${error.message}`);
                    logger.info(`Повторяем через ${this.retryDelay} секунд...`);
                    await this.sleep(this.retryDelay * 1000);
                }
            }
        }
    }

    /**
     * Парсинг batch ответа в список комментариев (из основного проекта)
     * Почему регулярные выражения: AI может форматировать по-разному
     */
    parseBatchComments(text, expectedCount = 5) {
        const lines = text.trim().split('\n');
        const comments = [];

        for (const line of lines) {
            // Универсальный паттерн: цифра + разделители + текст
            const match = line.trim().match(/^\d+\s*[\.\)\-\:]*\s*(.+)/);
            if (match) {
                const comment = match[1].trim();
                if (comment && comment.length > 10) { // Минимальная длина
                    comments.push(comment);
                }
            }
        }

        logger.info(` Распарсено ${comments.length} из ${expectedCount} ожидаемых комментариев`);

        // Если получили достаточно комментариев - возвращаем
        if (comments.length >= expectedCount) {
            return comments.slice(0, expectedCount);
        } else {
            // Если мало - возвращаем пустой массив для повторной попытки
            logger.warning(` Получено только ${comments.length} комментариев из ${expectedCount}. Требуется повторная генерация.`);
            return [];
        }
    }

    /**
     * Проверка схожести комментариев (из основного проекта)
     * Почему нужна: избегаем повторяющихся комментариев
     */
    calculateSimilarity(textA, textB) {
        if (!textA || !textB) return 0;
        
        const a = textA.toLowerCase();
        const b = textB.toLowerCase();
        
        // Простой алгоритм схожести
        const wordsA = a.split(/\s+/);
        const wordsB = b.split(/\s+/);
        
        let commonWords = 0;
        for (const word of wordsA) {
            if (wordsB.includes(word) && word.length > 3) {
                commonWords++;
            }
        }
        
        const maxWords = Math.max(wordsA.length, wordsB.length);
        const similarity = (commonWords / maxWords) * 100;
        
        logger.debug(` Схожесть текстов: ${similarity.toFixed(2)}%`);
        return similarity;
    }

    /**
     * Генерация одного комментария (для экстренных случаев)
     */
    generateSingleComment(contextComments = []) {
        if (!contextComments || contextComments.length === 0) {
            const randomFallback = this.fallbackComments[Math.floor(Math.random() * this.fallbackComments.length)];
            logger.info('Использован fallback комментарий');
            return randomFallback;
        }

        // Для одиночной генерации используем более простой алгоритм
        const templates = [
            "Полностью поддерживаю! {context}",
            "Очень важные слова. {context}", 
            "Абсолютно согласен. {context}",
            "Правильная позиция! {context}",
            "Мудрые мысли. {context}"
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];
        const contextWord = this.extractContextWord(contextComments);
        
        return template.replace("{context}", contextWord ? `Особенно про ${contextWord}.` : "");
    }

    /**
     * Извлечение ключевого слова из контекста
     */
    extractContextWord(comments) {
        const allText = comments.join(' ').toLowerCase();
        const words = allText.split(/\s+/).filter(word => word.length > 4);
        const commonWords = ['очень', 'всего', 'более', 'себя', 'было', 'есть', 'даже'];
        const meaningfulWords = words.filter(word => !commonWords.includes(word));
        
        return meaningfulWords.length > 0 ? meaningfulWords[Math.floor(Math.random() * meaningfulWords.length)] : '';
    }

    /**
     * Утилита для задержек
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentGenerator();
