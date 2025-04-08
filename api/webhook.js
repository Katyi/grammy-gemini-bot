import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
const app = express();
const { PORT } = process.env;

app.use(express.json());

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
// const webhookHandler = async (req, res) => {
//   try {
//     await webhookCallback(bot, 'express')(req, res);
//     return res.status(200).send('OK');
//   } catch (error) {
//     console.error('Webhook error:', error);
//     return res.status(500).send('Webhook error occurred');
//   }
// };

// Экспортируем обработчик для Vercel
// export default webhookHandler;

// Для локального тестирования (не использовать на Vercel с webhook)
// bot.start();

//   app.post('/api/webhook', async (req, res) => {
//   try {
//     // logger.info('Received webhook request', { body: req.body });
//     await webhookCallback(bot, 'express')(req, res);
//   } catch (error) {
//     console.log('Error handling webhook request', { error });
//     res.sendStatus(500);
//   }
// });

app.use(webhookCallback(bot, 'express'));

app.get('/healthz', (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT || 3000, () => {
  console.log(`Server is running on port ${PORT || 3000}`);
});
