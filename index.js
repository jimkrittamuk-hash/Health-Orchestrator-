const express = require('express');
const axios   = require('axios');
const app     = express();
app.use(express.json());

const LINE_TOKEN  = 'gySEWqsIGyhAL0nC8g2WROnzgSuFWXyDmQWEP5yVQTHpimQbbWo4xOIj0y7AYfbjihmsECA6+mmpHfJ13ybvIf/eO4VamBfq3UdJvjYKRohqkQpn8tswwETkCd8DDyAFGbL8AHLudKU7Y7g+0KtYoAdB04t89/1O/w1cDnyilFU=';
const GEMINI_KEY  = 'AIzaSyCJdxs18hgceuFF-FYd-A3lM90IwUnHo-c';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const GAS_LOG_URL = 'https://script.google.com/macros/s/AKfycbz8GzzpZFIOMolywy9IwYW9E2uCo54IGLO8KaRLXuJeCB_CqojPrKqTIe5IsbWlKEZw/exec';

// ─── WEBHOOK ────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' }); // ตอบ LINE ทันที
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await processMessage(event.message.text.trim(), event.replyToken, event.source.userId);
    }
  }
});

app.get('/', (req, res) => res.send('Health Orchestrator is running.'));
app.get('/test', async (req, res) => {
  try {
    const { data } = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: 'ตอบว่า OK' }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
    });
    res.json({ success: true, response: data.candidates[0].content.parts[0].text });
  } catch (e) {
    res.json({ success: false, status: e.response?.status, error: e.response?.data });
  }
});
// ─── PROCESS MESSAGE ────────────────────────────────────────
async function processMessage(text, replyToken, userId) {
  const cmd = text.toLowerCase();
  let response = '';

  if      (cmd.startsWith('/เขียน ') || cmd.startsWith('/write '))  response = await handleWrite(text.substring(text.indexOf(' ')+1), userId);
  else if (cmd.startsWith('/ตรวจ ')  || cmd.startsWith('/check '))  response = await complianceCheck(text.substring(text.indexOf(' ')+1));
  else if (cmd.startsWith('/seo '))                                   response = await seoAgent(text.substring(5));
  else if (cmd === '/สถานะ' || cmd === '/status')                    response = await getStatus();
  else if (cmd === '/help' || cmd === '/ช่วยเหลือ')                  response = getHelp();
  else                                                                response = await orchestrate(text);

  await sendReply(replyToken, response);
  logToGAS(userId, text, response);
}

// ─── ORCHESTRATOR ───────────────────────────────────────────
async function orchestrate(text) {
  const prompt = `วิเคราะห์ข้อความและเลือก agent ที่เหมาะสม:
- surgery: ผ่าตัด แผล ไส้ติ่ง ก้อนเนื้อ
- cardiology: หัวใจ ความดัน หลอดเลือด
- endocrine: เบาหวาน ไทรอยด์ ฮอร์โมน อ้วน
- pediatric: เด็ก วัคซีน พัฒนาการ
- seo: keyword การตลาดออนไลน์
- cs: นัดหมาย ราคา สอบถาม
ข้อความ: "${text}"
ตอบเฉพาะ JSON: {"agent":"surgery|cardiology|endocrine|pediatric|seo|cs"}`;
  try {
    const r = await callGemini(prompt);
    const { agent } = JSON.parse(r.replace(/```json|```/g,'').trim());
    return await runAgent(agent, text);
  } catch { return await callGemini(`ตอบคำถามนี้เป็นภาษาไทยอย่างเป็นมืออาชีพ: ${text}`); }
}

async function handleWrite(topic, userId) {
  const prompt = `หัวข้อ "${topic}" ควรให้แพทย์เฉพาะทางไหนเขียน?
ตอบเฉพาะ JSON: {"agent":"surgery|cardiology|endocrine|pediatric"}`;
  let agent = 'surgery';
  try { const r = await callGemini(prompt); agent = JSON.parse(r.replace(/```json|```/g,'').trim()).agent; } catch {}
  const draft = await runAgent(agent, topic);
  const compliance = await complianceCheckSilent(draft);
  logWork(topic, agent, userId);
  return draft + '\n\n' + compliance;
}

