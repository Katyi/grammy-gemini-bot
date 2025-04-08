import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();
import getRawBody from 'raw-body';

// Vercel предоставляет переменные окружения через process.env
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

// Обработчик для webhook
const webhookHandler = async (req, res) => {
  try {
    const rawBody = await getRawBody(req);
    req.body = JSON.parse(rawBody.toString('utf8')); // Parse the JSON body

    console.log('Webhook Request Body:', req.body);

    webhookCallback(bot, 'http')(req, res);
  } catch (error) {
    console.error('Webhook error:', error);
    // return res.status(500).send('Webhook error occurred');
    if (!res.headersSent) {
      res.status(500).send('Webhook error occurred');
    }
  }
};

// Экспортируем обработчик для Vercel
export default webhookHandler;

// Для локального тестирования (не использовать на Vercel с webhook)
// bot.start();
