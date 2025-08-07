const { chromium } = require('playwright');
const fs = require('fs').promises;
const config = require('./config/config.js');
const logger = require('./utils/logger.js'); 
const delays = require('./utils/delays.js'); 
const imageAnalyzer = require('./services/image-analyzer.js'); 
const BrowserManager = require('./core/browser-manager.js'); 
const commentParser = require('./services/comment-parser.js'); 
const commentGenerator = require('./services/comment-generator.js'); 
const commentBuffer = require('./services/comment-buffer.js');  

class InstagramBot {
    constructor() {
        this.browserManager = new BrowserManager(config);
        this.page = null;
        this.config = {
      targetProfile: config.instagram.targetProfile,
      comment: config.instagram.comment,
      timeouts: config.timeouts,
      delays: config.delays
    };
  }
/**
 * ИНИЦИАЛИЗАЦИЯ ДЛЯ ПОСТОЯННОЙ РАБОТЫ
 */
async init() {
    try {
        // УЛУЧШЕННАЯ ПРОВЕРКА КОНФИГУРАЦИИ
        const profileUrl = this.config.targetProfile || this.config.profile?.username;
        
        if (!profileUrl) {
            logger.error('❌ Конфигурация не найдена!');
            logger.error('📋 Проверьте файл config/config.json');
            logger.error('📋 Должно содержать: "targetProfile": "https://www.instagram.com/username/"');
            throw new Error('Не указан профиль для мониторинга');
        }
        
        logger.info(`🎯 Целевой профиль: ${profileUrl}`);
        
        // Загружаем рабочие часы
        const startHour = parseInt(process.env.WORKING_HOURS_START) || this.config.workingHours?.[0] || 9;
        const endHour = parseInt(process.env.WORKING_HOURS_END) || this.config.workingHours?.[1] || 18;
        logger.info(`⏰ Рабочие часы: ${startHour}:00 - ${endHour}:00`);
        
        // Инициализация сервисов
        this.initializeServices();
        
        logger.success('✅ Инициализация завершена');
        logger.info('🚀 Бот готов к постоянной работе');
        
        return true;
        
    } catch (error) {
        logger.error('❌ Ошибка инициализации', { message: error.message });
        return false;
    }
}

  /**
   * ИНИЦИАЛИЗАЦИЯ СЕРВИСОВ
   */
  initializeServices() {
      // Инициализация может быть пустой или содержать настройку сервисов
      logger.info('🔧 Сервисы инициализированы');
  }

async login() {
    try {
        // === РАСШИРЕННАЯ ДИАГНОСТИКА АВТОРИЗАЦИИ ===
        logger.debug('🔍 === ДИАГНОСТИКА АВТОРИЗАЦИИ ===');
        logger.debug('🔍 BrowserManager.loadSession:', typeof this.browserManager.loadSession);
        logger.debug('🔍 BrowserManager.saveSession:', typeof this.browserManager.saveSession);
        
        // Пробуем загрузить сессию с детальным логированием
        logger.debug('🔍 Попытка загрузки сессии...');
        const sessionLoaded = await this.browserManager.loadSession();
        logger.debug('🔍 Результат загрузки сессии:', sessionLoaded);
        
        // Остальная логика остается без изменений...
        logger.info('🔐 Переходим на Instagram...');
      await this.page.goto('https://www.instagram.com', { 
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeouts.navigation 
      });
      
      await this.page.waitForTimeout(3000);

      try {
        await this.page.waitForSelector('svg[aria-label="Home"], [aria-label="Home"], a[href="/"]', { 
          timeout: 8000 
        });
        logger.success('✅ Авторизация успешна!');
        return true;
      } catch {
        // Сессия не сработала - детальная диагностика
        logger.warning('⚠️ Сохраненная сессия недействительна');
        logger.debug('🔍 Проверяем причины...');
        
        // Проверяем доступность учетных данных из .env
        const hasEnvCredentials = process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD;
        logger.debug('🔍 Учетные данные в .env:', hasEnvCredentials ? 'найдены' : 'отсутствуют');
        
        if (hasEnvCredentials) {
            logger.info('🔄 Попытка автоматической авторизации через .env...');
            // Здесь можно добавить автоматический вход через учетные данные
            // НО: только если вы согласитесь на этот механизм
        }
        
        // Fallback к ручному вводу (существующий код)
        logger.success('🔑 Требуется ручная авторизация...');
        logger.success('📝 Войдите в Instagram и нажмите Enter...');
        
        await new Promise(resolve => {
          process.stdin.once('data', () => {
            logger.info('✅ Продолжаем работу...');
            resolve();
          });
        });
        
        await this.browserManager.saveSession();

        return true;
      }
    } catch (error) {
      logger.error('Ошибка авторизации', { message: error.message });
      return false;
    }
    }

