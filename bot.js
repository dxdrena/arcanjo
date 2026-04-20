require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const { MercadoPagoConfig, Preference } = require("mercadopago");

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(Number);
const GROUP_ID = parseInt(process.env.GROUP_ID);
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preference = new Preference(client);

const bot = new TelegramBot(TOKEN, { polling: true });


const USERS_FILE = "./users.json";
const CCS_FILE = "./ccs.json";
const GGS_FILE = "./ggs.json";
const CTS_FILE = "./cts.json";

let bancoConfig = { type: "mercadopago", pix_key: null };
let startMedia = null;
let broadcastData = null; 

const LOGINS_FILE = "./logins.json";
const PRICES_FILE = "./prices.json";
const HISTORY_FILE = "./history.json";


function load(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = load(USERS_FILE);
let ccs = load(CCS_FILE);
let ggs = load(GGS_FILE);
let cts = load(CTS_FILE);
let logins = load(LOGINS_FILE);
let prices = load(PRICES_FILE) || { ccs: {}, ggs: {}, cts: {}, logins: {} };
let history = load(HISTORY_FILE);


async function getBinInfo(bin) {
  try {
    const res = await axios.get(`https://binlist.io/lookup/${bin}/`, { 
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    });
    
    if (res.data && res.data.scheme) {
      let level = "standard";
      
      if (res.data.category) {
        const cat = res.data.category.toLowerCase();
        if (cat.includes("black") || cat.includes("infinite") || cat.includes("world elite")) {
          level = "black";
        } else if (cat.includes("platinum") || cat.includes("signature")) {
          level = "platinum";
        } else if (cat.includes("gold")) {
          level = "gold";
        } else if (cat.includes("business") || cat.includes("corporate")) {
          level = "business";
        }
      }
      
      return {
        scheme: res.data.scheme.toLowerCase(),
        type: res.data.type?.toLowerCase() || "credit",
        level: level,
        bank: res.data.bank?.name || "Banco Internacional"
      };
    }
  } catch (error) {}
  
  const firstDigit = bin.charAt(0);
  let detectedScheme = "mastercard";
  if (firstDigit === "4") detectedScheme = "visa";
  else if (firstDigit === "5") detectedScheme = "mastercard";
  else if (firstDigit === "3") detectedScheme = "amex";
  else if (firstDigit === "6") detectedScheme = "discover";
  
  return {
    scheme: detectedScheme,
    type: "credit",
    level: "standard",
    bank: "Banco Internacional"
  };
}


function generateAuxData() {
  const firstNames = ["João", "Maria", "Pedro", "Ana", "Carlos", "Juliana", "Lucas", "Fernanda", "Rafael", "Beatriz"];
  const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Costa", "Ferreira", "Rodrigues", "Almeida", "Pereira"];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const nome = `${firstName} ${lastName}`;
  
  const cpf = Array.from({length: 11}, () => Math.floor(Math.random() * 10)).join('');
  const cpfFormatted = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  
  const domains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const emailUser = firstName.toLowerCase() + lastName.toLowerCase() + Math.floor(Math.random() * 1000);
  const gmail = `${emailUser}@${domain}`;
  
  const ddd = Math.floor(Math.random() * 89) + 11;
  const numero = `(${ddd}) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
  
  return { nome, cpf: cpfFormatted, gmail, numero };
}




bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id.toString();
  if (!users[userId]) {
    users[userId] = { name: msg.from.first_name, saldo: 0, pontos: 0 };
    save(USERS_FILE, users);
  }

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 CCs", callback_data: "ccs" }, { text: "💎 GGs", callback_data: "ggs" }],
        [{ text: "🔑 LOGINS", callback_data: "logins" }, { text: "✅ CONSULTADAS", callback_data: "cts" }],
        [{ text: "📦 MINHAS COMPRAS", callback_data: "history" }, { text: "💬 SUPORTE", url: "https://t.me/cybersecofc" }],
        [{ text: "📢 CANAL", url: "https://t.me/cybersecofcadm" }, { text: "💰 ADICIONAR SALDO", callback_data: "pix" }],
      ],
    },
  };

  const caption = `╔══════════════════════════════════╗
║  ██▓▒░ CYBERSEC DATA STORAGE ░▒▓██  ║
║══════════════════════════════════║
║  👤 USER ID....: ${userId.padEnd(20)}║
║  👤 NAME.......: ${msg.from.first_name.padEnd(20)}║
║══════════════════════════════════║
║  💰 CREDITS....: R$ ${users[userId].saldo.toFixed(2).padStart(8)}    ║
║  🪙 XP.........: ${users[userId].pontos.toString().padStart(8)}    ║
╚══════════════════════════════════╝`;

  if (startMedia) {
    if (startMedia.type === "photo") {
      bot.sendPhoto(msg.chat.id, startMedia.file_id, { caption, parse_mode: "HTML", ...opts });
    } else if (startMedia.type === "video") {
      bot.sendVideo(msg.chat.id, startMedia.file_id, { caption, parse_mode: "HTML", ...opts });
    }
  } else {
    bot.sendMessage(msg.chat.id, caption, { parse_mode: "HTML", ...opts });
  }
});


bot.onText(/\/cc (.+)/s, async (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const lines = match[1].split("\n").filter(Boolean);
  let count = 0;
  let errors = [];
  
  const statusMsg = await bot.sendMessage(msg.chat.id, "⏳ VERIFICANDO BINs...");
  
  for (let line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    const parts = trimmedLine.split("|");
    if (parts.length < 4) {
      errors.push(`❌ Formato inválido: ${trimmedLine.slice(0, 30)}...`);
      continue;
    }
    
    const [num, mes, ano, cvv] = parts;
    if (!/^\d{15,16}$/.test(num)) {
      errors.push(`❌ Número inválido: ${num.slice(0, 10)}...`);
      continue;
    }
    
    const bin = num.slice(0, 6);
    const info = await getBinInfo(bin);
    
    ccs[trimmedLine] = { bin, level: info.level, flag: info.scheme, bank: info.bank };
    count++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  save(CCS_FILE, ccs);
  
  let responseMsg = `╔══════════════════════════════════╗\n║  ✅ ${count} CC(s) ADICIONADAS         ║\n`;
  if (errors.length > 0) {
    responseMsg += `╠══════════════════════════════════╣\n║  ⚠️ ${errors.length} ERRO(S)              ║\n`;
  }
  responseMsg += `╚══════════════════════════════════╝`;
  
  bot.editMessageText(responseMsg, { chat_id: msg.chat.id, message_id: statusMsg.message_id });
});


bot.onText(/\/gg (.+)/s, async (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const lines = match[1].split("\n").filter(Boolean);
  let count = 0;
  let errors = [];
  
  const statusMsg = await bot.sendMessage(msg.chat.id, "⏳ VERIFICANDO BINs...");
  
  for (let line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    const parts = trimmedLine.split("|");
    if (parts.length < 4) {
      errors.push(`❌ Formato inválido: ${trimmedLine.slice(0, 30)}...`);
      continue;
    }
    
    const [num, mes, ano, cvv] = parts;
    if (!/^\d{15,16}$/.test(num)) {
      errors.push(`❌ Número inválido: ${num.slice(0, 10)}...`);
      continue;
    }
    
    const bin = num.slice(0, 6);
    const info = await getBinInfo(bin);
    
    ggs[trimmedLine] = { bin, level: info.level, flag: info.scheme, bank: info.bank };
    count++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  save(GGS_FILE, ggs);
  
  let responseMsg = `╔══════════════════════════════════╗\n║  ✅ ${count} GG(s) ADICIONADAS         ║\n`;
  if (errors.length > 0) {
    responseMsg += `╠══════════════════════════════════╣\n║  ⚠️ ${errors.length} ERRO(S)              ║\n`;
  }
  responseMsg += `╚══════════════════════════════════╝`;
  
  bot.editMessageText(responseMsg, { chat_id: msg.chat.id, message_id: statusMsg.message_id });
});


bot.onText(/\/ct (.+)/s, async (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const lines = match[1].split("\n").filter(Boolean);
  let count = 0;
  let errors = [];
  
  const statusMsg = await bot.sendMessage(msg.chat.id, "⏳ VERIFICANDO...");
  
  for (let line of lines) {
    const parts = line.split("|");
    if (parts.length < 5) {
      errors.push(`❌ Formato: numero|mes|ano|cvv|saldo`);
      continue;
    }
    
    const [num, mes, ano, cvv, saldo] = parts;
    if (!/^\d{15,16}$/.test(num)) {
      errors.push(`❌ Número inválido: ${num.slice(0, 10)}...`);
      continue;
    }
    
    const bin = num.slice(0, 6);
    const info = await getBinInfo(bin);
    
    cts[line] = { bin, saldo, bank: info.bank };
    count++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  save(CTS_FILE, cts);
  
  let responseMsg = `╔══════════════════════════════════╗\n║  ✅ ${count} CT(s) ADICIONADAS         ║\n`;
  if (errors.length > 0) {
    responseMsg += `╠══════════════════════════════════╣\n║  ⚠️ ${errors.length} ERRO(S)              ║\n`;
  }
  responseMsg += `╚══════════════════════════════════╝`;
  
  bot.editMessageText(responseMsg, { chat_id: msg.chat.id, message_id: statusMsg.message_id });
});


bot.onText(/\/lg (.+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const login = match[1];
  bot.sendMessage(msg.chat.id, "📝 ENVIE O NOME DA PLATAFORMA (ex: netflix):").then(() => {
    bot.once("message", (reply) => {
      const name = reply.text.trim().toLowerCase();
      if (!logins[name]) logins[name] = [];
      logins[name].push(login);
      save(LOGINS_FILE, logins);
      bot.sendMessage(msg.chat.id, `✅ LOGIN ADICIONADO EM: ${name.toUpperCase()}`);
    });
  });
});


bot.onText(/\/gift (\d+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const code = `GIFT${Date.now()}`;
  const value = parseFloat(match[1]);
  users[code] = { type: "gift", value };
  save(USERS_FILE, users);
  
  bot.sendMessage(msg.chat.id, `╔══════════════════════════════════╗
║  🎁 GIFT GERADO                  ║
╠══════════════════════════════════╣
║  CÓDIGO: ${code.padEnd(20)}║
║  VALOR: R$ ${value.toFixed(2).padStart(8)}           ║
╚══════════════════════════════════╝`);
});


bot.onText(/\/resgatar (.+)/, (msg, match) => {
  const userId = msg.from.id.toString();
  const code = match[1].trim();
  
  if (!users[code] || users[code].type !== "gift") {
    bot.sendMessage(msg.chat.id, "❌ CÓDIGO INVÁLIDO OU JÁ UTILIZADO.");
    return;
  }

  const value = users[code].value;
  users[userId].saldo += value;
  delete users[code];
  save(USERS_FILE, users);
  
  bot.sendMessage(msg.chat.id, `╔══════════════════════════════════╗
║  ✅ GIFT RESGATADO               ║
╠══════════════════════════════════╣
║  💰 VALOR: R$ ${value.toFixed(2).padStart(8)}           ║
║  💳 SALDO: R$ ${users[userId].saldo.toFixed(2).padStart(8)}           ║
╚══════════════════════════════════╝`);
});


bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  
  const userId = msg.from.id.toString();
  const code = msg.text.trim();
  
  if (code.startsWith("GIFT") && users[code] && users[code].type === "gift") {
    const value = users[code].value;
    users[userId].saldo += value;
    delete users[code];
    save(USERS_FILE, users);
    
    bot.sendMessage(msg.chat.id, `✅ GIFT RESGATADO! +R$ ${value.toFixed(2)}`);
  }
});

// Pix
bot.onText(/\/pix (\d+)/, async (msg, match) => {
  const value = parseFloat(match[1]);
  
  if (value < 11) {
    bot.sendMessage(msg.chat.id, `❌ VALOR MÍNIMO: R$ 11,00\n💡 Use: /pix 11`);
    return;
  }
  
  if (bancoConfig.type === "pix_manual" && bancoConfig.pix_key) {
    bot.sendMessage(msg.chat.id, `╔══════════════════════════════════╗
║  💰 PAGAMENTO MANUAL             ║
╠══════════════════════════════════╣
║  CHAVE PIX: ${bancoConfig.pix_key.padEnd(20)}║
║  VALOR: R$ ${value.toFixed(2).padStart(8)}           ║
╠══════════════════════════════════╣
║  APÓS O PAGAMENTO, ENVIE        ║
║  O COMPROVANTE PARA:            ║
║  @arcanj071                     ║
╚══════════════════════════════════╝`);
  } else {
    const body = {
      items: [{ title: "Recarga", quantity: 1, currency_id: "BRL", unit_price: value }],
      external_reference: msg.from.id.toString(),
    };

    try {
      const res = await preference.create({ body });
      const qr = res.point_of_interaction?.transaction_data?.qr_code;
      if (qr) {
        bot.sendMessage(msg.chat.id, `╔══════════════════════════════════╗
║  💰 PIX AUTOMÁTICO               ║
╠══════════════════════════════════╣
║  VALOR: R$ ${value.toFixed(2).padStart(8)}           ║
╠══════════════════════════════════╣
║  COPIA E COLA:                   ║
║  ${qr.slice(0, 40)}...            ║
╚══════════════════════════════════╝`);
      } else {
        bot.sendMessage(msg.chat.id, "❌ ERRO AO GERAR PIX.");
      }
    } catch (error) {
      console.error("Erro Pix:", error);
      bot.sendMessage(msg.chat.id, "❌ ERRO AO GERAR PIX.");
    }
  }
});



bot.on("callback_query", async (query) => {
  const userId = query.from.id.toString();
  const chatId = query.message.chat.id;

  // === CCs ===
  if (query.data === "ccs") {
    const allCcs = Object.values(ccs);
    if (allCcs.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA CC DISPONÍVEL.");
      return;
    }
    
    const bancos = [...new Set(allCcs.map(c => c.bank || "Banco Desconhecido"))];
    
    const opts = {
      reply_markup: {
        inline_keyboard: bancos.map(banco => [
          { text: `🏦 ${banco}`, callback_data: `bank_cc_${banco.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "🏦 ESCOLHA O BANCO:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bank_cc_")) {
    const banco = query.data.replace("bank_cc_", "").replace(/_/g, ' ');
    const filtered = Object.entries(ccs).filter(([, v]) => v.bank === banco);
    const bins = [...new Set(filtered.map(([, v]) => v.bin))];
    
    const opts = {
      reply_markup: {
        inline_keyboard: bins.map(bin => {
          const price = prices.ccs?.[banco] || 5;
          return [{ text: `🔢 ${bin} | R$ ${price.toFixed(2)}`, callback_data: `bin_cc_${bin}_${banco.replace(/\s+/g, '_')}` }];
        }),
      },
    };
    bot.sendMessage(chatId, `🏦 ${banco} - ESCOLHA A BIN:`, { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bin_cc_")) {
    const parts = query.data.replace("bin_cc_", "").split("_");
    const bin = parts[0];
    const banco = parts.slice(1).join(" ").replace(/_/g, ' ');
    const index = parseInt(query.data.split("_idx_")[1]) || 0;
    
    const filtered = Object.entries(ccs).filter(([, v]) => v.bin === bin && v.bank === banco);
    
    if (filtered.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUM CARTÃO DISPONÍVEL.");
      return;
    }
    
    const [cc, data] = filtered[index];
    const partsCard = cc.split("|");
    const [num, mes, ano, cvv] = partsCard;
    const price = prices.ccs?.[banco] || 5;
    
    const keyboard = [];
    
    if (filtered.length > 1) {
      const navButtons = [];
      if (index > 0) navButtons.push({ text: "⬅️", callback_data: `bin_cc_${bin}_${banco.replace(/\s+/g, '_')}_idx_${index - 1}` });
      navButtons.push({ text: `${index + 1}/${filtered.length}`, callback_data: "noop" });
      if (index < filtered.length - 1) navButtons.push({ text: "➡️", callback_data: `bin_cc_${bin}_${banco.replace(/\s+/g, '_')}_idx_${index + 1}` });
      keyboard.push(navButtons);
    }
    
    keyboard.push([{ text: `✅ COMPRAR R$ ${price.toFixed(2)}`, callback_data: `buy_cc_${cc}` }]);
    
    const msg = `╔══════════════════════════════════╗
║  💳 CC - DETALHES                ║
╠══════════════════════════════════╣
║  BIN.....: ${bin.padEnd(20)}║
║  VALIDADE: ${mes}/${ano.padEnd(17)}║
║  BANCO...: ${(data.bank || "Desconhecido").padEnd(20)}║
║  BANDEIRA: ${(data.flag?.toUpperCase() || "MASTERCARD").padEnd(20)}║
║  NÍVEL...: ${(data.level?.toUpperCase() || "STANDARD").padEnd(20)}║
║  PREÇO...: R$ ${price.toFixed(2).padStart(8)}           ║
╠══════════════════════════════════╣
║  📦 ESTOQUE: ${filtered.length} DISPONÍVEL(EIS) ║
╚══════════════════════════════════╝`;
    
    bot.sendMessage(chatId, msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
  }

  
  if (query.data === "ggs") {
    const allGgs = Object.values(ggs);
    if (allGgs.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA GG DISPONÍVEL.");
      return;
    }
    
    const bancos = [...new Set(allGgs.map(c => c.bank || "Banco Desconhecido"))];
    
    const opts = {
      reply_markup: {
        inline_keyboard: bancos.map(banco => [
          { text: `🏦 ${banco}`, callback_data: `bank_gg_${banco.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "🏦 ESCOLHA O BANCO:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bank_gg_")) {
    const banco = query.data.replace("bank_gg_", "").replace(/_/g, ' ');
    const filtered = Object.entries(ggs).filter(([, v]) => v.bank === banco);
    const bins = [...new Set(filtered.map(([, v]) => v.bin))];
    
    const opts = {
      reply_markup: {
        inline_keyboard: bins.map(bin => {
          const price = prices.ggs?.[banco] || 10;
          return [{ text: `🔢 ${bin} | R$ ${price.toFixed(2)}`, callback_data: `bin_gg_${bin}_${banco.replace(/\s+/g, '_')}` }];
        }),
      },
    };
    bot.sendMessage(chatId, `🏦 ${banco} - ESCOLHA A BIN:`, { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bin_gg_")) {
    const parts = query.data.replace("bin_gg_", "").split("_");
    const bin = parts[0];
    const banco = parts.slice(1).join(" ").replace(/_/g, ' ');
    const index = parseInt(query.data.split("_idx_")[1]) || 0;
    
    const filtered = Object.entries(ggs).filter(([, v]) => v.bin === bin && v.bank === banco);
    
    if (filtered.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUM CARTÃO DISPONÍVEL.");
      return;
    }
    
    const [gg, data] = filtered[index];
    const partsCard = gg.split("|");
    const [num, mes, ano, cvv] = partsCard;
    const price = prices.ggs?.[banco] || 10;
    
    const keyboard = [];
    
    if (filtered.length > 1) {
      const navButtons = [];
      if (index > 0) navButtons.push({ text: "⬅️", callback_data: `bin_gg_${bin}_${banco.replace(/\s+/g, '_')}_idx_${index - 1}` });
      navButtons.push({ text: `${index + 1}/${filtered.length}`, callback_data: "noop" });
      if (index < filtered.length - 1) navButtons.push({ text: "➡️", callback_data: `bin_gg_${bin}_${banco.replace(/\s+/g, '_')}_idx_${index + 1}` });
      keyboard.push(navButtons);
    }
    
    keyboard.push([{ text: `✅ COMPRAR R$ ${price.toFixed(2)}`, callback_data: `buy_gg_${gg}` }]);
    
    const msg = `╔══════════════════════════════════╗
║  💎 GG - DETALHES                ║
╠══════════════════════════════════╣
║  BIN.....: ${bin.padEnd(20)}║
║  VALIDADE: ${mes}/${ano.padEnd(17)}║
║  BANCO...: ${(data.bank || "Desconhecido").padEnd(20)}║
║  BANDEIRA: ${(data.flag?.toUpperCase() || "MASTERCARD").padEnd(20)}║
║  NÍVEL...: ${(data.level?.toUpperCase() || "STANDARD").padEnd(20)}║
║  PREÇO...: R$ ${price.toFixed(2).padStart(8)}           ║
╠══════════════════════════════════╣
║  📦 ESTOQUE: ${filtered.length} DISPONÍVEL(EIS) ║
╚══════════════════════════════════╝`;
    
    bot.sendMessage(chatId, msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
  }

  
  if (query.data.startsWith("buy_cc_")) {
    const cc = query.data.replace("buy_cc_", "");
    const ccData = ccs[cc];
    
    if (!ccData) {
      bot.sendMessage(chatId, "❌ CARTÃO NÃO ENCONTRADO.");
      return;
    }
    
    const banco = ccData.bank || "Banco Desconhecido";
    const price = prices.ccs?.[banco] || 5;
    
    if (users[userId].saldo < price) {
      bot.sendMessage(chatId, "❌ SALDO INSUFICIENTE.");
      return;
    }

    const auxData = generateAuxData();
    
    users[userId].saldo -= price;
    delete ccs[cc];
    history[userId] = history[userId] || [];
    history[userId].push({ item: cc, type: "cc", price, date: new Date().toISOString() });
    save(USERS_FILE, users);
    save(CCS_FILE, ccs);
    save(HISTORY_FILE, history);
    
    const parts = cc.split("|");
    const [num, mes, ano, cvv] = parts;
    const bin = num.slice(0, 6);
    
    const purchaseMsg = `╔══════════════════════════════════╗
║  ✅ COMPRA REALIZADA            ║
╠══════════════════════════════════╣
║  💳 NÚMERO....: ${num.padEnd(20)}║
║  📅 VALIDADE..: ${mes}/${ano.padEnd(17)}║
║  🔒 CVV.......: ${cvv.padEnd(20)}║
║  🔢 BIN.......: ${bin.padEnd(20)}║
║  🏦 BANCO.....: ${(ccData.bank || "Desconhecido").padEnd(20)}║
║  🎫 BANDEIRA..: ${(ccData.flag?.toUpperCase() || "MASTERCARD").padEnd(20)}║
║  💎 NÍVEL.....: ${(ccData.level?.toUpperCase() || "STANDARD").padEnd(20)}║
╠══════════════════════════════════╣
║  👤 NOME......: ${auxData.nome.padEnd(20)}║
║  📋 CPF.......: ${auxData.cpf.padEnd(20)}║
║  📧 EMAIL.....: ${auxData.gmail.slice(0, 20).padEnd(20)}║
║  📱 TELEFONE..: ${auxData.numero.padEnd(20)}║
╠══════════════════════════════════╣
║  💰 PAGO......: R$ ${price.toFixed(2).padStart(8)}           ║
║  💳 SALDO.....: R$ ${users[userId].saldo.toFixed(2).padStart(8)}           ║
╚══════════════════════════════════╝`;
    
    bot.sendMessage(chatId, purchaseMsg, { parse_mode: "HTML" });
    bot.sendMessage(GROUP_ID, `💳 @${query.from.username || query.from.first_name} COMPROU CC: ${bin}****`);
  }

  if (query.data.startsWith("buy_gg_")) {
    const gg = query.data.replace("buy_gg_", "");
    const ggData = ggs[gg];
    
    if (!ggData) {
      bot.sendMessage(chatId, "❌ CARTÃO NÃO ENCONTRADO.");
      return;
    }
    
    const banco = ggData.bank || "Banco Desconhecido";
    const price = prices.ggs?.[banco] || 10;
    
    if (users[userId].saldo < price) {
      bot.sendMessage(chatId, "❌ SALDO INSUFICIENTE.");
      return;
    }

    const auxData = generateAuxData();
    
    users[userId].saldo -= price;
    delete ggs[gg];
    history[userId] = history[userId] || [];
    history[userId].push({ item: gg, type: "gg", price, date: new Date().toISOString() });
    save(USERS_FILE, users);
    save(GGS_FILE, ggs);
    save(HISTORY_FILE, history);
    
    const parts = gg.split("|");
    const [num, mes, ano, cvv] = parts;
    const bin = num.slice(0, 6);
    
    const purchaseMsg = `╔══════════════════════════════════╗
║  ✅ COMPRA REALIZADA            ║
╠══════════════════════════════════╣
║  💳 NÚMERO....: ${num.padEnd(20)}║
║  📅 VALIDADE..: ${mes}/${ano.padEnd(17)}║
║  🔒 CVV.......: ${cvv.padEnd(20)}║
║  🔢 BIN.......: ${bin.padEnd(20)}║
║  🏦 BANCO.....: ${(ggData.bank || "Desconhecido").padEnd(20)}║
║  🎫 BANDEIRA..: ${(ggData.flag?.toUpperCase() || "MASTERCARD").padEnd(20)}║
║  💎 NÍVEL.....: ${(ggData.level?.toUpperCase() || "STANDARD").padEnd(20)}║
╠══════════════════════════════════╣
║  👤 NOME......: ${auxData.nome.padEnd(20)}║
║  📋 CPF.......: ${auxData.cpf.padEnd(20)}║
║  📧 EMAIL.....: ${auxData.gmail.slice(0, 20).padEnd(20)}║
║  📱 TELEFONE..: ${auxData.numero.padEnd(20)}║
╠══════════════════════════════════╣
║  💰 PAGO......: R$ ${price.toFixed(2).padStart(8)}           ║
║  💳 SALDO.....: R$ ${users[userId].saldo.toFixed(2).padStart(8)}           ║
╚══════════════════════════════════╝`;
    
    bot.sendMessage(chatId, purchaseMsg, { parse_mode: "HTML" });
    bot.sendMessage(GROUP_ID, `💎 @${query.from.username || query.from.first_name} COMPROU GG: ${bin}****`);
  }

  
  if (query.data === "logins") {
    const platforms = Object.keys(logins);
    if (platforms.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUM LOGIN DISPONÍVEL.");
      return;
    }
    const opts = {
      reply_markup: {
        inline_keyboard: platforms.map(p => [
          { text: `🔑 ${p.toUpperCase()}`, callback_data: `platform_${p}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "🔑 ESCOLHA A PLATAFORMA:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("platform_")) {
    const platform = query.data.replace("platform_", "");
    const loginList = logins[platform] || [];
    if (loginList.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUM LOGIN DISPONÍVEL.");
      return;
    }
    const opts = {
      reply_markup: {
        inline_keyboard: loginList.map((login, idx) => {
          const price = prices.logins?.[platform] || 15;
          return [{ text: `🔑 LOGIN #${idx + 1} | R$ ${price.toFixed(2)}`, callback_data: `buy_login_${platform}_${idx}` }];
        }),
      },
    };
    bot.sendMessage(chatId, `🔑 ${platform.toUpperCase()} - ${loginList.length} DISPONÍVEIS`, { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("buy_login_")) {
    const parts = query.data.replace("buy_login_", "").split("_");
    const platform = parts[0];
    const idx = parseInt(parts[1]);
    const login = logins[platform]?.[idx];
    
    if (!login) {
      bot.sendMessage(chatId, "❌ LOGIN NÃO ENCONTRADO.");
      return;
    }
    
    const price = prices.logins?.[platform] || 15;
    
    if (users[userId].saldo < price) {
      bot.sendMessage(chatId, "❌ SALDO INSUFICIENTE.");
      return;
    }

    users[userId].saldo -= price;
    logins[platform].splice(idx, 1);
    if (logins[platform].length === 0) delete logins[platform];
    history[userId] = history[userId] || [];
    history[userId].push({ item: login, type: `login-${platform}`, price, date: new Date().toISOString() });
    save(USERS_FILE, users);
    save(LOGINS_FILE, logins);
    save(HISTORY_FILE, history);
    
    bot.sendMessage(chatId, `╔══════════════════════════════════╗
║  ✅ LOGIN COMPRADO               ║
╠══════════════════════════════════╣
║  🔑 ${login.padEnd(36)}║
╠══════════════════════════════════╣
║  💰 PAGO: R$ ${price.toFixed(2)}                ║
╚══════════════════════════════════╝`);
    bot.sendMessage(GROUP_ID, `🔑 @${query.from.username || query.from.first_name} COMPROU LOGIN ${platform}: ${login}`);
  }

  
  if (query.data === "cts") {
    const banks = [...new Set(Object.values(cts).map(c => c.bank || "Banco Desconhecido"))];
    if (banks.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA CONSULTADA DISPONÍVEL.");
      return;
    }
    const opts = {
      reply_markup: {
        inline_keyboard: banks.map(bank => [
          { text: `🏦 ${bank}`, callback_data: `bank_ct_${bank.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "✅ ESCOLHA O BANCO:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bank_ct_")) {
    const bank = query.data.replace("bank_ct_", "").replace(/_/g, ' ');
    const filtered = Object.entries(cts).filter(([, v]) => v.bank === bank);
    const bins = [...new Set(filtered.map(([, v]) => v.bin))];
    
    const opts = {
      reply_markup: {
        inline_keyboard: bins.map(b => [
          { text: `🔢 ${b}`, callback_data: `bin_ct_${b}_${bank.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, `🏦 ${bank} - ESCOLHA A BIN:`, { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("bin_ct_")) {
    const parts = query.data.replace("bin_ct_", "").split("_");
    const bin = parts[0];
    const bank = parts.slice(1).join(" ").replace(/_/g, ' ');
    const filtered = Object.entries(cts).filter(([, v]) => v.bin === bin && v.bank === bank);
    
    if (filtered.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA CONSULTADA DISPONÍVEL.");
      return;
    }
    
    const opts = {
      reply_markup: {
        inline_keyboard: filtered.map(([ct, data]) => {
          const price = prices.cts?.[ct] || 20;
          const shortCt = ct.length > 30 ? ct.slice(0, 27) + "..." : ct;
          return [{ text: `✅ ${shortCt} | R$ ${price.toFixed(2)}`, callback_data: `buy_ct_${ct}` }];
        }),
      },
    };
    bot.sendMessage(chatId, `✅ ${bin} - ${filtered.length} DISPONÍVEIS`, { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("buy_ct_")) {
    const ct = query.data.replace("buy_ct_", "");
    const ctData = cts[ct];
    
    if (!ctData) {
      bot.sendMessage(chatId, "❌ CONSULTADA NÃO ENCONTRADA.");
      return;
    }
    
    const price = prices.cts?.[ct] || 20;
    
    if (users[userId].saldo < price) {
      bot.sendMessage(chatId, "❌ SALDO INSUFICIENTE.");
      return;
    }

    users[userId].saldo -= price;
    delete cts[ct];
    history[userId] = history[userId] || [];
    history[userId].push({ item: `${ct} | Saldo: R$ ${ctData.saldo}`, type: "ct", price, date: new Date().toISOString() });
    save(USERS_FILE, users);
    save(CTS_FILE, cts);
    save(HISTORY_FILE, history);
    
    bot.sendMessage(chatId, `╔══════════════════════════════════╗
║  ✅ CONSULTADA COMPRADA          ║
╠══════════════════════════════════╣
║  💳 ${ct.slice(0, 36).padEnd(36)}║
║  💰 SALDO: R$ ${ctData.saldo}               ║
╠══════════════════════════════════╣
║  💰 PAGO: R$ ${price.toFixed(2)}                ║
╚══════════════════════════════════╝`);
    bot.sendMessage(GROUP_ID, `✅ @${query.from.username || query.from.first_name} COMPROU CT: ${ct.slice(0, 20)}...`);
  }

  // === HISTÓRICO ===
  if (query.data === "history") {
    const items = history[userId] || [];
    if (items.length === 0) {
      bot.sendMessage(chatId, "📦 VOCÊ AINDA NÃO COMPROU NADA.");
      return;
    }
    
    let msg = "╔══════════════════════════════════╗\n║  📦 HISTÓRICO DE COMPRAS        ║\n╠══════════════════════════════════╣\n";
    items.slice(-10).forEach((h, idx) => {
      msg += `║  ${(idx + 1).toString().padStart(2)}. ${h.type.toUpperCase().padEnd(30)}║\n`;
    });
    msg += `╠══════════════════════════════════╣\n║  TOTAL: ${items.length} COMPRA(S)           ║\n╚══════════════════════════════════╝`;
    
    bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
  }

  if (query.data === "pix") {
    bot.sendMessage(chatId, "💰 USE /pix <VALOR>\n\nEXEMPLO: /pix 50");
  }
  
  if (query.data === "noop") {
    return;
  }

  
  
 
  if (query.data === "broadcast_yes") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    
    if (!broadcastData) {
      bot.sendMessage(chatId, "❌ NENHUMA MENSAGEM PARA ENVIAR.");
      return;
    }
    
    let sent = 0;
    Object.keys(users).forEach((uid) => {
      if (users[uid].type === "gift") return;
      
      if (broadcastData.photo) {
        bot.sendPhoto(uid, broadcastData.photo[broadcastData.photo.length - 1].file_id, {
          caption: broadcastData.caption,
        }).then(() => sent++).catch(() => {});
      } else if (broadcastData.text) {
        bot.sendMessage(uid, broadcastData.text).then(() => sent++).catch(() => {});
      }
    });
    
    if (broadcastData.photo) {
      bot.sendPhoto(GROUP_ID, broadcastData.photo[broadcastData.photo.length - 1].file_id, {
        caption: broadcastData.caption,
      });
    } else if (broadcastData.text) {
      bot.sendMessage(GROUP_ID, broadcastData.text);
    }
    
    setTimeout(() => {
      bot.sendMessage(chatId, `✅ BROADCAST ENVIADO PARA ${sent} USUÁRIOS E GRUPO!`);
    }, 2000);
    broadcastData = null;
  }
  
  if (query.data === "broadcast_no") {
    bot.sendMessage(chatId, "❌ BROADCAST CANCELADO.");
    broadcastData = null;
  }

  // Preços CCs
  if (query.data === "admin_prices_cc") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const bancos = [...new Set(Object.values(ccs).map(c => c.bank || "Banco Desconhecido"))];
    const opts = {
      reply_markup: {
        inline_keyboard: bancos.map(b => [
          { text: `💳 ${b} - R$ ${prices.ccs?.[b] || 5}`, callback_data: `setprice_cc_${b.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "💳 PREÇOS DAS CCs POR BANCO:\n\nCLIQUE PARA ALTERAR:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("setprice_cc_")) {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const banco = query.data.replace("setprice_cc_", "").replace(/_/g, ' ');
    bot.sendMessage(chatId, `💳 DIGITE O NOVO PREÇO PARA CCs DO BANCO ${banco}:`).then(() => {
      bot.once("message", (reply) => {
        const newPrice = parseFloat(reply.text);
        if (isNaN(newPrice)) {
          bot.sendMessage(chatId, "❌ PREÇO INVÁLIDO.");
          return;
        }
        if (!prices.ccs) prices.ccs = {};
        prices.ccs[banco] = newPrice;
        save(PRICES_FILE, prices);
        bot.sendMessage(chatId, `✅ PREÇO DE CCs DO BANCO ${banco} ATUALIZADO PARA R$ ${newPrice.toFixed(2)}`);
      });
    });
  }

  // Preços GGs
  if (query.data === "admin_prices_gg") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const bancos = [...new Set(Object.values(ggs).map(g => g.bank || "Banco Desconhecido"))];
    const opts = {
      reply_markup: {
        inline_keyboard: bancos.map(b => [
          { text: `💎 ${b} - R$ ${prices.ggs?.[b] || 10}`, callback_data: `setprice_gg_${b.replace(/\s+/g, '_')}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "💎 PREÇOS DAS GGs POR BANCO:\n\nCLIQUE PARA ALTERAR:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("setprice_gg_")) {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const banco = query.data.replace("setprice_gg_", "").replace(/_/g, ' ');
    bot.sendMessage(chatId, `💎 DIGITE O NOVO PREÇO PARA GGs DO BANCO ${banco}:`).then(() => {
      bot.once("message", (reply) => {
        const newPrice = parseFloat(reply.text);
        if (isNaN(newPrice)) {
          bot.sendMessage(chatId, "❌ PREÇO INVÁLIDO.");
          return;
        }
        if (!prices.ggs) prices.ggs = {};
        prices.ggs[banco] = newPrice;
        save(PRICES_FILE, prices);
        bot.sendMessage(chatId, `✅ PREÇO DE GGs DO BANCO ${banco} ATUALIZADO PARA R$ ${newPrice.toFixed(2)}`);
      });
    });
  }

  // Preços Consultadas
  if (query.data === "admin_prices_ct") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const ctsList = Object.entries(cts);
    if (ctsList.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA CONSULTADA CADASTRADA.");
      return;
    }
    const opts = {
      reply_markup: {
        inline_keyboard: ctsList.slice(0, 20).map(([ct, data]) => [
          { text: `✅ ${ct.slice(0, 20)}... - R$ ${prices.cts?.[ct] || 20}`, callback_data: `setprice_ct_${ct}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "✅ PREÇOS DAS CONSULTADAS:\n\nCLIQUE PARA ALTERAR:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("setprice_ct_")) {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const ct = query.data.replace("setprice_ct_", "");
    bot.sendMessage(chatId, `✅ DIGITE O NOVO PREÇO PARA ESTA CONSULTADA:\n${ct}`).then(() => {
      bot.once("message", (reply) => {
        const newPrice = parseFloat(reply.text);
        if (isNaN(newPrice)) {
          bot.sendMessage(chatId, "❌ PREÇO INVÁLIDO.");
          return;
        }
        if (!prices.cts) prices.cts = {};
        prices.cts[ct] = newPrice;
        save(PRICES_FILE, prices);
        bot.sendMessage(chatId, `✅ PREÇO DA CONSULTADA ATUALIZADO PARA R$ ${newPrice.toFixed(2)}`);
      });
    });
  }

  // Preços Logins
  if (query.data === "admin_prices_login") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const platforms = Object.keys(logins);
    if (platforms.length === 0) {
      bot.sendMessage(chatId, "❌ NENHUMA PLATAFORMA CADASTRADA.");
      return;
    }
    const opts = {
      reply_markup: {
        inline_keyboard: platforms.map(p => [
          { text: `🔑 ${p.toUpperCase()} - R$ ${prices.logins?.[p] || 15}`, callback_data: `setprice_login_${p}` }
        ]),
      },
    };
    bot.sendMessage(chatId, "🔑 PREÇOS DOS LOGINS POR PLATAFORMA:\n\nCLIQUE PARA ALTERAR:", { parse_mode: "HTML", ...opts });
  }

  if (query.data.startsWith("setprice_login_")) {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const platform = query.data.replace("setprice_login_", "");
    bot.sendMessage(chatId, `🔑 DIGITE O NOVO PREÇO PARA LOGINS ${platform.toUpperCase()}:`).then(() => {
      bot.once("message", (reply) => {
        const newPrice = parseFloat(reply.text);
        if (isNaN(newPrice)) {
          bot.sendMessage(chatId, "❌ PREÇO INVÁLIDO.");
          return;
        }
        if (!prices.logins) prices.logins = {};
        prices.logins[platform] = newPrice;
        save(PRICES_FILE, prices);
        bot.sendMessage(chatId, `✅ PREÇO DE LOGINS ${platform.toUpperCase()} ATUALIZADO PARA R$ ${newPrice.toFixed(2)}`);
      });
    });
  }

  
  if (query.data === "admin_banco") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 API KEY (MERCADO PAGO)", callback_data: "banco_api" }, { text: "💳 CHAVE PIX MANUAL", callback_data: "banco_pix" }],
          [{ text: "🔄 VOLTAR PARA PADRÃO", callback_data: "banco_default" }],
        ],
      },
    };
    bot.sendMessage(chatId, `╔══════════════════════════════════╗
║  🏦 CONFIGURAÇÃO DE PAGAMENTO   ║
╠══════════════════════════════════╣
║  MODO ATUAL: ${bancoConfig.type === "mercadopago" ? "MERCADO PAGO".padEnd(20) : "PIX MANUAL".padEnd(20)}║
╚══════════════════════════════════╝\n\nESCOLHA UMA OPÇÃO:`, { parse_mode: "HTML", ...opts });
  }

  if (query.data === "banco_api") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    bot.sendMessage(chatId, "⚠️ PARA ALTERAR A API KEY, EDITE O ARQUIVO .env E REINICIE O BOT.");
  }

  if (query.data === "banco_pix") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    bot.sendMessage(chatId, "💳 DIGITE A CHAVE PIX (CPF, EMAIL, CELULAR OU ALEATÓRIA):").then(() => {
      bot.once("message", (reply) => {
        bancoConfig.type = "pix_manual";
        bancoConfig.pix_key = reply.text.trim();
        bot.sendMessage(chatId, `✅ CHAVE PIX CONFIGURADA!\n\n💳 CHAVE: ${bancoConfig.pix_key}`);
      });
    });
  }

  if (query.data === "banco_default") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    bancoConfig.type = "mercadopago";
    bancoConfig.pix_key = null;
    bot.sendMessage(chatId, "✅ VOLTADO PARA CONFIGURAÇÃO PADRÃO (MERCADO PAGO).");
  }

  
  if (query.data === "admin_stats") {
    if (!ADMIN_IDS.includes(query.from.id)) return;
    const userCount = Object.keys(users).filter(k => !users[k].type).length;
    const ccCount = Object.keys(ccs).length;
    const ggCount = Object.keys(ggs).length;
    const ctCount = Object.keys(cts).length;
    const loginCount = Object.values(logins).reduce((sum, arr) => sum + arr.length, 0);
    
    bot.sendMessage(chatId, `╔══════════════════════════════════╗
║  📊 ESTATÍSTICAS DO SISTEMA     ║
╠══════════════════════════════════╣
║  👥 USUÁRIOS....: ${userCount.toString().padStart(8)}                 ║
║  💳 CCs.........: ${ccCount.toString().padStart(8)}                 ║
║  💎 GGs.........: ${ggCount.toString().padStart(8)}                 ║
║  ✅ CONSULTADAS.: ${ctCount.toString().padStart(8)}                 ║
║  🔑 LOGINS......: ${loginCount.toString().padStart(8)}                 ║
╚══════════════════════════════════╝`);
  }

  bot.answerCallbackQuery(query.id);
});




bot.onText(/\/painel/, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 PREÇOS CCs", callback_data: "admin_prices_cc" }, { text: "💎 PREÇOS GGs", callback_data: "admin_prices_gg" }],
        [{ text: "✅ PREÇOS CONSULTADAS", callback_data: "admin_prices_ct" }, { text: "🔑 PREÇOS LOGINS", callback_data: "admin_prices_login" }],
        [{ text: "🏦 BANCO", callback_data: "admin_banco" }],
        [{ text: "📊 ESTATÍSTICAS", callback_data: "admin_stats" }],
      ],
    },
  };
  
  bot.sendMessage(msg.chat.id, `╔══════════════════════════════════╗
║  ⚙️ PAINEL ADMINISTRATIVO        ║
╠══════════════════════════════════╣
║  ESCOLHA UMA OPÇÃO ABAIXO:       ║
╚══════════════════════════════════╝`, { parse_mode: "HTML", ...opts });
});


bot.onText(/\/ft/, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, "📸 ENVIE A FOTO OU VÍDEO PARA O /START:").then(() => {
    bot.once("message", (reply) => {
      if (reply.photo) {
        startMedia = { type: "photo", file_id: reply.photo[reply.photo.length - 1].file_id };
        bot.sendMessage(msg.chat.id, "✅ FOTO ADICIONADA AO /START!");
      } else if (reply.video) {
        startMedia = { type: "video", file_id: reply.video.file_id };
        bot.sendMessage(msg.chat.id, "✅ VÍDEO ADICIONADO AO /START!");
      } else {
        bot.sendMessage(msg.chat.id, "❌ ENVIE UMA FOTO OU VÍDEO.");
      }
    });
  });
});


bot.onText(/\/ms/, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, "📢 ENVIE A MENSAGEM OU FOTO PARA BROADCAST:").then(() => {
    bot.once("message", (reply) => {
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ SIM, ENVIAR", callback_data: "broadcast_yes" }, { text: "❌ NÃO, CANCELAR", callback_data: "broadcast_no" }],
          ],
        },
      };
      
      broadcastData = reply;
      
      if (reply.photo) {
        bot.sendPhoto(msg.chat.id, reply.photo[reply.photo.length - 1].file_id, {
          caption: reply.caption || "📢 PRÉVIA DA MENSAGEM\n\nDESEJA ENVIAR PARA TODOS?",
          ...opts,
        });
      } else if (reply.text) {
        bot.sendMessage(msg.chat.id, `📢 PRÉVIA DA MENSAGEM:\n\n${reply.text}\n\nDESEJA ENVIAR PARA TODOS?`, opts);
      } else {
        bot.sendMessage(msg.chat.id, "❌ FORMATO NÃO SUPORTADO. ENVIE TEXTO OU FOTO.");
      }
    });
  });
});

console.log("🤖 BOT INICIADO COM SUCESSO!");