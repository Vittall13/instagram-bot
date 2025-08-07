/**
 * Парсер комментариев Instagram
 * Сбор и анализ последних комментариев с поста
 */

const logger = require('../utils/logger.js');
const delays = require('../utils/delays.js');

class CommentParser {
    constructor() {
        this.config = {
            maxComments: 50,           // Максимальное количество комментариев
            minCommentLength: 10,      // Минимальная длина комментария  
            maxCommentLength: 500,     // Максимальная длина комментария
            skipBotPatterns: [         // Паттерны bot комментариев
                /^(👍|❤️|🔥|💪|✨)$/,   // Только эмодзи
                /^(спасибо|thanks)$/i,   // Короткие благодарности
                /bot/i,                  // Содержит "bot"
                /instagram\.com/i        // Содержит ссылки
            ]
        };
        this.lastFoundCommentsCount = 0; // Отслеживание количества найденных комментариев
//        this.usedStrategies = [];      // Не зная зачем.????
    }

    /**
     * Подготовка страницы для парсинга: прокрутка и ожидание
     */
    async preparePageForParsing(page) {
    logger.info('🔄 Подготавливаем страницу для парсинга...');
    await page.waitForTimeout(2000);
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
        const article = document.querySelector('article');
        if (article) article.scrollTop += 300;
        else window.scrollBy(0, 300);
        });
        await page.waitForTimeout(1500);
    }
    }

    async tryMultipleParsingStrategies(page, targetCount = 20) {
    const strategies = [
        { name: 'current_pattern', selector: 'div._ap3a span[dir="auto"]' },
        { name: 'structural', selector: 'article div div span[dir="auto"]' },
        { name: 'broad', selector: 'span[dir="auto"]' }
    ];
    
    this.usedStrategies = [];
    
    for (const strategy of strategies) {
        try {
            logger.info(`🎯 Стратегия "${strategy.name}": ${strategy.selector} (цель: ${targetCount})`);
            
            const elements = await page.$$(strategy.selector);
            logger.info(`   Найдено ${elements.length} элементов`);
            
            if (elements.length > 0) {
                // ДИНАМИЧЕСКОЕ ИЗВЛЕЧЕНИЕ - берем столько сколько нужно
                const comments = [];
                const maxElements = Math.min(elements.length, targetCount + 5); // +5 запас на фильтрацию
                
                for (let i = 0; i < maxElements; i++) {
                    try {
                        const text = await elements[i].textContent();
                        if (text && text.trim().length > 10) {
                            comments.push(text.trim());
                            
                            // Останавливаемся когда достигли цели
                            if (comments.length >= targetCount) break;
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                logger.info(`   Извлечено ${comments.length} текстовых комментариев`);
                
                if (comments.length >= Math.min(targetCount * 0.7, 10)) {
                    logger.success(`✅ Стратегия "${strategy.name}" успешна!`);
                    this.usedStrategies.push(strategy.name);
                    return comments;
                }
            }
            
        } catch (error) {
            logger.debug(`❌ Стратегия "${strategy.name}" ошибка: ${error.message}`);
            continue;
        }
    }
    
    logger.warning('⚠️ Все стратегии не дали нужного результата');
    return [];
}

    /**
     * УПРОЩЕННАЯ АДАПТИВНАЯ СИСТЕМА v2.1
     */
    async parseCommentsFromPost(page) {
        try {
            logger.info('📖 Запуск динамического адаптивного парсинга...');
            logger.info('🔬 Начинаем парсинг с диагностикой...');
            
            // Подготовка страницы
            await this.preparePageForParsing(page);
            
            // УЛУЧШЕННАЯ ЛОГИКА: точное количество без ограничений
            const excludeCount = this.getExcludeCount();
            const targetUsefulComments = 20; // Сколько хотим получить для анализа
            const totalToParse = targetUsefulComments + excludeCount; // Парсим ровно столько сколько нужно

            logger.info(`🎯 Точный расчет: ${targetUsefulComments} полезных + ${excludeCount} для исключения = ${totalToParse} всего`);
            // logger.info(`🎯 Цель: ${targetUsefulComments} полезных комментариев`);
            // logger.info(`📊 Будем парсить ${totalToParse} комментариев (${targetUsefulComments} + ${excludeCount} для исключения)`);
            
            // Попытка парсинга с динамической целью
            let comments = await this.tryMultipleParsingStrategies(page, totalToParse);
            logger.info(`🔍 После tryMultipleParsingStrategies: ${comments.length} комментариев`);
            
            // Исключаем первые N комментариев (теперь без защиты от переисключения!)
            comments = this.filterCommentsByPosition(comments, excludeCount);
            logger.info(`🎯 После filterCommentsByPosition: ${comments.length} комментариев`);
            
            // Отбрасываем служебные сообщения
            comments = this.filterServiceMessages(comments);
            logger.info(`🧹 После filterServiceMessages: ${comments.length} комментариев`);
            
            logger.analysis('ДИНАМИЧЕСКИЙ АДАПТИВНЫЙ ПАРСИНГ', {
                'Цель парсинга': totalToParse,
                'Найдено комментариев': comments.length,
                'Исключено первых': excludeCount,
                'Стратегий использовано': this.usedStrategies.length
            });
            
            return comments.slice(0, 20); // Возвращаем максимум 20 для анализа
            
        } catch (error) {
            logger.debug('❌ DETECTED parseCommentsFromPost ERROR:', error);
            logger.error('❌ Ошибка динамического парсинга:', error.message);
            return [];
        }
    }

    /**
     * УЛУЧШЕННАЯ ПРОВЕРКА валидности комментария
     */
    isValidComment(text) {
        // Базовые проверки
        if (!text || text.length < 10 || text.length > 1000) return false;
        
        // Исключаем служебный код
        const excludePatterns = [
            // Служебные элементы Instagram/JavaScript
            /@media/i, /script/i, /require/i, /bootstrap/i,
            /{"require"/i, /qplTimingsServerJS/i, /CometSSR/i,
            /ajax/i, /comet_req/i, /JSScheduler/i,
            
            // CSS и стили
            /prefers-color-scheme/i, /:root{/i, /background/i,
            
            // Интерфейсные элементы
            /значок/i, /стрелка/i, /arrow/i, /icon/i,
            /загрузка/i, /loading/i, /контакт/i, /contact/i,
            
            // Служебные сообщения Instagram
            /instagram/i, /нравится/i, /like/i, /ответить/i, /reply/i,
            /показать/i, /show/i, /load more/i, /ago/i,
            
            // Технические строки
            /x1lliihq/i, /xeuugli/i, /x[0-9a-z]{6}/i // CSS классы Instagram
        ];
        
        const hasExcludedContent = excludePatterns.some(pattern => pattern.test(text));
        if (hasExcludedContent) return false;
        
        // Проверяем что это похоже на человеческий текст
        const hasLetters = /[а-яё]/i.test(text) || /[a-z]/i.test(text);
        const hasSpaces = text.includes(' ');
        const notOnlySymbols = !/^[^а-яёa-z]*$/i.test(text);
        
        return hasLetters && hasSpaces && notOnlySymbols;
    }

    /**
     * НОВЫЙ МЕТОД - фильтрация реальных комментариев от мусора
     */
    filterRealComments(comments) {
        const filtered = [];
        
        for (const comment of comments) {
            // Убираем дубликаты
            if (filtered.includes(comment)) continue;
            
            // Фильтруем по длине
            if (comment.length < 10 || comment.length > 500) continue;
            
            // Исключаем служебный текст
            const lowerComment = comment.toLowerCase();
            const excludePatterns = [
                // Служебные элементы Instagram
                'instagram', 'script', 'require', 'bootstrap',
                '@media', 'prefers-color-scheme', 'ajax',
                
                // Интерфейсные элементы
                'нравится', 'like', 'ответить', 'reply',
                'показать', 'show', 'load more', 'стрелка',
                'значок', 'icon', 'arrow',
                
                // Системные сообщения
                'loading', 'загрузка', 'error', 'ошибка'
            ];
            
            const hasExcludedContent = excludePatterns.some(pattern => 
                lowerComment.includes(pattern)
            );
            
            if (!hasExcludedContent) {
                filtered.push(comment);
            }
        }
        
        return filtered;
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

        /**
     * ДИАГНОСТИЧЕСКИЙ МЕТОД - анализ HTML структуры Instagram
     * Помогает понять где находятся комментарии на странице
     */
    async debugInstagramStructure(page) {
        try {
            logger.info('🔬 ДИАГНОСТИКА СТРУКТУРЫ INSTAGRAM...');
            
            // Ждем полной загрузки страницы
            await page.waitForTimeout(3000);
            
            // Прокручиваем вниз для загрузки комментариев
            await page.evaluate(() => {
                window.scrollBy(0, 800);
            });
            await page.waitForTimeout(2000);
            
            // // Сохраняем HTML страницы для анализа
            // const html = await page.content();
            // await require('fs').promises.writeFile('instagram-structure.html', html);
            // logger.info('📄 HTML структура сохранена в instagram-structure.html');
            
            // Анализируем количество элементов
            const allSpans = await page.$$eval('span', spans => spans.length);
            const allDivs = await page.$$eval('div', divs => divs.length);
            const textElements = await page.$$eval('*', elements => 
                elements.filter(el => el.textContent && el.textContent.trim().length > 10).length
            );
            
            logger.analysis('📊 СТРУКТУРА СТРАНИЦЫ', {
                'Всего span элементов': allSpans,
                'Всего div элементов': allDivs,
                'Элементов с текстом >10 символов': textElements
            });
            
            // Ищем потенциальные комментарии
            const potentialComments = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const comments = [];
                
                elements.forEach(el => {
                    const text = el.textContent?.trim();
                    if (text && 
                        text.length > 20 && 
                        text.length < 300 && 
                        !text.includes('Instagram') && 
                        !text.includes('ago') &&
                        !text.includes('like') &&
                        !text.includes('reply') &&
                        el.children.length === 0) { // Конечные элементы без детей
                        
                        comments.push({
                            text: text.substring(0, 50) + '...',
                            tagName: el.tagName,
                            className: el.className || 'no-class',
                            selector: el.getAttribute('data-testid') || 'no-testid'
                        });
                    }
                });
                
                return comments.slice(0, 15); // Первые 15 для анализа
            });
            
            logger.info('🔍 ПОТЕНЦИАЛЬНЫЕ КОММЕНТАРИИ:');
            potentialComments.forEach((comment, index) => {
                logger.info(`  ${index + 1}. "${comment.text}" [${comment.tagName}.${comment.className}]`);
            });
            
            // Дополнительная диагностика селекторов
            const selectorTests = [
                'article span[dir="auto"]',
                'div[role="button"] span',
                'ul li span',
                'div span:not([aria-label])',
                '[data-testid="comment"] span',
                'article div div span'
            ];
            
            logger.info('🧪 ТЕСТИРОВАНИЕ СЕЛЕКТОРОВ:');
            for (const selector of selectorTests) {
                try {
                    const elements = await page.$$(selector);
                    logger.info(`  "${selector}" → найдено ${elements.length} элементов`);
                } catch (error) {
                    logger.info(`  "${selector}" → ошибка: ${error.message}`);
                }
            }
            
            return potentialComments;
            
        } catch (error) {
            logger.error('❌ Ошибка диагностики HTML структуры:', error.message);
            return [];
        }
    }   
    
    // Прогрессивное исключение собственных комментариев
    filterCommentsByPosition(comments, excludeCount = null) {
        if (excludeCount === null) {
            excludeCount = this.getExcludeCount();
        }
        
        logger.info(`🎯 Исключаем первые ${excludeCount} комментариев из ${comments.length}`);
        
        // ПРОСТАЯ ЛОГИКА БЕЗ ЗАЩИТЫ - теперь она не нужна!
        return comments.slice(excludeCount);
    }
    
    // Рассчитывает количество комментариев для исключения
    getExcludeCount() {
        const fs = require('fs');
        const file = 'bot-start-time.txt';
        const now = new Date();
        const today = now.toDateString(); // "Thu Aug 07 2025"
        
        // Проверяем рабочее время
        const startHour = parseInt(process.env.WORKING_HOURS_START) || 7;
        const endHour = parseInt(process.env.WORKING_HOURS_END) || 23;
        const currentHour = now.getHours();
        const isWorkingTime = currentHour >= startHour && currentHour < endHour;
        
        let workData = {
            date: today,
            startTime: now.toISOString(),
            commentsCount: 3 // Начинаем с 3 (базовое количество)
        };
        
        try {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8').trim();
                
                // Пробуем парсить как JSON (новый формат)
                try {
                    const savedData = JSON.parse(content);
                    
                    // Проверяем тот ли это день
                    if (savedData.date === today) {
                        workData = savedData;
                        logger.info(`⏰ Продолжаем работу в том же дне. Комментариев: ${workData.commentsCount}`);
                    } else {
                        logger.info(`🌅 Новый день! Был: ${savedData.date}, стал: ${today}`);
                        logger.info(`🔄 Обнуляем счетчик с ${savedData.commentsCount} до 3`);
                    }
                } catch {
                    // Старый формат (только время) - конвертируем
                    const savedTime = new Date(content);
                    const savedDay = savedTime.toDateString();
                    
                    if (savedDay === today) {
                        workData.startTime = content;
                        logger.warning(`⚠️ Конвертируем старый формат файла для дня: ${savedDay}`);
                    } else {
                        logger.info(`🌅 Новый день при конвертации! Был: ${savedDay}, стал: ${today}`);
                    }
                }
            } else {
                logger.info(`🆕 Создаем новый файл для дня: ${today}`);
            }
        } catch (error) {
            logger.warning('⚠️ Ошибка чтения файла, создаем новый');
        }
        
        // Дополнительная проверка: если сейчас начало рабочего дня - обнуляем счетчик
        if (isWorkingTime) {
            const startOfWorkDay = new Date(now);
            startOfWorkDay.setHours(startHour, 0, 0, 0);
            const workStarted = new Date(workData.startTime);
            
            // Если прошло время начала работы и файл старый - обнуляем
            if (now >= startOfWorkDay && workStarted < startOfWorkDay) {
                logger.info(`🌅 Начало рабочего дня в ${startHour}:00 - обнуляем счетчик`);
                workData.commentsCount = 3;
                workData.startTime = now.toISOString();
            }
        }
        
        // Сохраняем обновленные данные
        try {
            fs.writeFileSync(file, JSON.stringify(workData, null, 2));
        } catch (error) {
            logger.error('❌ Ошибка сохранения файла времени', { message: error.message });
        }
        
        logger.info(`🎯 Исключаем ${workData.commentsCount} комментариев (${workData.commentsCount - 3} опубликованных + 3 базовых)`);
        return workData.commentsCount;
    }

    /**
     * Увеличение счетчика опубликованных комментариев
     */
    async incrementPublishedCount() {
        const fs = require('fs');
        const file = 'bot-start-time.txt';
        const { readFile, writeFile } = require('fs').promises;
        if (!fs.existsSync(file)) this.getExcludeCount();    // создаст файл
        
        try {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8').trim();
                const workData = JSON.parse(content);
                
                // Увеличиваем счетчик
                workData.commentsCount = (workData.commentsCount || 3) + 1;
                workData.lastComment = new Date().toISOString();
                
                // Сохраняем
                fs.writeFileSync(file, JSON.stringify(workData, null, 2));
                
                logger.info(`📈 Счетчик увеличен до ${workData.commentsCount} (опубликованных: ${workData.commentsCount - 3})`);
                return workData.commentsCount;
            } else {
                logger.error('❌ Файл bot-start-time.txt не найден при увеличении счетчика');
                return 3;
            }
        } catch (error) {
            logger.error('❌ Ошибка увеличения счетчика', { message: error.message });
            return 3;
        }
    }

    // Фильтрация служебных сообщений Instagram
    filterServiceMessages(comments) {
        return comments.filter(text => {
            const patterns = [
                /к сожалению.*не удается/i,
                /оригинальное аудио/i,
                /подробнее/i,
                /\d+.*(отметок|часов назад|минут назад|дней назад)/i,
                /^[a-z0-9_.]+$/i
            ];
            return !patterns.some(p => p.test(text)) && text.includes(' ');
        });
    }
}

// Экспортируем готовый экземпляр
module.exports = new CommentParser();
