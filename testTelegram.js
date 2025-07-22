
     require("dotenv").config();
     const TelegramBot = require("node-telegram-bot-api");

     const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

     async function testBot() {
       try {
         const message = "Test message from your withdrawal bot to private chat!";
         await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
         console.log("Test message sent successfully to chat ID:", process.env.TELEGRAM_CHAT_ID);
       } catch (error) {
         console.error("Error sending test message:", error.message);
       }
     }

     testBot();
     