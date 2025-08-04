/**
 * Анализатор изображений для фильтрации постов Instagram
 * Отделяет настоящие посты от профильных фото и историй
 */

const logger = require('../utils/logger.js');

class ImageAnalyzer {
    constructor() {
        this.config = {
            // Размеры для фильтрации
            minPostSize: 200,           // Минимальный размер настоящего поста
            maxProfilePhotoSize: 150,   // Максимальный размер фото профиля
            profilePhotoRatio: 1.0,     // Соотношение сторон профильного фото (квадрат)
            
            // Ключевые слова для фильтрации
            storyKeywords: ['story', 'история', 'сторис'],
            profileKeywords: ['profile', 'профиль', 'avatar', 'аватар']
        };
    }

    /**
     * Анализирует изображение и определяет его тип
     * @param {Object} image - Элемент изображения
     * @param {Object} boundingBox - Размеры изображения  
     * @param {string} caption - Подпись к изображению
     */
    async analyzeImage(image, boundingBox, caption = '') {
        const analysis = {
            width: boundingBox.width,
            height: boundingBox.height,
            ratio: boundingBox.width / boundingBox.height,
            caption: caption,
            isProfilePhoto: false,
            isStory: false,
            isRealPost: false,
            isClickable: false
        };

        // Анализ размера
        analysis.isProfilePhoto = this.isProfilePhoto(boundingBox);
        analysis.isStory = this.isStory(boundingBox, caption);
        analysis.isRealPost = this.isRealPost(boundingBox, caption);
        
        // Проверка кликабельности
        analysis.isClickable = await this.isClickable(image);

        return analysis;
    }

    /**
     * Определяет является ли изображение фото профиля
     */
    isProfilePhoto(boundingBox) {
        const { width, height } = boundingBox;
        const ratio = width / height;
        
        // Профильные фото обычно маленькие и квадратные
        return (
            width <= this.config.maxProfilePhotoSize ||
            height <= this.config.maxProfilePhotoSize ||
            Math.abs(ratio - this.config.profilePhotoRatio) < 0.1
        );
    }

    /**
     * Определяет является ли изображение историей
     */
    isStory(boundingBox, caption) {
        // Проверяем ключевые слова в подписи
        const lowerCaption = caption.toLowerCase();
        const hasStoryKeywords = this.config.storyKeywords.some(keyword => 
            lowerCaption.includes(keyword)
        );

        // Истории обычно имеют определенное соотношение сторон (9:16)
        const ratio = boundingBox.width / boundingBox.height;
        const isStoryRatio = ratio < 0.7; // Вертикальное изображение

        return hasStoryKeywords || isStoryRatio;
    }

    /**
     * Определяет является ли изображение настоящим постом
     */
    isRealPost(boundingBox, caption) {
        const { width, height } = boundingBox;
        
        // Настоящие посты обычно больше определенного размера
        const isBigEnough = width >= this.config.minPostSize && height >= this.config.minPostSize;
        
        // Не является профильным фото или историей
        const notProfilePhoto = !this.isProfilePhoto(boundingBox);
        const notStory = !this.isStory(boundingBox, caption);
        
        return isBigEnough && notProfilePhoto && notStory;
    }

    /**
     * Проверяет кликабельность изображения
     */
    async isClickable(image) {
        try {
            // Проверяем является ли элемент или его родитель кликабельным
            const clickableParent = await image.evaluateHandle(el => {
                // Проверяем текущий элемент и родителей
                let current = el;
                while (current && current.tagName !== 'BODY') {
                    if (
                        current.tagName === 'A' ||
                        current.tagName === 'BUTTON' ||
                        current.getAttribute('role') === 'button' ||
                        current.style.cursor === 'pointer' ||
                        current.hasAttribute('onclick')
                    ) {
                        return current;
                    }
                    current = current.parentElement;
                }
                return null;
            });

            const isClickable = await clickableParent.evaluate(el => el !== null);
            await clickableParent.dispose();
            
            return isClickable;
        } catch (error) {
            logger.debug(`Ошибка проверки кликабельности: ${error.message}`);
            return false;
        }
    }

