/**
 * Централизованное управление CSS селекторами для Instagram
 * При изменениях UI Instagram - обновляйте здесь
 */

module.exports = {
    // Селекторы для комментариев
    comment: {
        field: [
            'textarea[aria-label*="комментарий" i]',    // Основной рабочий
            'textarea[placeholder*="комментарий"]',     // Fallback 1
            'textarea[aria-label*="comment" i]',        // Fallback 2 (EN)
            '[contenteditable="true"]',                 // Fallback 3
            'textarea[class*="comment"]',               // Fallback 4
            'div[role="textbox"]'                       // Fallback 5
        ],
        
        publishButton: [
            'button:has-text("Опубликовать")',         // Основной RU
            'button:has-text("Post")',                  // Fallback EN
            'button[type="submit"]',                    // Универсальный
            'button:has-text("Поделиться")',           // Альтернативный RU
            'button[data-testid*="post"]'               // Data-testid
        ]
    },

    // Селекторы для постов
    posts: {
        feedPosts: [
            'article[role="presentation"]',             // Основной
            '[data-testid="post"]',                     // Альтернативный
            'div[class*="post"]',                       // Резервный
            'article:has(img)',                         // Статьи с изображениями
            'div[role="button"]:has(img)'               // Кликабельные изображения
        ],
        
        images: [
            'article img',                              // Изображения в постах
            'div[role="button"] img',                   // Кликабельные изображения
            'a img',                                    // Изображения в ссылках
            'img[alt]'                                  // Изображения с alt
        ],
        
        captions: [
            'article div[data-testid*="caption"]',      // Подписи к постам
            'span:has-text("Photo by")',                // Авторские подписи
            'div[class*="caption"]',                    // Класс caption
            'article span[dir="auto"]'                  // Текст постов
        ]
    },

    // Селекторы для навигации
    navigation: {
        profileLink: [
            'a[href*="/za_kra_zakriev"]',               // Прямая ссылка на профиль
            'a:has-text("za_kra_zakriev")',             // Ссылка с текстом
            '[data-testid*="profile"]'                  // Data-testid профиля
        ],
        
        modal: [
            'div[role="dialog"]',                       // Основной модал
            'div[aria-modal="true"]',                   // Атрибут модала
            'div[class*="modal"]'                       // Класс модала
        ]
    },

    // Селекторы для предупреждений и блокировок
    warnings: {
        challenge: [
            '[data-testid="challenge-form"]',           // Капча
            'form:has-text("Challenge")',               // Форма вызова
            'div:has-text("Please confirm")'            // Подтверждение
        ],
        
        restrictions: [
            'div:has-text("Suspicious activity")',      // Подозрительная активность
            'div:has-text("Try again later")',          // Временная блокировка
            'div:has-text("We restrict certain")',      // Ограничения
            'div:has-text("Something went wrong")'      // Общая ошибка
        ]
    },

    // Диагностические селекторы
    diagnostics: {
        pageElements: {
            textareas: 'textarea',
            contentEditables: '[contenteditable="true"]',
            forms: 'form',
            buttons: 'button',
            inputs: 'input'
        }
    }
};