  // ✅ УЛУЧШЕННЫЙ поиск с фильтрацией постов
  async findAndClickActualPost() {
      try {
          logger.action('Ищем НАСТОЯЩИЕ ПОСТЫ (исключаем профиль и истории)');
          
          // Переходим к профилю
          logger.info('🌐 Переходим к профилю...');
          await this.page.goto(this.config.targetProfile, { 
              waitUntil: 'domcontentloaded',
              timeout: this.config.timeouts.navigation 
          });
          
          await delays.betweenActions();

          // Анализируем изображения с помощью нового модуля
          const analysisResults = await imageAnalyzer.analyzeAndFilterImages(this.page);
          
          // Выбираем лучший пост
          const selectedPost = imageAnalyzer.selectBestPost(analysisResults);
          
          if (!selectedPost) {
              throw new Error('Не найдено подходящих постов для комментирования');
          }

          // Кликаем по выбранному посту
          logger.info('\n🖱️ Кликаем по изображению поста...');
          
          await selectedPost.image.click();
          logger.success(`✅ Клик выполнен по элементу: A`);
          
          // Получаем ссылку на пост
          const href = await selectedPost.image.evaluate(img => {
              const link = img.closest('a');
              return link ? link.href : null;
          });
          
          if (href) {
              logger.info(`   Ссылка: ${href}`);
          }

          await delays.waitForClickResponse();

          // Проверяем что пост действительно открылся
          const currentUrl = this.page.url();
          logger.info(`📍 URL после клика: ${currentUrl}`);

          // Проверяем наличие ключевых элементов поста
          const postOpened = await this.page.evaluate(() => {
              return {
                  hasModal: !!document.querySelector('div[role="dialog"], div[aria-modal="true"], div[class*="modal"]'),
                  hasPostUrl: window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/'),
                  hasCommentField: !!document.querySelector('textarea, [contenteditable="true"]')
              };
          });

          logger.info(`📱 Модальное окно: ${postOpened.hasModal ? '✅ найдено' : '❌ не найдено'}`);
          logger.info(`🔗 URL поста: ${postOpened.hasPostUrl ? '✅ найден' : '❌ не найден'}`);
          logger.info(`💬 Поле комментария: ${postOpened.hasCommentField ? '✅ найдено' : '❌ не найдено'}`);

          if (postOpened.hasModal || postOpened.hasPostUrl) {logger.success('✅ Пост успешно открыт!');
              return true;
          } else {
              throw new Error('Пост не открылся - модальное окно или URL поста не найдены');
          }

          
      } catch (error) {
          logger.error('Ошибка поиска и клика по посту', { message: error.message });
          
          try {
              await this.page.screenshot({
                  path: 'post-click-error-screenshot.png',
                  fullPage: true
              });
              logger.info('📸 Скриншот ошибки: post-click-error-screenshot.png');
          } catch {}
          
          throw error;
      }
  }

