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

// ===== helpers: timeout wrapper + human wiggle =====
async function withTimeout(promise, ms, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timerId);
  }
}

async function humanWiggle(page) {
  try {
    const moves = 3 + Math.floor(Math.random() * 4);                                // 3..6
    for (let i = 0; i < moves; i += 1) {
      const x = 200 + Math.floor(Math.random() * 800);
      const y = 150 + Math.floor(Math.random() * 600);
      const steps = 3 + Math.floor(Math.random() * 4);
      await page.mouse.move(x, y, { steps });
      await page.waitForTimeout(80 + Math.floor(Math.random() * 240));             // 80..320ms
    }
    if (Math.random() < 0.7) {
      const deltaY = (Math.random() < 0.5 ? -1 : 1) * (200 + Math.floor(Math.random() * 600));
      await page.mouse.wheel(0, deltaY);
      await page.waitForTimeout(200 + Math.floor(Math.random() * 600));            // 200..800ms
    }
  } catch (_) {
    // ignore
  }
}
// ===== end helpers =====

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
              console.error('❌ Конфигурация не найдена!');
              console.error('📋 Проверьте файл config/config.json');
              console.error('📋 Должно содержать: "targetProfile": "https://www.instagram.com/username/"');
              throw new Error('Не указан профиль для мониторинга');
          }
          
          console.log(`🎯 Целевой профиль: ${profileUrl}`);
          
          // Загружаем рабочие часы
          const startHour = parseInt(process.env.WORKING_HOURS_START) || this.config.workingHours?.[0] || 9;
          const endHour = parseInt(process.env.WORKING_HOURS_END) || this.config.workingHours?.[1] || 18;
          console.log(`⏰ Рабочие часы: ${startHour}:00 - ${endHour}:00`);
          
          // Инициализация сервисов
          this.initializeServices();
          
          console.log('✅ Инициализация завершена');
          console.log('🚀 Бот готов к постоянной работе');
          
          return true;
          
      } catch (error) {
          console.error('❌ Ошибка инициализации:', error.message);
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
      console.log('🔍 === ДИАГНОСТИКА АВТОРИЗАЦИИ ===');
      console.log('🔍 BrowserManager.loadSession:', typeof this.browserManager.loadSession);
      console.log('🔍 BrowserManager.saveSession:', typeof this.browserManager.saveSession);

      console.log('🔍 Попытка загрузки сессии...');
      const sessionLoaded = await this.browserManager.loadSession();
      console.log('🔍 Результат загрузки сессии:', sessionLoaded);

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
               console.log('⚠️ Сохраненная сессия недействительна');
               const hasEnvCredentials = process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD;
        console.log('🔍 Учетные данные в .env:', hasEnvCredentials ? 'найдены' : 'отсутствуют');

        logger.success('🔑 Требуется ручная авторизация...');
        logger.success('📝 Войдите в Instagram и нажмите Enter...');
        await new Promise((resolve) => {
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
      logger.info('🌐 Переходим к профилю...');
      await this.page.goto(this.config.targetProfile, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeouts.navigation
      });
      await delays.betweenActions();

      // Три волны: без скролла, средний скролл, глубокий скролл
      const waves = [0.0, 0.9, 1.8];

      for (let wave = 0; wave < waves.length; wave += 1) {
        if (waves[wave] > 0) {
          await this.page.evaluate((m) => window.scrollBy(0, Math.floor(window.innerHeight * m)), waves[wave]);
          await this.page.waitForTimeout(800 + Math.floor(Math.random() * 1600));
          await humanWiggle(this.page);
        }

        const analysisResults = await imageAnalyzer.analyzeAndFilterImages(this.page);
        const selectedPost = imageAnalyzer.selectBestPost(analysisResults);

        if (selectedPost && selectedPost.image) {
          logger.info('🖱️ Кликаем по изображению поста...');
          await selectedPost.image.click({ delay: 60 + Math.floor(Math.random() * 140) });
          await delays.waitForClickResponse();

          const postOpened = await this.page.evaluate(() => ({
            hasModal: !!document.querySelector('div[role="dialog"], div[aria-modal="true"], div[class*="modal"]'),
            hasPostUrl: window.location.pathname.includes('/p/') || window.location.pathname.includes('/reel/'),
            hasCommentField: !!document.querySelector('textarea, [contenteditable="true"]')
          }));

          logger.info(`📱 Модальное окно: ${postOpened.hasModal ? '✅' : '❌'}`);
          logger.info(`🔗 URL поста: ${postOpened.hasPostUrl ? '✅' : '❌'}`);
          logger.info(`💬 Поле комментария: ${postOpened.hasCommentField ? '✅' : '❌'}`);

          if (postOpened.hasModal || postOpened.hasPostUrl) {
            logger.success('✅ Пост успешно открыт!');
            return true;
          }
        }
      }

      throw new Error('Не найдено подходящих постов для комментирования');
    } catch (error) {
      logger.error('Ошибка поиска и клика по посту', { message: error.message });
      try {
        await this.page.screenshot({ path: 'post-click-error-screenshot.png', fullPage: true });
        logger.info('📸 Скриншот ошибки: post-click-error-screenshot.png');
      } catch (_) {}
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

      console.log('🚀 Запуск бота в режиме постоянной работы');
      console.log('⏰ Интервал: 15-20 минут между комментариями');
      
      while (true) {
          try {
              cycleCount++;
              
              // === ДОБАВИТЬ ДИАГНОСТИКУ ЗДЕСЬ ===
              console.log(`\n🔍 [${new Date().toLocaleTimeString()}] === ДИАГНОСТИКА ЦИКЛА #${cycleCount} ===`);
              
              // Проверка рабочего времени перед каждым циклом
              console.log('🔍 Проверяем рабочее время...');
              if (!delays.isActiveTime()) {
                  console.log(`😴 [${new Date().toLocaleTimeString()}] Вне рабочего времени. Пауза 30 минут`);
                  await this.sleep(30 * 60 * 1000);
                  continue;
              }

              console.log(`🔄 [${new Date().toLocaleTimeString()}] === ЦИКЛ #${cycleCount} ===`);
              
              // Выполняем один цикл работы
              console.log('🔍 Запускаем executeWorkCycle...');
              const success = await this.executeWorkCycle();
              
              if (success) {
                  successCount++;
                  console.log(`✅ [${new Date().toLocaleTimeString()}] Комментарий опубликован успешно`);
              } else {
                  errorCount++;
                  console.log(`❌ [${new Date().toLocaleTimeString()}] Цикл завершился с ошибкой`);
              }

              // Статистика
              console.log(`📊 Статистика: ${successCount} успешных, ${errorCount} ошибок из ${cycleCount} циклов`);

              // Случайная пауза 15-20 минут
              const pauseMinutes = this.getRandomPause();
              const pauseMs = pauseMinutes * 60 * 1000;
              
              console.log(`⏳ [${new Date().toLocaleTimeString()}] Пауза ${pauseMinutes} минут до следующего комментария`);
              console.log(`🎯 Следующий запуск: ${new Date(Date.now() + pauseMs).toLocaleTimeString()}`);
              
              await this.sleep(pauseMs);

          } catch (error) {
              errorCount++;
              console.error(`💥 [${new Date().toLocaleTimeString()}] Критическая ошибка в основном цикле:`, error.message);
              
              // Пауза после ошибки перед повтором (5 минут)
              console.log('⏳ Пауза 5 минут после ошибки...');
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
      console.log('🔍 === ДИАГНОСТИКА executeWorkCycle ===');

      try {
        await this.browserManager.init();
        browser = this.browserManager.browser;
        this.page = this.browserManager.page;
        console.log('✅ Используем BrowserManager (старый способ)');
      } catch (error) {
        console.log('⚠️ BrowserManager недоступен, используем прямую инициализацию');
        const playwright = require('playwright');
        browser = await playwright.chromium.launch({
          headless: process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production',
          args: process.env.NODE_ENV === 'production'
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : []
        });
        this.page = await browser.newPage({
          viewport: { width: 1366, height: 768 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
      }

      if (!browser || !this.page) {
        throw new Error('Не удалось инициализировать браузер');
      }

      console.log('🔍 Шаг 3: Авторизация...');
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Не удалось авторизоваться');
      }

      console.log('🔍 Шаг 4: Поиск и комментирование поста...');
      const commentSuccess = await this.findAndCommentPost();
      if (!commentSuccess) {
        throw new Error('Не удалось прокомментировать пост');
      }

      return true;
    } catch (error) {
      console.error(`❌ Ошибка в рабочем цикле: ${error.message}`);
      return false;
    } finally {
      if (this.browserManager.browser) {
        try {
          await this.browserManager.close();
          console.log('🔚 BrowserManager закрыт');
        } catch (error) {
          console.error('⚠️ Ошибка закрытия BrowserManager:', error.message);
        }
      } else if (browser) {
        try {
          await browser.close();
          console.log('🔚 Браузер закрыт напрямую');
        } catch (error) {
          console.error('⚠️ Ошибка закрытия браузера:', error.message);
        }
      }
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
          console.log('🔍 === ДИАГНОСТИКА findAndCommentPost ===');
          
          console.log('🔍 Вызываем findAndClickActualPost...');
          const success = await this.findAndClickActualPost();
          
          console.log('🔍 Результат findAndClickActualPost:', success);
          if (!success) {
              throw new Error('Не удалось найти и открыть пост');
          }
          
          console.log('🔍 Вызываем commentOnOpenPost...');
          const commentSuccess = await this.commentOnOpenPost();
          
          console.log('🔍 Результат commentOnOpenPost:', commentSuccess);
          return commentSuccess;
          
      } catch (error) {
          console.error('❌ Ошибка поиска/комментирования поста:', error.message);
          console.error('❌ Stack trace:', error.stack);
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
          console.log(' Некорректные настройки интервала в .env, используем значения по умолчанию');
          return 17.5; // Среднее значение по умолчанию
      }
      
      // Добавляем небольшую дополнительную случайность ±10%
      const baseInterval = Math.random() * (maxMinutes - minMinutes) + minMinutes;
      const variance = baseInterval * 0.1 * (Math.random() - 0.5); 
      const finalMinutes = baseInterval + variance;
      
      // Округляем до десятых и ограничиваем разумными пределами
      const result = Math.max(5, Math.min(60, Math.round(finalMinutes * 10) / 10));
      
      console.log(` Интервал из .env: ${minMinutes}-${maxMinutes} мин → выбрано: ${result} мин`);
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
              console.log('\n🛑 Получен сигнал остановки');
              process.exit(0);
          });
          
          process.once('SIGTERM', () => {
              clearTimeout(timeout);
              console.log('\n🛑 Получен сигнал завершения');
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
        console.log('\n🛑 Получен сигнал остановки (Ctrl+C)');
        console.log('🔄 Завершение текущих операций...');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Получен сигнал завершения');
        process.exit(0);
    });

    // Инициализация
    const initSuccess = await bot.init();
    if (!initSuccess) {
        console.error('❌ Не удалось инициализировать бота');
        process.exit(1);
    }

    // Запуск постоянного цикла
    await bot.run();
}

// Запускаем бота
if (require.main === module) {
    startBot().catch(error => {
        console.error('💥 Фатальная ошибка:', error);
        process.exit(1);
    });
}
