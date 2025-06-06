import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

// Vercel предоставляет переменные окружения через process.env
const BOT_API_SERVER = 'https://api.telegram.org';
const { TELEGRAM_BOT_TOKEN, GEMINI_API_KEY } = process.env;
if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
  console.error(
    'TELEGRAM_BOT_TOKEN and GEMINI_API_KEY must be set in Vercel environment variables!'
  );
  process.exit(1); // Важно завершить процесс, если ключи не настроены
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction:
    'You are a Telegram Chatbot. Maintain a friendly tone. Keep responses one paragraph short unless told otherwise. You have the ability to respond to audio and pictures.',
});

const chat = model.startChat();

bot.command('start', async (ctx) => {
  const user = ctx.from;
  const fullName = `${user?.first_name} ${
    user?.last_name ? user.last_name : ''
  }`;
  const prompt = `Welcome user with the fullname ${fullName} in one sentence.`;
  const result = await chat.sendMessage(prompt);
  return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
});

bot.on('message:text', async (ctx) => {
  const prompt = ctx.message.text;
  const result = await chat.sendMessage(prompt);
  return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
});

bot.on('message:voice', async (ctx) => {
  const file = await ctx.getFile();
  const filePath = file.file_path;
  if (!filePath) return;

  const fileURL = `${BOT_API_SERVER}/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fetchedResponse = await fetch(fileURL);
  const data = await fetchedResponse.arrayBuffer();
  const base64Audio = Buffer.from(data).toString('base64');

  const prompt = [
    {
      inlineData: {
        mimeType: 'audio/ogg',
        data: base64Audio,
      },
    },
    {
      text: 'Please respond to the audio prompt.',
    },
  ];
  const result = await chat.sendMessage(prompt);
  return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
});

// type = 'image/jpeg' | 'image/png';
const ExtToMINE = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
};

bot.on('message:photo', async (ctx) => {
  const caption = ctx.message.caption;
  const photoFile = await ctx.getFile();
  const photoFilePath = photoFile.file_path;
  if (!photoFilePath) return;

  const photoURL = `${BOT_API_SERVER}/file/bot${TELEGRAM_BOT_TOKEN}/${photoFilePath}`;
  const fetchedResponse = await fetch(photoURL);

  const data = await fetchedResponse.arrayBuffer();
  const base64Photo = Buffer.from(data).toString('base64');
  let match = photoFilePath.match(/[^.]+$/);
  if (!match) return;

  let photoExt = match[0];
  const prompt = [
    { inlineData: { mimeType: ExtToMINE[photoExt], data: base64Photo } },
    { text: caption ?? 'Describe what you see in the photo' },
  ];

  const result = await chat.sendMessage(prompt);
  return ctx.reply(result.response.text(), { parse_mode: 'Markdown' });
});

bot.catch((error) => {
  const ctx = error.ctx;
  console.log(error);
  return ctx.reply('Something went wrong. Try again!');
});

// Обработчик для webhook
const webhookHandler = async (req, res) => {
  try {
    webhookCallback(bot, 'https')(req, res);
  } catch (error) {
    console.error('Webhook error:', error);
    if (!res.headersSent) {
      res.status(500).send('Webhook error occurred');
    }
  }
};

// Экспортируем обработчик для Vercel
// export default webhookHandler;

// Для локального тестирования (не использовать на Vercel с webhook)
bot.start();