  //  УЛУЧШЕННЫЙ поиск поля комментария
  async commentOnOpenPost() {
    logger.info(` ДИАГНОСТИКА: Начало commentOnOpenPost() - ${Date.now()}`);   
    try {
      logger.info(' Ищем поле комментария с расширенной диагностикой...');
      
      // Дополнительное ожидание полной загрузки
      await this.page.waitForTimeout(3000);
      
      //  Сначала диагностируем страницу
      const pageAnalysis = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          textareas: document.querySelectorAll('textarea').length,
          contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
          forms: document.querySelectorAll('form').length,
          buttons: document.querySelectorAll('button').length,
          inputs: document.querySelectorAll('input').length,
          allElements: document.querySelectorAll('*').length
        };
      });
      
      logger.analysis(' ДИАГНОСТИКА СТРАНИЦЫ:');
      logger.analysis(`   URL: ${pageAnalysis.url}`);
      logger.analysis(`   Заголовок: ${pageAnalysis.title}`);
      logger.analysis(`   Textarea элементов: ${pageAnalysis.textareas}`);
      logger.analysis(`   ContentEditable элементов: ${pageAnalysis.contentEditables}`);
      logger.analysis(`   Форм: ${pageAnalysis.forms}`);
      logger.analysis(`   Кнопок: ${pageAnalysis.buttons}`);
      logger.analysis(`   Input элементов: ${pageAnalysis.inputs}`);
      
      // ✅ Расширенные селекторы для поля комментария в разных ситуациях
      const commentSelectors = [
        // Стандартные селекторы
        'textarea[aria-label*="комментарий" i]',
        'textarea[aria-label*="comment" i]',
        'textarea[placeholder*="комментарий" i]',
        'textarea[placeholder*="comment" i]',
        'textarea[aria-label="Add a comment…"]',
        'textarea[placeholder="Add a comment…"]',
        
        // Русские варианты
        'textarea[aria-label*="Добавьте комментарий"]',
        'textarea[placeholder*="Добавьте комментарий"]',
        'textarea[aria-label*="Напишите комментарий"]',
        'textarea[placeholder*="Напишите комментарий"]',
        
        // В модальных окнах
        '[role="dialog"] textarea',
        '[aria-modal="true"] textarea',
        '.modal textarea',
        
        // ContentEditable элементы
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][data-text*="comment" i]',
        '[contenteditable="true"][placeholder*="comment" i]',
        
        // Универсальные
        'form textarea',
        'textarea',
        
        // Fallback через кнопки (ищем рядом с кнопкой "Опубликовать")
        'button[type="submit"] ~ textarea',
        'button[aria-label*="Post" i] ~ textarea',
        'button[aria-label*="Опубликовать" i] ~ textarea'
      ];

      let commentField = null;
      let foundSelector = '';
      
      logger.info(`🔍 Проверяем ${commentSelectors.length} селекторов...`);
      
      // Пробуем найти поле комментария
      for (const selector of commentSelectors) {
        try {
          logger.info(`   Пробуем: ${selector}`);
          
          commentField = await this.page.waitForSelector(selector, { 
            timeout: 2000,
            state: 'visible'
          });
          
          if (commentField) {
            foundSelector = selector;
            logger.success(`✅ НАЙДЕНО! Селектор: ${selector}`);
            break;
          }
        } catch {
          logger.info(`   ❌ Не сработал: ${selector}`);
          continue;
        }
      }

      if (!commentField) {
        // ✅ Попробуем поискать через текст кнопок
        logger.info('🔍 Дополнительный поиск через кнопки...');
        
        const buttonSearch = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          const foundButtons = [];
          
          Array.from(buttons).forEach(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            
            if (text.includes('опубликовать') || text.includes('post') ||
                ariaLabel.includes('опубликовать') || ariaLabel.includes('post')) {
              foundButtons.push({
                text: btn.textContent,
                ariaLabel: btn.getAttribute('aria-label'),
                hasNearbyTextarea: !!btn.parentElement?.querySelector('textarea')
              });
            }
          });
          
          return foundButtons;
        });
        
        logger.info(`   Найдено кнопок публикации: ${buttonSearch.length}`);
        buttonSearch.forEach(btn => {
          logger.info(`     "${btn.text}" (рядом textarea: ${btn.hasNearbyTextarea ? '✅' : '❌'})`);
        });
        
        throw new Error('Поле для комментария не найдено ни одним селектором');
      }

      //  Работаем с найденным полем
      logger.info(' Подготавливаем к вводу комментария...');
      
      // Прокручиваем к полю
      await commentField.scrollIntoViewIfNeeded();
      await delays.waitForClickResponse(); // Ждём отклика
      
      // Кликаем по полю
      logger.info(' Кликаем по полю комментария...');
      await commentField.click();
      await delays.waitForClickResponse(); // Ждём отклика на клик

      // ДОБАВИТЬ СЮДА ДИАГНОСТИКУ:
      try {
          // ========== ИНТЕГРИРОВАННАЯ ЛОГИКА ИЗ ОСНОВНОГО ПРОЕКТА ==========
          // Этап 0: ДИАГНОСТИКА HTML СТРУКТУРЫ INSTAGRAM (НОВЫЙ ЭТАП)
          logger.info('🔬 Запускаем диагностику HTML структуры Instagram...');
          await commentParser.debugInstagramStructure(this.page);          

          // Этап 1: Парсинг комментариев для анализа
          logger.info(' Собираем последние комментарии для анализа...');
          const parsedComments = await commentParser.parseCommentsFromPost(this.page);
          const styleAnalysis = commentParser.analyzeCommentStyle(parsedComments);

          // Этап 2: Обеспечиваем готовность буфера (блокирующая операция при первом запуске)
          await commentBuffer.ensureBufferReady(parsedComments, styleAnalysis);

          // Этап 3: Получаем комментарий из буфера с проверкой схожести
          let selectedComment = await commentBuffer.getNextComment();

          // Этап 4: Fallback если буфер пуст
          if (!selectedComment) {
              logger.warning(' Буфер пуст! Пытаемся пополнить с текущими данными...');
              
              // Пытаемся экстренно пополнить буфер
              const commentGenerator = require('./services/comment-generator.js');
              const emergencyComments = await commentGenerator.generateBatchComments(parsedComments);
              
              if (emergencyComments && emergencyComments.length > 0) {
                  await commentBuffer.addBatchComments(emergencyComments);
                  selectedComment = await commentBuffer.getNextComment();
              }
              
              // Если все еще пуст - используем fallback
              if (!selectedComment) {
                  logger.warning(' Экстренное пополнение не помогло. Используем fallback комментарий.');
                  selectedComment = commentGenerator.generateSingleComment(parsedComments);
              }
          }

          // Этап 5: Проверка и подготовка комментария
          if (!selectedComment || selectedComment.length < 10) {
              logger.warning(' Полученный комментарий некорректен. Используем fallback.');
              const commentGenerator = require('./services/comment-generator.js');
              selectedComment = commentGenerator.generateSingleComment(parsedComments);
          }

          // Этап 6: Ввод сгенерированного комментария
          logger.info(' Вводим умный сгенерированный комментарий...');
          logger.success(` Комментарий: "${selectedComment.substring(0, 50)}..."`);
          
          // Очищаем поле и вводим новый комментарий
          await this.page.keyboard.press('Control+a');
          await this.page.keyboard.press('Delete');
          await this.page.keyboard.type(selectedComment);

          // Этап 7: Фоновое пополнение буфера если нужно
          if (await commentBuffer.needsRefill()) {
              logger.info(' Запускаем фоновое пополнение буфера...');
              // Не ждем завершения - пусть работает в фоне
              commentBuffer.refillBufferBackground(parsedComments, styleAnalysis).catch(error => {
                  logger.error('❌ Ошибка фонового пополнения:', error.message);
              });
          }

      } catch (integrationError) {
          logger.error('❌ Ошибка в интегрированной системе комментариев:', integrationError.message);
          logger.debug('📋 Детали ошибки:', integrationError.stack);
          
          // Fallback к простому комментарию
          logger.info('🔄 Fallback: используем простой комментарий');
          await this.page.keyboard.press('Control+a');
          await this.page.keyboard.press('Delete');
          await this.page.keyboard.type("🙂 Полностью согласен с мнением автора.");
      }

      logger.success('✅ Комментарий введён!');
