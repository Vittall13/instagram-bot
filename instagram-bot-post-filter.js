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
  async init() {
      logger.info('🚀 Запуск бота с ФИЛЬТРАЦИЕЙ ПОСТОВ (только настоящие посты)...');
      if (!delays.isActiveTime()) {
          logger.info('⏰ Нерабочее время. Завершение.');
          return false;
      }

      const browserInitialized = await this.browserManager.init();
      if (!browserInitialized) {
          return false;
      }

      this.page = this.browserManager.getPage();
      return true;
  }

  async login() {
  try {
  await this.browserManager.loadSession();
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

  // ✅ УЛУЧШЕННЫЙ поиск поля комментария
  async commentOnOpenPost() {
    logger.info(`🔬 ДИАГНОСТИКА: Начало commentOnOpenPost() - ${Date.now()}`);   
    try {
      logger.info('💬 Ищем поле комментария с расширенной диагностикой...');
      
      // Дополнительное ожидание полной загрузки
      await this.page.waitForTimeout(3000);
      
      // ✅ Сначала диагностируем страницу
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
      
      logger.analysis('📊 ДИАГНОСТИКА СТРАНИЦЫ:');
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

      // ✅ Работаем с найденным полем
      logger.info('🎯 Подготавливаем к вводу комментария...');
      
      // Прокручиваем к полю
      await commentField.scrollIntoViewIfNeeded();
      await delays.waitForClickResponse(); // Ждём отклика
      
      // Кликаем по полю
      logger.info('🖱️ Кликаем по полю комментария...');
      await commentField.click();
      await delays.waitForClickResponse(); // Ждём отклика на клик

      // ДОБАВИТЬ СЮДА ДИАГНОСТИКУ:
      try {
      // Парсим комментарии для анализа
      const parsedComments = await commentParser.parseCommentsFromPost(this.page);
      const styleAnalysis = commentParser.analyzeCommentStyle(parsedComments);

      // Проверяем нужно ли пополнить буфер
      if (await commentBuffer.needsRefill()) {
          logger.info('🔄 Пополняем буфер комментариями...');
          
          // Генерируем несколько комментариев
          const newComments = commentGenerator.generateMultipleComments(5, null, parsedComments, styleAnalysis);
          await commentBuffer.addComments(newComments);
      }

      // Получаем комментарий из буфера
      let selectedComment = await commentBuffer.getNextComment();
      if (!selectedComment) {
          logger.warning('⚠️ Буфер пуст, генерируем экстренный комментарий...');
          selectedComment = commentGenerator.generateComment(null, parsedComments, styleAnalysis);
      }

      logger.info('✏️ Вводим сгенерированный комментарий...');
      await this.page.keyboard.type(selectedComment.text);
      } catch (error) {
        logger.error('🔬 ПОДРОБНОСТИ:', error.stack);
        // Fallback к старому способу
        logger.info('🔬 FALLBACK: Используем старый способ комментирования');
        await this.page.keyboard.type(this.config.comment);
      }
      
      logger.success('✅ Комментарий введён!');
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

  async run() {
    try {
      const initSuccess = await this.init();
      if (!initSuccess) return;
      
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Авторизация не удалась');
      }

      // ✅ Ищем и кликаем по настоящему посту (не профилю)
      const postResult = await this.findAndClickActualPost();
      if (!postResult) {
          throw new Error('Не удалось открыть пост');
      }

      // ✅ Комментируем с улучшенной диагностикой
      const commentSuccess = await this.commentOnOpenPost();
      
      if (commentSuccess) {
        logger.success('✅ ЗАДАЧА ВЫПОЛНЕНА УСПЕШНО!');
        logger.success('🎊 Пост найден, открыт и прокомментирован!');
        
        const logEntry = {
          timestamp: new Date().toISOString(),
          comment: this.config.comment,
          status: 'success',
          method: 'filtered_post_click_with_diagnostics'
        };
        
        try {
          let existingLogs = [];
          try {
            existingLogs = JSON.parse(await fs.readFile('comments-log.json', 'utf8'));
          } catch {}
          
          existingLogs.push(logEntry);
          await fs.writeFile('comments-log.json', JSON.stringify(existingLogs, null, 2));
          logger.success('📝 Успех записан в лог');
        } catch {}
        
      } else {
        throw new Error('Не удалось опубликовать комментарий');
      }
      
    } catch (error) {
      logger.error('💥 Критическая ошибка:', error.message);
      
      if (this.page) {
        try {
          await this.page.screenshot({ path: 'final-error-screenshot.png', fullPage: true });
          logger.info('📸 Финальный скриншот ошибки: final-error-screenshot.png');
        } catch {}
      }
    } finally {
      await this.close();
    }
  }
}

const bot = new InstagramBot();
bot.run();