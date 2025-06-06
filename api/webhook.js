import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { buffer } from 'micro'; // Импортируем micro's buffer utility

dotenv.config();

const BOT_API_SERVER = 'https://api.telegram.org'; // Для загрузки файлов, если нужно
const { TELEGRAM_BOT_TOKEN, GEMINI_API_KEY } = process.env;

// Важно: проверяем наличие токенов при старте.
// Если их нет, бот не будет инициализирован, и функция вернет ошибку.
if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
  console.error(
    'ОШИБКА: TELEGRAM_BOT_TOKEN и GEMINI_API_KEY должны быть установлены в переменных окружения!'
  );
  // В Serverless Function лучше не использовать process.exit() напрямую,
  // а управлять потоком через HTTP-ответ.
}

// Инициализация бота и модели Gemini (только если токены доступны)
let bot;
let model;
let chat;

if (TELEGRAM_BOT_TOKEN && GEMINI_API_KEY) {
  bot = new Bot(TELEGRAM_BOT_TOKEN);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction:
      'You are a Telegram Chatbot. Maintain a friendly tone. Keep responses one paragraph short unless told otherwise. You have the ability to respond to audio and pictures.',
  });
  chat = model.startChat();

  // Логика бота (команды и обработчики сообщений)
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    const fullName = `${user?.first_name} ${
      user?.last_name ? user.last_name : ''
    }`;
    const prompt = `Welcome user with the fullname ${fullName} in one sentence.`;
    try {
      const result = await chat.sendMessage(prompt);
      return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in /start command:', error);
      return ctx.reply('Произошла ошибка. Пожалуйста, попробуйте еще раз!');
    }
  });

  bot.on('message:text', async (ctx) => {
    const prompt = ctx.message.text;
    try {
      const result = await chat.sendMessage(prompt);
      return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in text message handler:', error);
      return ctx.reply('Произошла ошибка при обработке сообщения.');
    }
  });

  // Логика для голосовых сообщений (с улучшенной обработкой ошибок и MIME-типов)
  bot.on('message:voice', async (ctx) => {
    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) {
      console.warn('Voice message has no file_path.');
      return ctx.reply(
        'Извините, не удалось обработать голосовое сообщение (файл не найден).'
      );
    }

    const fileURL = `${BOT_API_SERVER}/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    try {
      const fetchedResponse = await fetch(fileURL);
      if (!fetchedResponse.ok) {
        throw new Error(
          `Failed to fetch voice file: ${fetchedResponse.statusText}`
        );
      }
      const data = await fetchedResponse.arrayBuffer();
      const base64Audio = Buffer.from(data).toString('base64'); // Используйте Buffer, если не установлен

      const prompt = [
        {
          inlineData: {
            mimeType: 'audio/ogg', // Убедитесь, что это правильный MIME-тип для OGG
            data: base64Audio,
          },
        },
        {
          text: 'Please respond to the audio prompt.',
        },
      ];
      const result = await chat.sendMessage(prompt);
      return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
    } catch (fetchError) {
      console.error('Error processing voice message:', fetchError);
      return ctx.reply(
        'Не удалось обработать голосовое сообщение. Пожалуйста, попробуйте еще раз.'
      );
    }
  });

  // Соответствие расширений MIME-типам для изображений
  const ExtToMINE = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
  };

  // Логика для фотографий (с улучшенной обработкой ошибок и MIME-типов)
  bot.on('message:photo', async (ctx) => {
    const caption = ctx.message.caption;
    const photoFile = await ctx.getFile();
    const photoFilePath = photoFile.file_path;
    if (!photoFilePath) {
      console.warn('Photo message has no file_path.');
      return ctx.reply(
        'Извините, не удалось обработать фотографию (файл не найден).'
      );
    }

    const photoURL = `${BOT_API_SERVER}/file/bot${TELEGRAM_BOT_TOKEN}/${photoFilePath}`;
    try {
      const fetchedResponse = await fetch(photoURL);
      if (!fetchedResponse.ok) {
        throw new Error(
          `Failed to fetch photo file: ${fetchedResponse.statusText}`
        );
      }
      const data = await fetchedResponse.arrayBuffer();
      const base64Photo = Buffer.from(data).toString('base64'); // Используйте Buffer, если не установлен

      const match = photoFilePath.match(/\.([^.]+)$/); // Извлечение расширения
      if (!match || !ExtToMINE[match[1]]) {
        console.warn('Could not determine MIME type for photo:', photoFilePath);
        return ctx.reply('Неподдерживаемый формат фотографии.');
      }

      const photoExt = match[1];
      const mimeType = ExtToMINE[photoExt];

      const prompt = [
        { inlineData: { mimeType: mimeType, data: base64Photo } },
        { text: caption ?? 'Describe what you see in the photo' },
      ];

      const result = await chat.sendMessage(prompt);
      return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
    } catch (fetchError) {
      console.error('Error processing photo message:', fetchError);
      return ctx.reply(
        'Не удалось обработать фотографию. Пожалуйста, попробуйте еще раз.'
      );
    }
  });

  // Глобальный обработчик ошибок для бота
  bot.catch((error) => {
    const ctx = error.ctx;
    console.error('Общая ошибка бота:', error);
    if (ctx && ctx.reply) {
      return ctx.reply(
        'Произошла непредвиденная ошибка. Пожалуйста, попробуйте еще раз!'
      );
    }
  });
} else {
  console.error(
    'Bot not initialized: TELEGRAM_BOT_TOKEN or GEMINI_API_KEY is missing.'
  );
}

// --- КОНФИГУРАЦИЯ VERCEL API ROUTE ---
export const config = {
  api: {
    bodyParser: false, // Отключаем стандартный парсер тела Vercel
  },
};

// --- ОСНОВНОЙ ОБРАБОТЧИК ЗАПРОСОВ ---
const webhookHandler = async (req, res) => {
  // Проверка на отсутствие токенов в самом начале обработчика
  if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Server configuration error: Bot tokens are missing.');
    return;
  }

  console.log(`Получен запрос: ${req.method} ${req.url}`);

  if (req.method === 'POST') {
    // Только для POST-запросов пытаемся парсить тело
    try {
      const rawBody = await buffer(req);
      req.body = JSON.parse(rawBody.toString('utf8')); // Назначаем распарсенное тело req.body

      await webhookCallback(bot, 'http')(req, res); // Передаем bot, 'http' для Vercel
      console.log('Вебхук Telegram обработан успешно.');
    } catch (error) {
      console.error('Ошибка при обработке POST вебхука:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  } else if (req.method === 'GET') {
    // Для GET-запросов отвечаем просто текстовым сообщением
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(
      'Бот активен. Отправьте POST-запрос на этот URL для вебхука Telegram.'
    );
  } else {
    // Для других методов
    res.statusCode = 405; // Method Not Allowed
    res.setHeader('Content-Type', 'text/plain');
    res.end('Метод не разрешен.');
  }
};

export default webhookHandler;