// ========== Конец блока ИНТЕГРИРОВАННАЯ ЛОГИКА ИЗ ОСНОВНОГО ПРОЕКТА ==========
      await delays.waitForClickResponse(); // Ждём отклика

      // ✅ Ищем кнопку "Опубликовать"
      logger.info('🔍 Ищем кнопку "Опубликовать"...');
      
      const publishButtons = [
        'button[type="submit"]',
        'button[aria-label*="Post" i]',
        'button[aria-label*="Опубликовать" i]',
        'button:has-text("Post")',
        'button:has-text("Опубликовать")',
        '[role="button"][aria-label*="Post" i]'
      ];
      
      let publishButton = null;
      for (const selector of publishButtons) {
        try {
          publishButton = await this.page.waitForSelector(selector, { timeout: 2000 });
          if (publishButton) {
            logger.info(`✅ Кнопка найдена: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (publishButton) {
        logger.info('📤 Кликаем по кнопке "Опубликовать"...');
        await publishButton.click();
        await delays.waitForClickResponse();
      } else {
        logger.info('📤 Кнопка не найдена, отправляем через Enter...');
        await this.page.keyboard.press('Enter');
        await delays.waitForClickResponse();
      }
      
      // Ждём подтверждения отправки
      await this.page.waitForTimeout(4000);
      
      logger.success('🎉 Комментарий успешно опубликован!');
      
      // ДОБАВИТЬ: Увеличиваем счетчик опубликованных комментариев
      await commentParser.incrementPublishedCount();
      return true;
      
    } catch (error) {
      logger.error('❌ Ошибка при комментировании:', error.message);
      
      try {
        await this.page.screenshot({ 
          path: 'comment-error-detailed-screenshot.png',
          fullPage: true 
        });
        logger.info('📸 Детальный скриншот ошибки: comment-error-detailed-screenshot.png');
        
        // Сохраняем HTML для анализа
        const html = await this.page.content();
        await fs.writeFile('comment-error-page-source.html', html);
        logger.info('📄 HTML сохранён: comment-error-page-source.html');
      } catch {}
      
      return false;
    }
  }

  async close() {
    await this.browserManager.close();
  }

  /**
   * ОСНОВНОЙ ЦИКЛ БОТА - постоянная работа
   */
  async run() {
      let cycleCount = 0;
      let successCount = 0;
      let errorCount = 0;

      logger.info('🚀 Запуск бота в режиме постоянной работы');
      logger.info('⏰ Интервал: 15-20 минут между комментариями');
      
      while (true) {
          try {
              cycleCount++;
              
              // === ДОБАВИТЬ ДИАГНОСТИКУ ЗДЕСЬ ===
              logger.debug(`\n🔍 [${new Date().toLocaleTimeString()}] === ДИАГНОСТИКА ЦИКЛА #${cycleCount} ===`);
              
              // Проверка рабочего времени перед каждым циклом
              logger.debug('🔍 Проверяем рабочее время...');
              if (!delays.isActiveTime()) {
                  logger.info(`😴 [${new Date().toLocaleTimeString()}] Вне рабочего времени. Пауза 30 минут`);
                  await this.sleep(30 * 60 * 1000);
                  continue;
              }

              logger.info(`🔄 [${new Date().toLocaleTimeString()}] === ЦИКЛ #${cycleCount} ===`);
              
              // Выполняем один цикл работы
              logger.debug('🔍 Запускаем executeWorkCycle...');
              const success = await this.executeWorkCycle();
              
              if (success) {
                  successCount++;
                  logger.success(`✅ [${new Date().toLocaleTimeString()}] Комментарий опубликован успешно`);
              } else {
                  errorCount++;
                  logger.error(`❌ [${new Date().toLocaleTimeString()}] Цикл завершился с ошибкой`);
              }

              // Статистика
              logger.info(`📊 Статистика: ${successCount} успешных, ${errorCount} ошибок из ${cycleCount} циклов`);

              // Случайная пауза 15-20 минут
              const pauseMinutes = this.getRandomPause();
              const pauseMs = pauseMinutes * 60 * 1000;
              
              logger.info(`⏳ [${new Date().toLocaleTimeString()}] Пауза ${pauseMinutes} минут до следующего комментария`);
              logger.info(`🎯 Следующий запуск: ${new Date(Date.now() + pauseMs).toLocaleTimeString()}`);
              
              await this.sleep(pauseMs);

          } catch (error) {
              errorCount++;
              logger.error(`💥 [${new Date().toLocaleTimeString()}] Критическая ошибка в основном цикле`, { message: error.message });
              
              // Пауза после ошибки перед повтором (5 минут)
              logger.info('⏳ Пауза 5 минут после ошибки...');
              await this.sleep(5 * 60 * 1000);
          }
      }
  }

  /**
   * ВЫПОЛНЕНИЕ ОДНОГО РАБОЧЕГО ЦИКЛА
   */
  async executeWorkCycle() {
      let browser = null;
      
      try {
          logger.debug('🔍 === ДИАГНОСТИКА executeWorkCycle ===');
          
          // ИСПРАВЛЕНИЕ: Используем старый BrowserManager если возможно
          logger.debug('🔍 Шаг 1: Инициализация браузера...');
          // // ДИАГНОСТИКА BROWSERMANAGER
          logger.debug('🔍 === ДИАГНОСТИКА BROWSERMANAGER ===');
          logger.debug('🔍 this.browserManager:', !!this.browserManager);
          logger.debug('🔍 this.browserManager.launch:', typeof this.browserManager?.launch);
          logger.debug('🔍 this.browserManager.loadSession:', typeof this.browserManager?.loadSession);
          logger.debug('🔍 this.browserManager.saveSession:', typeof this.browserManager?.saveSession);
          logger.debug('🔍 BrowserManager методы:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.browserManager || {})));
          logger.debug('🔍 Доступные методы BrowserManager:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.browserManager)));
          
          try {
              // Пробуем старый способ через BrowserManager
              await this.browserManager.init(); // ✅ ПРАВИЛЬНО
              browser = this.browserManager.browser;
              // this.page = await this.browserManager.getPage();
              this.page = this.browserManager.page;
              browser = this.browserManager.browser;
              this.page = this.browserManager.page;
              logger.success('✅ Используем BrowserManager (старый способ)');
              
          } catch (error) {
              logger.warning('⚠️ BrowserManager недоступен, используем прямую инициализацию');
              
              // Fallback к новому способу
              const playwright = require('playwright');
              browser = await playwright.chromium.launch({
                  headless: process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production',
                  args: process.env.NODE_ENV === 'production' ? [
                      '--no-sandbox',
                      '--disable-setuid-sandbox',
                      '--disable-dev-shm-usage'
                  ] : []
              });
              
              this.page = await browser.newPage({
                  viewport: { width: 1366, height: 768 },
                  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              });
          }

          if (!browser || !this.page) {
              throw new Error('Не удалось инициализировать браузер');
          }

          logger.debug('🔍 Шаг 3: Авторизация...');
          const loginSuccess = await this.login();
          if (!loginSuccess) {
              throw new Error('Не удалось авторизоваться');
          }

          logger.debug('🔍 Шаг 4: Поиск и комментирование поста...');
          const commentSuccess = await this.findAndCommentPost();
          if (!commentSuccess) {
              throw new Error('Не удалось прокомментировать пост');
          }

          return true;

      } catch (error) {
          logger.error('❌ Ошибка в рабочем цикле', { message: error.message });
          return false;
          
      } finally {
          // Закрываем браузер через BrowserManager если он использовался
          if (this.browserManager.browser) {
              try {
                  await this.browserManager.close();
                  logger.info('🔚 BrowserManager закрыт');
              } catch (error) {
                  logger.warning('⚠️ Ошибка закрытия BrowserManager:', { message: error.message });
              }
          } else if (browser) {
              try {
                  await browser.close();
                  logger.info('🔚 Браузер закрыт напрямую');
              } catch (error) {
                  logger.warning('⚠️ Ошибка закрытия браузера:', { message: error.message });
              }
          }      // Если используем BrowserManager - не закрываем браузер здесь
      }
  }

  /**
   * ПЕРЕХОД К ПРОФИЛЮ
   */
  async navigateToProfile() {
      logger.info('🌐 Переходим к профилю...');
      await this.page.goto(this.config.targetProfile, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeouts.navigation
      });
      await delays.betweenActions();
  }

  /**
   * ПОИСК И КОММЕНТИРОВАНИЕ ПОСТА
   */
  async findAndCommentPost() {
      try {
          logger.debug('🔍 === ДИАГНОСТИКА findAndCommentPost ===');

          logger.debug('🔍 Вызываем findAndClickActualPost...');
          const success = await this.findAndClickActualPost();
          
          logger.debug('🔍 Результат findAndClickActualPost:', success);
          if (!success) {
              throw new Error('Не удалось найти и открыть пост');
          }
          
          logger.debug('🔍 Вызываем commentOnOpenPost...');
          const commentSuccess = await this.commentOnOpenPost();
          
          logger.debug('🔍 Результат commentOnOpenPost:', commentSuccess);
          return commentSuccess;
          
      } catch (error) {
          logger.error('❌ Ошибка поиска/комментирования поста', { message: error.message });
          logger.debug('❌ Stack trace:', error.stack);
          return false;
      }
  }

  /**
   * ГЕНЕРАЦИЯ СЛУЧАЙНОЙ ПАУЗЫ ИЗ .ENV ПЕРЕМЕННЫХ
   */
  getRandomPause() {
      // Читаем интервал из .env переменных
      const minMinutes = parseInt(process.env.COMMENT_INTERVAL_MIN) || 15;
      const maxMinutes = parseInt(process.env.COMMENT_INTERVAL_MAX) || 20;
      
      // Валидация значений
      if (minMinutes >= maxMinutes) {
          logger.warning(' Некорректные настройки интервала в .env, используем значения по умолчанию');
          return 17.5; // Среднее значение по умолчанию
      }
      
      // Добавляем небольшую дополнительную случайность ±10%
      const baseInterval = Math.random() * (maxMinutes - minMinutes) + minMinutes;
      const variance = baseInterval * 0.1 * (Math.random() - 0.5); 
      const finalMinutes = baseInterval + variance;
      
      // Округляем до десятых и ограничиваем разумными пределами
      const result = Math.max(5, Math.min(60, Math.round(finalMinutes * 10) / 10));
      
      logger.info(` Интервал из .env: ${minMinutes}-${maxMinutes} мин → выбрано: ${result} мин`);
      return result;
  }

  /**
   * УЛУЧШЕННАЯ ФУНКЦИЯ СНА С ПРЕРЫВАНИЕМ
   */
  async sleep(ms) {
      return new Promise((resolve) => {
          const timeout = setTimeout(resolve, ms);
          
          // Возможность прервать сон по сигналу (для graceful shutdown)
          process.once('SIGINT', () => {
              clearTimeout(timeout);
              logger.warning('\n🛑 Получен сигнал остановки');
              process.exit(0);
          });

          process.once('SIGTERM', () => {
              clearTimeout(timeout);
              logger.warning('\n🛑 Получен сигнал завершения');
              process.exit(0);
          });
      });
  }
}

/**
 * ЗАПУСК БОТА В ПОСТОЯННОМ РЕЖИМЕ
 */
async function startBot() {
    const bot = new InstagramBot();
    
    // Обработка сигналов остановки
    process.on('SIGINT', () => {
        logger.warning('\n🛑 Получен сигнал остановки (Ctrl+C)');
        logger.info('🔄 Завершение текущих операций...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logger.warning('\n🛑 Получен сигнал завершения');
        process.exit(0);
    });

    // Инициализация
    const initSuccess = await bot.init();
    if (!initSuccess) {
        logger.error('❌ Не удалось инициализировать бота');
        process.exit(1);
    }

    // Запуск постоянного цикла
    await bot.run();
}

// Запускаем бота
if (require.main === module) {
    startBot().catch(error => {
        logger.error('💥 Фатальная ошибка:', error);
        process.exit(1);
    });
}