    /**
     * Анализирует все изображения на странице и фильтрует их
     */
    async analyzeAndFilterImages(page) {
        try {
            logger.info('🔍 Анализируем и фильтруем изображения...');
            
            // Получаем все изображения
            const images = await page.$$('img');
            
            const analysisResults = {
                total: images.length,
                profilePhotos: 0,
                stories: 0,
                realPosts: 0,
                clickablePosts: [],
                allAnalysis: []
            };

            // Анализируем каждое изображение
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                
                try {
                    // Получаем размеры
                    const boundingBox = await image.boundingBox();
                    if (!boundingBox) continue;

                    // Получаем подпись (пытаемся найти ближайший текст)
                    const caption = await this.extractCaption(image);
                    
                    // Анализируем изображение
                    const analysis = await this.analyzeImage(image, boundingBox, caption);
                    
                    // Подсчитываем статистику
                    if (analysis.isProfilePhoto) analysisResults.profilePhotos++;
                    if (analysis.isStory) analysisResults.stories++;
                    if (analysis.isRealPost) analysisResults.realPosts++;
                    
                    // Сохраняем кликабельные посты
                    if (analysis.isRealPost && analysis.isClickable) {
                        analysisResults.clickablePosts.push({
                            image: image,
                            analysis: analysis,
                            index: i + 1
                        });
                    }

                    analysisResults.allAnalysis.push(analysis);
                    
                } catch (error) {
                    logger.debug(`Ошибка анализа изображения ${i + 1}: ${error.message}`);
                }
            }

            // Логируем результаты анализа
            this.logAnalysisResults(analysisResults);
            
            return analysisResults;
            
        } catch (error) {
            logger.error('Ошибка анализа изображений', { message: error.message });
            throw error;
        }
    }

    /**
     * Извлекает подпись к изображению
     */
    async extractCaption(image) {
        try {
            // Пытаемся найти подпись рядом с изображением
            const caption = await image.evaluate(img => {
                // Проверяем alt атрибут
                if (img.alt && img.alt.length > 10) {
                    return img.alt;
                }

                // Ищем текст в родительских элементах
                let parent = img.parentElement;
                let attempts = 0;
                while (parent && attempts < 3) {
                    const textContent = parent.textContent || '';
                    if (textContent.length > 10 && textContent.length < 500) {
                        return textContent.substring(0, 200);
                    }
                    parent = parent.parentElement;
                    attempts++;
                }

                return '';
            });

            return caption || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Логирует результаты анализа
     */
    logAnalysisResults(results) {
        logger.analysis('АНАЛИЗ ИЗОБРАЖЕНИЙ С ФИЛЬТРАЦИЕЙ', {
            'Всего изображений': results.total,
            'Фото профиля': results.profilePhotos,
            'Истории': results.stories,
            'Настоящие посты': results.realPosts,
            'Отфильтрованные посты': results.clickablePosts.length
        });

        if (results.clickablePosts.length > 0) {
            logger.success('\n🎯 НАЙДЕННЫЕ ПОСТЫ:');
            
            results.clickablePosts.forEach((post, index) => {
                const analysis = post.analysis;
                logger.info(`   ${index + 1}. Размер: ${analysis.width}x${analysis.height}, Подпись: ${analysis.caption.substring(0, 80)}...`);
                logger.info(`      Кликабельно: ✅`);
            });
        }
    }

    /**
     * Выбирает лучший пост для комментирования
     */
    selectBestPost(analysisResults) {
        const posts = analysisResults.clickablePosts;
        
        if (posts.length === 0) {
            logger.warning('Подходящие посты не найдены');
            return null;
        }

        // Берем первый подходящий пост
        const selectedPost = posts[0];
        const analysis = selectedPost.analysis;

        logger.success('\n🎯 ВЫБИРАЕМ ПЕРВЫЙ ПОСТ:');
        logger.info(`   Размер: ${analysis.width}x${analysis.height}`);
        logger.info(`   Подпись: ${analysis.caption}`);
        logger.info(`   Кликабельность: ✅`);

        return selectedPost;
    }
}

// Экспортируем готовый экземпляр
module.exports = new ImageAnalyzer();