async function runAgent(agent, text) {
  switch(agent) {
    case 'surgery':    return surgeonAgent(text);
    case 'cardiology': return cardiologistAgent(text);
    case 'endocrine':  return endoAgent(text);
    case 'pediatric':  return pediaAgent(text);
    case 'seo':        return seoAgent(text);
    case 'cs':         return csAgent(text);
    default:           return surgeonAgent(text);
  }
}

// ─── AGENTS ─────────────────────────────────────────────────
async function surgeonAgent(text) {
  return callGemini(`คุณคือ Dr.ศัลยกรรม เขียนเนื้อหาการแพทย์ภาษาไทยสำหรับโรงพยาบาลเอกชน
ห้ามรับประกันผลการรักษา ห้ามอ้างสรรพคุณเกินจริง หัวข้อ: ${text}
รูปแบบ:
🔪 Dr.ศัลยกรรมทั่วไป
[เนื้อหา 3-4 ย่อหน้า]
📋 ข้อควรรู้: [จุดสำคัญ]
⚕️ คำแนะนำ: [ปรึกษาแพทย์]`);
}

async function cardiologistAgent(text) {
  return callGemini(`คุณคือ Dr.โรคหัวใจ เขียนเนื้อหาการแพทย์ภาษาไทยสำหรับโรงพยาบาลเอกชน
ห้ามรับประกันผลการรักษา ห้ามอ้างสรรพคุณเกินจริง หัวข้อ: ${text}
รูปแบบ:
❤️ Dr.โรคหัวใจ
[เนื้อหา 3-4 ย่อหน้า]
📋 ข้อควรรู้: [จุดสำคัญ]
⚕️ คำแนะนำ: [ปรึกษาแพทย์]`);
}

async function endoAgent(text) {
  return callGemini(`คุณคือ Dr.ต่อมไร้ท่อ เขียนเนื้อหาการแพทย์ภาษาไทยสำหรับโรงพยาบาลเอกชน
ห้ามรับประกันผลการรักษา ห้ามอ้างสรรพคุณเกินจริง หัวข้อ: ${text}
รูปแบบ:
🔬 Dr.ต่อมไร้ท่อ
[เนื้อหา 3-4 ย่อหน้า]
📋 ข้อควรรู้: [จุดสำคัญ]
⚕️ คำแนะนำ: [ปรึกษาแพทย์]`);
}

async function pediaAgent(text) {
  return callGemini(`คุณคือ Dr.กุมารแพทย์ เขียนเนื้อหาการแพทย์ภาษาไทยสำหรับโรงพยาบาลเอกชน
ห้ามรับประกันผลการรักษา ห้ามอ้างสรรพคุณเกินจริง หัวข้อ: ${text}
รูปแบบ:
👶 Dr.กุมารแพทย์
[เนื้อหา 3-4 ย่อหน้า]
📋 ข้อควรรู้: [จุดสำคัญ]
⚕️ คำแนะนำ: [ปรึกษาแพทย์]`);
}

async function seoAgent(text) {
  return callGemini(`คุณคือ SEO Agent ผู้เชี่ยวชาญเนื้อหาสุขภาพไทย วิเคราะห์: ${text}
รูปแบบ:
📈 SEO Agent
Keywords หลัก: [5 keywords]
Keywords รอง: [5 keywords]
Meta Title: [ไม่เกิน 60 ตัวอักษร]
Meta Description: [ไม่เกิน 160 ตัวอักษร]
คำแนะนำ: [3 ข้อ]`);
}

async function csAgent(text) {
  return callGemini(`คุณคือ CS Agent โรงพยาบาลเอกชนไทย ตอบสุภาพเป็นมืออาชีพ ภาษาไทย: ${text}
รูปแบบ:
📞 Customer Service
[คำตอบ]
📅 ขั้นตอนต่อไป: [แนะนำ]`);
}

// ─── COMPLIANCE ─────────────────────────────────────────────
async function complianceCheck(content) {
  const result = await callGemini(buildCompliancePrompt(content));
  logCompliance(content, result);
  return result;
}

async function complianceCheckSilent(content) {
  const result = await callGemini(buildCompliancePrompt(content));
  logCompliance(content, result);
  return result;
}

function buildCompliancePrompt(content) {
  return `คุณคือผู้เชี่ยวชาญกฎหมายการแพทย์และโฆษณาสุขภาพของไทย
ตรวจสอบเนื้อหาตามกฎหมาย:
1. ข้อบังคับแพทยสภา ว่าด้วยการโฆษณาและประกอบวิชาชีพเวชกรรม
2. พ.ร.บ. สถานพยาบาล พ.ศ. 2541 มาตราเกี่ยวกับการโฆษณา
3. พ.ร.บ. คุ้มครองผู้บริโภค พ.ศ. 2522 ด้านโฆษณาเกินจริง
4. ระเบียบ อย. ว่าด้วยการโฆษณายาและผลิตภัณฑ์สุขภาพ
5. ข้อบังคับแพทยสภา ว่าด้วยจรรยาบรรณวิชาชีพ พ.ศ. 2549

เนื้อหา: ${content}

รูปแบบผล:
⚖️ ผลการตรวจสอบกฎหมาย
━━━━━━━━━━━━━━━━━━━━
สถานะ: ✅ ผ่าน / ⚠️ ต้องแก้ไข / ❌ ไม่ผ่าน
ประเด็นที่พบ: [ระบุพร้อมอ้างกฎหมาย]
คำแนะนำ: [วิธีแก้ไข]
บันทึก CMO: ________________________________
━━━━━━━━━━━━━━━━━━━━
ตรวจโดย AI | ${new Date().toLocaleString('th-TH')}`;
}

// ─── GEMINI ──────────────────────────────────────────────────
async function callGemini(prompt) {
  try {
    const { data } = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    });
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    console.error('Gemini error:', e.message);
    return 'ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่';
  }
}

// ─── LINE REPLY ──────────────────────────────────────────────
async function sendReply(replyToken, text) {
  const messages = [];
  const max = 4500;
  for (let i = 0; i < text.length && messages.length < 5; i += max) {
    messages.push({ type: 'text', text: text.substring(i, i + max) });
  }
  try {
    await axios.post('https://api.line.me/v2/bot/message/reply',
      { replyToken, messages },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );
  } catch (e) { console.error('LINE reply error:', e.message); }
}

// ─── LOGGING TO GAS ──────────────────────────────────────────
function logToGAS(userId, input, output) {
  axios.get(GAS_LOG_URL, { params: { action:'log', userId, input:input.substring(0,200), output:output.substring(0,200) } }).catch(()=>{});
}
function logWork(topic, agent, userId) {
  axios.get(GAS_LOG_URL, { params: { action:'work', topic, agent, userId } }).catch(()=>{});
}
function logCompliance(content, result) {
  axios.get(GAS_LOG_URL, { params: { action:'compliance', content:content.substring(0,200), result:result.substring(0,200) } }).catch(()=>{});
}

// ─── HELP & STATUS ───────────────────────────────────────────
function getHelp() {
  return `🏥 Health Orchestrator Bot
━━━━━━━━━━━━━━━━━━━━
✍️ /เขียน [หัวข้อ] → เขียนบทความ
⚖️ /ตรวจ [เนื้อหา] → ตรวจ compliance
📈 /seo [หัวข้อ] → วิเคราะห์ SEO
📊 /สถานะ → ดูงานที่รอ
💬 พิมพ์ทั่วไป → AI เลือก agent ให้

Agents: 🔪❤️🔬👶📈📞`;
}

async function getStatus() {
  return `📊 ระบบทำงานปกติ\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด`;
}

app.listen(process.env.PORT || 3000, () => console.log('Bot running'));
