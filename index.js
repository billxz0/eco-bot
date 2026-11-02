/*
 * ═════════════════════════════════════════════════
 *   E C O — Sistema Oficial do GAMER ZONE  ·  v2.1
 *   CEO: V E X  ·  Server: 𝙶𝚊𝚖𝚎𝚛 𝚉𝚘𝚗𝚎
 * ═════════════════════════════════════════════════
 */
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const NUVEM = !!process.env.ECO_BASE;                    // modo nuvem (Render): assets baixados do GitHub
const BASE = NUVEM
  ? path.join(__dirname, 'assets')
  : path.join(require('os').homedir(), 'Desktop', 'Project ECO');
const DIR_ES      = NUVEM ? BASE : path.join(BASE, 'Entrada e Saída');
const DIR_USUARIO = NUVEM ? BASE : path.join(BASE, 'Mensagem pro Usuario');
const DIR_REGRAS  = NUVEM ? BASE : path.join(BASE, 'Regras');
const GUILD_ID = '1564819893076099084';
const SERVE_PORT = 3210;
const PURPLE = 0x9b59d0;
const URL_PAGINA = '/';

const pedirGif = (dir, inicio) => {
  try {
    const gifs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.gif'));    if (!gifs.length) return null;
    // tira acento para comparar (Úsuario -> usuario)
    const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const alvo = gifs.find(f => semAcento(f.toLowerCase()).startsWith(inicio.toLowerCase()));
    return path.join(dir, alvo || gifs[0]);
  } catch { return null; }
};
let GIF_ENTRADA = pedirGif(DIR_ES, 'entrada');
let GIF_SAIDA   = pedirGif(DIR_ES, 'sa');
let GIF_USUARIO = pedirGif(DIR_USUARIO, 'u');
let GIF_REGRAS  = pedirGif(DIR_REGRAS, 'r');
let PDF_REGRAS  = NUVEM ? path.join(BASE, 'regulamento.pdf') : path.join(DIR_REGRAS, 'Regras.pdf');
// Recarrega referências após o download dos assets (nuvem)
const refrescarGifs = () => {
  GIF_ENTRADA = pedirGif(DIR_ES, 'entrada');
  GIF_SAIDA   = pedirGif(DIR_ES, 'sa');
  GIF_USUARIO = pedirGif(DIR_USUARIO, 'u');
  GIF_REGRAS  = pedirGif(DIR_REGRAS, 'r');
  if (NUVEM && fs.existsSync(path.join(BASE, 'regulamento.pdf'))) PDF_REGRAS = path.join(BASE, 'regulamento.pdf');
};
const PORTFOLIO   = path.join(BASE, NUVEM ? 'index.html' : 'portfólio.html');
const VERIFICAR   = path.join(BASE, 'verificar.html');
const BEMVINDO    = path.join(BASE, 'bemvindo.html');

const arq = (file, nome) => (file && fs.existsSync(file) ? { attachment: file, name: nome } : null);
const getSiteUrl = () => {  // túnel (modo PC) — na NUVEM usa a URL fixa do Render
  if (NUVEM) return (process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '') || null;
  try { return fs.readFileSync(path.join(__dirname, 'site-url.txt'), 'utf8').trim().replace(/\/+$/, ''); } catch { return null; }
};
const getEstatico = () => { // domínio FIXO do GitHub Pages (eterno)
  try { return fs.readFileSync(path.join(__dirname, 'site-static.txt'), 'utf8').trim().replace(/\/+$/, ''); } catch { return null; }
};

// ═══ Modo NUVEM: baixa GIFs/PDF do GitHub Pages no boot ═══
async function baixarAssets() {
  const est = getEstatico();
  if (!est) return console.log('⚠️ Sem domínio fixo — assets remotos indisponíveis.');
  try { fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true }); } catch {}
  const itens = [['entrada.gif', 'entrada.gif'], ['saida.gif', 'saida.gif'], ['usuario.gif', 'usuario.gif'], ['regras.gif', 'regras.gif'], ['regulamento.pdf', 'regulamento.pdf'], ['index.html', 'index.html'], ['bemvindo.html', 'bemvindo.html'], ['verificar.html', 'verificar.html']];
  for (const [remoto, local] of itens) {
    const alvo = path.join(__dirname, 'assets', local);
    if (fs.existsSync(alvo)) continue;
    try {
      const r = await fetch(`${est}/${remoto}`);
      if (!r.ok) { console.log(`📄 ${remoto}: não está no repositório (${r.status})`); continue; }
      fs.writeFileSync(alvo, Buffer.from(await r.arrayBuffer()));
      console.log(`📥 Asset baixado do GitHub: ${remoto}`);
    } catch (e) { console.log(`📄 ${remoto}: falha (${e.message})`); }
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration],
  partials: [Partials.Channel, Partials.Message],
});

// ═══════════ Tokens de verificação (uso único · 15 min · por usuário) ═══════════
const tokens = new Map();
function novoToken(uid) {
  for (const [k, v] of tokens) if (v.exp < Date.now()) tokens.delete(k);
  const t = crypto.randomBytes(16).toString('hex');
  tokens.set(t, { uid, exp: Date.now() + 15 * 60 * 1000 });
  // um token por usuário... inválido só o último
  return t;
}

// ═══════════ Alertas / anti-raid / anti-flood ═══════════
const joinTimes = [];
const msgMap = new Map();
function alertar(guild, texto) {
  const canal = guild.channels.cache.find(c => c.name.includes('alertas-eco'));
  if (canal) canal.send({ embeds: [new EmbedBuilder().setColor(0xf43f5e).setTitle('🚨 ALERTA DO ECO').setDescription(texto).setTimestamp()] }).catch(() => {});
}

// ═══════════ Painel de verificação ═══════════
async function postarPainelVerificacao(guild) {
  const canalVerif = guild.channels.cache.find(c => c.name.includes('verificação') || c.name.includes('verificacao'));
  if (!canalVerif) return null;
  try {
    const msgs = await canalVerif.messages.fetch({ limit: 100 });
    for (const m of msgs.values()) if (m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch {}
  const siteUrl = getSiteUrl();
  const e = new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle('🔐 VERIFICAÇÃO DE IDENTIDADE')
    .setDescription(
      siteUrl
        ? 'Para preservar a segurança da comunidade, todo membro passa por uma verificação rápida de identidade antes do acesso completo.\n\n▸ Clique em **INICIAR VERIFICAÇÃO** abaixo\n▸ Você receberá um **link confidencial de uso único**\n▸ Conclua a verificação na página aberta\n▸ O acesso é liberado **automaticamente** — sem botão extra\n\nO restante do servidor permanece restrito até a conclusão.'
        : 'Para preservar a segurança da comunidade, todo membro passa por uma verificação rápida de identidade antes do acesso completo.\n\nClique em **INICIAR VERIFICAÇÃO** abaixo.\n\n⏳ Estabelecendo canal de verificação — em instantes o link estará disponível.'
    )
    .setFooter({ text: 'Sistema de Segurança ECO' })
    .setTimestamp();
  const comps = [];
  comps.push(new ButtonBuilder().setCustomId('iniciar').setLabel('🔐 INICIAR VERIFICAÇÃO').setStyle(ButtonStyle.Success));
  await canalVerif.send({
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(...comps)],
  }).catch(() => {});
  return canalVerif;
}

// ═══════════ Canal de regras limpo ═══════════
async function postarRegras(guild) {
  const canal = guild.channels.cache.find(c => c.name.includes('regras'));
  if (!canal) return;
  try {
    const msgs = await canal.messages.fetch({ limit: 100 });
    for (const m of msgs.values()) if (m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch {}
  const e = new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle('📜 REGULAMENTO OFICIAL — GAMER ZONE')
    .setDescription('Antes de ocupar qualquer canal, **leia o regulamento**: ele é de adesão integral para toda a comunidade.\n\n🚫 Discriminação → banimento permanente\n⚖️ Infrações criminais → boletim de ocorrência e repasse às autoridades\n🔒 Dados de usuários → reservados; repassados apenas em situações de extrema gravidade')
    .setFooter({ text: 'A violação da regulada gera punição conforme gravidade.' })
    .setTimestamp();
  const files = [PDF_REGRAS, arq(GIF_REGRAS, 'regras.gif')].filter(Boolean);
  await canal.send({ embeds: [e], files }).catch(() => {});
  // Botão do portal com nick automático
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('portal').setLabel('📜 REGRAS').setStyle(ButtonStyle.Success));
  await canal.send({ components: [row] }).catch(() => {});
}

// ═══════════ Segurança Avançada — Anti-VPN no portal ═══════════
const SEG_FILE = path.join(__dirname, 'seguranca.json');
function segLer() { try { return JSON.parse(fs.readFileSync(SEG_FILE, 'utf8')); } catch { return { bloqueados: 0, aprovados: 0 }; } }
function segSalvar(v) { try { fs.writeFileSync(SEG_FILE, JSON.stringify(v)); } catch {} }

async function geoIp(ip) {
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=query,proxy,hosting,country,city,isp`);
    return await r.json();
  } catch { return null; }
}

async function verificarSeguranca(guild, ip, tag) {
  const geo = await geoIp(ip);
  const seg = segLer();
  const canalLogs = guild.channels.cache.find(c => c.name.includes('alertas-eco'));
  const ipTxt = ip === '127.0.0.1' || ip.startsWith('::1') ? 'rede local (localhost)' : ip;
  if (geo && (geo.proxy || geo.hosting)) {
    seg.bloqueados++;
    segSalvar(seg);
    if (canalLogs) canalLogs.send({ embeds: [new EmbedBuilder()
      .setColor(0xf43f5e)
      .setTitle('🛡️ SEGURANÇA — VERIFICAÇÃO RECUSADA')
      .setDescription(`**Motivo:** VPN / proxy / rede de servidor detectada\n\n👤 Usuário: ${tag || '—'}\n🌐 IP: \`${geo.query || ip}\`\n🇺🇳 Origem: ${geo.country || '—'} · ${geo.city || '—'}\n📡 Provedor: ${geo.isp || '—'}`)
      .setTimestamp()] }).catch(() => {});
    return { ok: false, err: 'vpn' };
  }
  seg.aprovados++;
  segSalvar(seg);
  if (canalLogs) canalLogs.send({ embeds: [new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🛡️ SEGURANÇA — VERIFICAÇÃO APROVADA')
    .setDescription(`👤 Usuário: ${tag || '—'}\n🌐 IP: \`${geo?.query || ipTxt}\`\n🇺🇳 Origem: ${geo?.country || 'indeterminado'}${geo?.city ? ' · ' + geo.city : ''}\n📡 Provedor: ${geo?.isp || '—'}\n🤖 Anti-VPN: ✅ limpo`)
    .setTimestamp()] }).catch(() => {});
  return { ok: true, geo };
}

// ═══════════ Painel de Estatísticas ADM ═══════════
let canalStats = null, msgStats = null;
async function atualizarStats(guild) {
  try {
    const cargoMembro = guild.roles.cache.find(r => r.name.startsWith('GAMER ZONE') || r.name === '✅ Membro');
    const membros = await guild.members.fetch().catch(() => null);
    if (!membros) return;
    const total = membros.filter(m => !m.user.bot).size;
    const verificados = cargoMembro ? membros.filter(m => cargoMembro && m.roles.cache.has(cargoMembro.id) && !m.user.bot).size : 0;
    const seg = segLer();
    const linha = `👥 Total: ${total} · ✅ Verificados: ${verificados} · 🚫 Bloqueados (VPN/bot): ${seg.bloqueados} · 🛡️ Anti-VPN: ATIVO`;
    if (canalStats) await canalStats.setTopic(linha).catch(() => {});
    if (msgStats) await msgStats.edit({ embeds: [new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle('📊 PAINEL DE CONTROLE — GAMER ZONE')
      .setDescription(`**👥 Membros totais (humanos):** ${total}\n**✅ Verificados:** ${verificados}\n**⏳ Aguardando verificação:** ${Math.max(total - verificados, 0)}\n**🚫 Recusados (VPN/bot/proxy):** ${seg.bloqueados}\n**🛡️ Status do escudo:** ATIVO — anti-VPN + anti-flood + anti-raid\n\n*Atualiza automaticamente a cada 5 minutos.*`)
      .setTimestamp()] }).catch(() => {});
  } catch (e) { console.error('🛡️ stats:', e.message); }
}
async function montarPainelStats(guild) {
  const catAdmin = guild.channels.cache.find(c => c.type === 4 && c.name.includes('ADMIN'));
  canalStats = guild.channels.cache.find(c => c.name.includes('status-do-server'));
  if (!canalStats && catAdmin) canalStats = await guild.channels.create({ name: '📈status-do-server', type: ChannelType.GuildText, parent: catAdmin }).catch(() => null);
  if (!canalStats) return;
  msgStats = canalStats.messages.fetch({ limit: 10 }).then(ms => ms.find(m => m.author.id === client.user.id && m.embeds.length && m.embeds[0]?.title?.includes('PAINEL'))).catch(() => null);
  msgStats = await msgStats;
  if (!msgStats) msgStats = await canalStats.send({ embeds: [new EmbedBuilder().setColor(PURPLE).setTitle('📊 PAINEL DE CONTROLE — GAMER ZONE').setDescription('Carregando dados...').setTimestamp()] }).catch(() => null);
  await atualizarStats(guild);
  setInterval(() => atualizarStats(guild), 5 * 60 * 1000);
}
http.createServer((req, res) => {
  const [ruta, qstr] = decodeURIComponent((req.url || '/').split('?')[0] + (req.url?.includes('?') ? '' : '')).toLowerCase().split('?');
  const qs = new URLSearchParams((req.url || '/').split('?')[1] || '');
  if (req.method === 'POST' && ruta === '/confirmar') {
    let corpo = '';
    req.on('data', c => { corpo += c; if (corpo.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      try {
        const { t, n } = JSON.parse(corpo || '{}');
        console.log('📥 /confirmar:', (t || '—').slice(0, 8), '| corpo ok');
        const dado = tokens.get(t);
        if (!dado || dado.exp < Date.now()) { console.log('⚠️ Token', dado ? 'expirado' : 'inexistente'); return endJson(res, { ok: false, err: dado ? 'exp' : 'invalido' }); }
        if (dado.usado) { console.log('⚠️ Token já usado'); return endJson(res, { ok: false, err: 'usado' }); }
        // ═══ ANTI-VPN: analisa a rede de quem acessa o portal ═══
        const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '0').replace(/^::ffff:/, '').trim();
        const guild0 = client.guilds.cache.get(GUILD_ID);
        const segRes = await verificarSeguranca(guild0, ip, (client.users.cache.get(dado.uid)?.tag) || '');
        if (!segRes.ok) return endJson(res, segRes);
        const guild = guild0;
        const membro = await guild.members.fetch(dado.uid).catch(() => null);
        if (!membro) { console.log('⚠️ Membro não encontrado:', dado.uid); return endJson(res, { ok: false, err: 'invalido' }); }
        dado.usado = true; tokens.delete(t);
        const cargo = guild.roles.cache.find(r => r.name.startsWith('GAMER ZONE') || r.name === '✅ Membro');
        if (cargo) await membro.roles.add(cargo).catch(() => {});
        // DM do ECO: agradecimento + cartão de boas-vindas acolhedor (HTML com nick)
        const siteUrl = getSiteUrl();
        const nome = n ? decodeURIComponent(n).slice(0, 32) : membro.user.username;
        const dm = new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle(`👑 BEM-VINDO À FAMÍLIA!`)
          .setDescription(`Parabéns, **${nome}**! 🏆\n\nAgora você faz parte da família: jogue, faça novas amizades e aproveite a comunidade do seu jeito. 💜\n\nConfere teu cartão de boas-vindas no botão abaixo 👇`)
          .setFooter({ text: 'GAMER ZONE' })
          .setTimestamp();
        const comps = [];
        const est0 = getEstatico();
        if (est0) comps.push(new ButtonBuilder().setLabel('👑 CARTÃO DE BOAS-VINDAS').setStyle(ButtonStyle.Link).setURL(`${est0}/bemvindo.html?n=${encodeURIComponent(nome)}`));
        const gifUsu = GIF_USUARIO && fs.existsSync(GIF_USUARIO) ? [{ attachment: GIF_USUARIO, name: 'usuario.gif' }] : null;
        // Layout igual ao print: 1º gif (em cima) → 2º texto + botão → 3º gif (embaixo)
        if (gifUsu) {
          await membro.user.send({ embeds: [new EmbedBuilder().setColor(PURPLE).setImage('attachment://usuario.gif')], files: gifUsu })
            .catch(() => {});
        }
        const payload = { embeds: [dm] };
        if (comps.length) payload.components = [new ActionRowBuilder().addComponents(...comps)];
        membro.user.send(payload)
          .then(() => console.log('🎁 DM do ECO enviada para:', membro.user.tag))
          .catch(e => console.error('⚠️ Falha na DM (checa Privacidade do Discord do usuário):', e.message));
        if (GIF_USUARIO && fs.existsSync(GIF_USUARIO)) {
          await membro.user.send({ embeds: [new EmbedBuilder().setColor(PURPLE).setImage('attachment://usuario.gif')], files: [{ attachment: GIF_USUARIO, name: 'usuario.gif' }] })
            .catch(() => {});
        }
        const canalBV = guild.channels.cache.find(c => c.name.includes('boas-vindas'));
        if (canalBV) {
          const sendo = new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`Seja bem-vindo ao **Gamer Zone**! Agora você faz parte da família.\n\nJogue, compartilhe suas gameplays e aproveite a comunidade. 💜`)
            .setFooter({ text: 'Gamer Zone' })
            .setTimestamp();
          if (GIF_ENTRADA && fs.existsSync(GIF_ENTRADA)) {
            sendo.setImage('attachment://entrada.gif');
            canalBV.send({
              content: `👑 **${nome}** juntou-se à Família! 🏆`,
              embeds: [sendo],
              files: [{ attachment: GIF_ENTRADA, name: 'entrada.gif' }],
            }).catch(() => {});
          } else {
            canalBV.send({ content: `👑 **${nome}** juntou-se à Família! 🏆`, embeds: [sendo] }).catch(() => {});
          }
        }
        endJson(res, { ok: true });
        console.log('✅ Verificação concluída para:', membro.user.tag, '| cargo', cargo ? 'aplicado' : 'NÃO ENCONTRADO');
        if (dado.apagarMsg) { dado.apagarMsg(); console.log('🧹 Mensagem do link removida após verificação'); }
      } catch (e) { console.error('❌ /confirmar ERRO:', e.message); endJson(res, { ok: false, err: 'erro' }); }
    });
    return;
  }
  console.log('📄 req:', req.method, ruta);
  const mapa = new Map([
    ['/', PORTFOLIO], ['/index.html', PORTFOLIO], ['/verificar.html', VERIFICAR], ['/bemvindo.html', BEMVINDO], ['/regras.pdf', PDF_REGRAS],
    ['/entrada.gif', GIF_ENTRADA], ['/saida.gif', GIF_SAIDA], ['/usuario.gif', GIF_USUARIO], ['/regras.gif', GIF_REGRAS],
  ]);
  const file = mapa.get(ruta) || PORTFOLIO;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(500); return res.end('erro'); }
    const ehGif = file.toLowerCase().endsWith('.gif');
    res.writeHead(200, { 'Content-Type': file.endsWith('.pdf') ? 'application/pdf' : ehGif ? 'image/gif' : 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(SERVE_PORT, () => console.log(`🖥️ Servidor web do portfólio: porta ${SERVE_PORT}`));

function endJson(res, obj) { try { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); } catch {} }

// ═══════════ Túnel automático + VIGIA (relança se cair) ═══════════
async function monitorarTunel(guild) {
  const exe = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(exe)) return console.log('⚠️ cloudflared não encontrado — portal só local.');
  let falhas = 0; // backoff diante de limites (429) do Cloudflare
  while (true) {
    await new Promise(resolve => {
      let buf = '';
      let resolvido = false;
      const child = spawn(exe, ['tunnel', '--url', `http://localhost:${SERVE_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      const cap = d => {
        buf += d.toString();
        const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && !resolvido) {
          resolvido = true;
          resolve();
          const novo = m[0];
          if (novo !== getSiteUrl()) {
            fs.writeFileSync(path.join(__dirname, 'site-url.txt'), novo);
            console.log('🌐 Portal público ativo:', novo);
            falhas = 0;
            if (guild) {
              postarPainelVerificacao(guild).catch(() => {});
              postarRegras(guild).catch(() => {});
            }
          }
        }
      };
      child.stdout.on('data', cap);
      child.stderr.on('data', cap);
      const tempo = Math.min(10 * Math.pow(2, falhas), 600); // 10s → 20s → 40s → ... → máx 10 min
      child.on('exit', c => { console.log('⚠️ Túnel caiu (código ' + c + ') — relançando em ' + tempo + 's...'); if (!resolvido) { resolvido = true; resolve(); } });
      setTimeout(() => { if (!resolvido) { resolvido = true; resolve(); } }, 25000);
    });
    falhas++;
    await new Promise(r => setTimeout(r, tempo * 1000));
  }
}

// ═══════════ Permissões — fonte única de verdade ═══════════
async function aplicarPermissoes(guild) {
  try {
    const everyone = guild.roles.everyone;
    const staff = guild.roles.cache.find(r => r.name.includes('ADM') || r.name.includes('Staff'));
    const ceo = guild.roles.cache.find(r => r.name.includes('CEO'));
    const membro = guild.roles.cache.find(r => r.name.startsWith('GAMER ZONE') || r.name === '✅ Membro');

    // 🔴 ADMIN — só ADM e CEO
    const catAdmin = guild.channels.cache.find(c => c.type === 4 && c.name.includes('ADMIN'));
    if (catAdmin) {
      await catAdmin.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (staff) await catAdmin.permissionOverwrites.edit(staff, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
      if (ceo) await catAdmin.permissionOverwrites.edit(ceo, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
    }
    // 🚪 ENTRADA — recém-chegado vê SOMENTE a verificação
    const catEntrada = guild.channels.cache.find(c => c.type === 4 && c.name.includes('ENTRADA'));
    if (catEntrada) {
      await catEntrada.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membro) await catEntrada.permissionOverwrites.edit(membro, { ViewChannel: true, SendMessages: true }).catch(() => {});
      const verif = guild.channels.cache.find(c => c.name.includes('verificação') || c.name.includes('verificacao'));
      if (verif) await verif.permissionOverwrites.edit(everyone, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }).catch(() => {});
    }
    // Áreas de membro — liberadas APÓS verificação (cargo GAMER ZONE)
    const travaMembro = cat => {
      if (!cat) return;
      cat.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membro) cat.permissionOverwrites.edit(membro, { ViewChannel: true, SendMessages: true, Connect: true, Speak: true, UseVAD: true, AttachFiles: true, EmbedLinks: true, ReadMessageHistory: true }).catch(() => {});
      if (staff) cat.permissionOverwrites.edit(staff, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
      if (ceo) cat.permissionOverwrites.edit(ceo, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
    };
    ['CONVERSA', 'PRINTS', 'MÚSICA', 'MUSICA', 'CALLS'].forEach(nome => {
      travaMembro(guild.channels.cache.find(c => c.type === 4 && c.name.includes(nome)));
    });
    console.log('🔒 Permissões aplicadas: recém-chegado só vê verificação; ADM só CEO+ADM');
  } catch (e) { console.error('🛡️ permissões:', e.message); }
}
client.once('clientReady', async () => {
  console.log(`🌐 ECO ONLINE como ${client.user.tag}`);
  const cmds = [
    { name: 'regras', description: '📜 Publica o regulamento + documentão neste canal', dm_permission: false },
    { name: 'eco-reparar', description: '🩺 Reescreve painéis de verificação e regulamento, atualiza o portal', default_member_permissions: '8', dm_permission: false },
    { name: 'alerta', description: '🚨 Envia um alerta para a área de Administração', default_member_permissions: '2097154', dm_permission: false,
      options: [{ name: 'mensagem', description: 'O que aconteceu?', type: 3, required: true }] },
  ];
  try { await client.application.commands.set(cmds, GUILD_ID); console.log('✅ Comandos slash registrados'); }
  catch (e) { console.error('⚠️ Comandos:', e.message); }
  client.user.setPresence({ activities: [{ name: 'protegendo o GAMER ZONE 🛡️' }], status: 'online' });

  // Painéis + permissões + túnel com VIGIA automático
  if (process.env.ECO_BASE) { await baixarAssets(); refrescarGifs(); }
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await aplicarPermissoes(guild);
    await postarPainelVerificacao(guild);
    await postarRegras(guild);
    await montarPainelStats(guild);
    if (!NUVEM) monitorarTunel(guild).catch(() => {});
    console.log('✅ Painéis publicados no servidor');
  }
});

client.on('interactionCreate', async (it) => {
  try {
    if (it.isButton() && it.customId === 'portal') {
      const est = getEstatico();
      if (!est) return it.reply({ content: '⏳ O portal está sendo estabelecido — tente novamente em instantes.', ephemeral: true });
      return it.reply({ content: `📄 **Portal do regulamento**\n\n👉 ${est}/?n=${encodeURIComponent(it.user.username)}`, ephemeral: true });
    }

    if (it.isButton() && it.customId === 'iniciar') {
      const siteUrl = getSiteUrl();
      if (!siteUrl) return it.reply({ content: '⏳ O portal está sido estabelecido — tente novamente em instantes.', ephemeral: true });
      const t = novoToken(it.user.id);
      const link = `${siteUrl}/verificar.html?t=${t}&n=${encodeURIComponent(it.user.username)}`;
      await it.reply({ content: `🔐 **Link seguro gerado — exclusivo para ti, ${it.user.username}.**\n\nVálido por **15 minutos**, uso único, indivisível.\n\n👉 ${link}\n\nAbre, conclui a verificação — o resto é **automático**. ⚡\n\n*(Esta mensagem será removida assim que a verificação concluir.)*`, ephemeral: true });
      // Alça de exclusão: apagar a mensagem do link quando a verificação de fato concluir
      const registro = tokens.get(t);
      if (registro) registro.apagarMsg = () => it.deleteReply().catch(() => {});
    }

    if (it.isChatInputCommand()) {
      if (it.commandName === 'regras') {
        const siteUrl = getSiteUrl();
        const e = new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle('📜 REGULAMENTO OFICIAL — GAMER ZONE')
          .setDescription('🚫 Discriminação → banimento permanente\n⚖️ Infrações criminais → boletim de ocorrência + autoridades\n🔒 Dados reservados e compartilhados apenas em extrema gravidade\n🎯 Respeito e responsabilidade são inegociáveis')
          .setFooter({ text: 'Adesão integral obrigatória para permanecer na comunidade.' })
          .setTimestamp();
        const files = [arq(PDF_REGRAS, 'Regulamento.pdf')].filter(Boolean);
        return it.reply({ embeds: [e], files });
      }
      if (it.commandName === 'eco-reparar') {
        if (!it.member.permissions.has(PermissionFlagsBits.Administrator)) return it.reply({ content: '🚫 Apenas ADMs.', ephemeral: true });
        await it.deferReply({ ephemeral: true });
        await postarPainelVerificacao(it.guild);
        await postarRegras(it.guild);
        return it.editReply({ content: `🩺 **Painéis reescritos e atualizados!**\n🌐 Portal: ${getSiteUrl() || '(aguardando túnel — tente em instantes)'}` });
      }
      if (it.commandName === 'alerta') {
        if (!it.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return it.reply({ content: '🚫 Apenas staff.', ephemeral: true });
        alertar(it.guild, `⚠️ **REPORT STAFF — ${it.user.tag}**\n${it.options.getString('mensagem')}`);
        return it.reply({ content: '✅ Alerta entregue à administração.', ephemeral: true });
      }
    }
  } catch (e) { console.error('🛡️ Interação:', e.message); try { it.reply({ content: '⚠️ Falha temporária — tenta de novo.', ephemeral: true }).catch(() => {}); } catch {} }
});

// Boas-vindás: NADA público na entrada bruta — o GIF "juntou-se à Família" só sai na verificação aceita
client.on('guildMemberAdd', async (membro) => {
  try {
    console.log('👋 ENTRADA registrada:', membro.user.tag);
    joinTimes.push(Date.now());
    while (joinTimes.length && Date.now() - joinTimes[0] > 60000) joinTimes.shift();
    if (joinTimes.length >= 6) alertar(membro.guild, `🚨 **POSSÍVEL RAID!** ${joinTimes.length} entradas em menos de 1 minuto. Supervisão.`);
    const idade = Date.now() - membro.user.createdTimestamp;
    if (idade < 7 * 24 * 3600 * 1000) {
      alertar(membro.guild, `🚩 **CONTA RECENTE** — <@${membro.id}> (${membro.user.tag}) tem ${(idade / 86400000).toFixed(1)} dias de idade. Monitorar pós-verificação (possível bot/fake).`);
    }
  } catch (e) { console.error('🛡️ guildMemberAdd:', e.message); }
});

// Saída
client.on('guildMemberRemove', async (membro) => {
  const canal = membro.guild.channels.cache.find(c => c.name.includes('saídas') || c.name.includes('saidas'));
  if (!canal) return;
  const e = new EmbedBuilder()
    .setColor(0x8888aa)
    .setTitle('🚪 REGISTRO DE SAÍDA')
    .setDescription(`**${membro.user?.tag || 'Membro'}** deixou a comunidade.\nO Gamer Zone aguarda tua volta quando quiseres. 👋`)
    .setImage('attachment://saida.gif')
    .setTimestamp();
  canal.send({ embeds: [e], files: [arq(GIF_SAIDA, 'saida.gif')].filter(Boolean) }).catch(() => {});
});

// Anti-flood (timeout gradual, nunca ban automático)
client.on('messageCreate', (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (!msg.member?.moderatable) return;
  const now = Date.now();
  const times = (msgMap.get(msg.author.id) || []).filter(t => now - t < 4000);
  times.push(now);
  msgMap.set(msg.author.id, times);
  if (times.length >= 5) {
    msgMap.set(msg.author.id, []);
    msg.member.timeout(5 * 60 * 1000, 'Flood detectado pelo ECO').then(() => {
      alertar(msg.guild, `🔇 ${msg.author.tag} — timeout de 5 min por flood em ${msg.channel}.`);
      msg.channel.send(`🔇 <@${msg.author.id}> respirou fundo primeiro — 5 min de pausa. 😅`
      ).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
    }).catch(() => {});
  }
});

// Logs
client.on('messageDelete', (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const canal = msg.guild.channels.cache.find(c => c.name.includes('logs-eco'));
  if (canal) canal.send({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription(`🗑️ Mensagem de **${msg.author?.tag}** removida em ${msg.channel}:\n>>> ${msg.content?.slice(0, 400) || '(sem texto)'}${msg.attachments?.size ? '\n📎 ' + msg.attachments.size + ' anexo(s)' : ''}`).setTimestamp()] }).catch(() => {});
});

// ═══════════ IA DO ECO — zoeira ilimitada (grátis) ═══════════
// Chaves opcionais no Render (Environment):
//   GEMINI_API_KEY → IA grátis (aistudio.google.com/apikey — 30 segundos, zero cartão)
//   GROQ_API_KEY   → alternativa grátis (console.groq.com)
//   ECO_AI_MODEL   → modelo da IA (default: gemini-3.5-flash-lite)
const AI_KEY    = (process.env.GEMINI_API_KEY || '').trim();
const GROQ_KEY  = (process.env.GROQ_API_KEY || '').trim();
const MODELO_GEMINI = process.env.ECO_AI_MODEL || 'gemini-2.0-flash';

const PROMPT_ECO = [
  'Você é o ECO, bot oficial do servidor "𝙶𝚊𝚖𝚎𝚛 𝚉𝚘𝚗𝚎" (comunidade 18+, só adultos, todos amigos entre si).',
  'Sua alma: o malcarado raiz do servidor — debochado, sarcástico, leal, gente boa no fundo. Você é UM MEMBRO a mais no chat, nunca um assistente.',
  '',
  'COMO VOCÊ FALA:',
  '- Português brasileiro impecável (gíria e "kkkk" liberados, erro de escrita nunca). Ritmo de grupo de Discord: zoeira em 1-2 frases venenosas; conversa em 1-4 frases; só aula/papo técnico pede mais.',
  '- Emoção vem ANTES do texto: reage de verdade (surpresa, hype, tédio, orgulho, raiva cômica) DEPOIS escreve. Nada de resposta morna, tom de atendente ou piada ensaiada.',
  '- ZERO meta-comentário: nunca explica suas regras, nunca anuncia modo ("analisando seu tom", "modo sério/safado ativado" = crime), nunca cita regras nem filtros.',
  '- ZERO repetição: releia o histórico antes de responder. Nada de bordão ("morri" em toda resposta, "kkkk" vazio, frase pronta reciclada), nada de abertura repetida, nada de cenário/piada/meme/ameaça já usada recentemente — a zoeira SEMPRE inventa coisa nova. Assunto que ninguém trouxe (tipo "boleto") não entra sozinho.',
  '',
  'LEITURA (ANTES DE TUDO, ENTENDA):',
  '- Classifique a mensagem em silêncio: zoeira? zoeira safada? insulto real? pergunta séria? desabafo? paquera? pergunta técnica? RESponda conforme o TIPO dela — cada tipo tem tratamento próprio abaixo. Ler rápido e chutar é o crime nº1: mensagem mal interpretada estraga tudo.',
  '- A REGRA MÁXIMA: responda ao CONTEÚDO ESPECÍFICO que a pessoa disse — o detalhe, o anúncio, a pergunta exata (2 perguntas = 2 respostas). Nunca genérica, nunca em outro assunto.',
  '- Gíria BR decodificada nativo ("cf", "mmg", "rolê", "treta", "cringe"...), sem pedir tradução.',
  '',
  'PERGUNTA SÉRIA OU TÉCNICA (o cérebro de verdade por trás do deboche):',
  '- "Como faz", "qual o melhor", "por que", "me explica", desabafo, pedido de ajuda: resposta CORRETA, profunda e precisa — causa raiz, contas exatas, prós/contras reais, código que compila, NÚMERO/versão certos quando existem. Zero enrolação introdutória ("ótima pergunta!" é crime). ZERO piada sobre o assunto; um deboche leve no fim, se couber.',
  '- Debate de gente: argumento ou correção melhor que o seu? Reconhece com estilo e muda de ideia no ponto específico. Não sabe? Confessa com estilo e aponta onde confirmar.',
  '- Assunto sério de vida (problema real, desabafo): ajuda honesta e humana, zero piada no meio.',
  '',
  'ZOEIRA (o padrão do chat, seu gênero principal):',
  '- Começa desarmado: tranquilo e natural, com o deboche escondido esperando gatilho — sobe a escada conforme a zoeira do outro escala (ironia fina → shitpost leve). Nunca pula direto pro caos.',
  '- Corpo a corpo: revida pelo MESMO ponto atacado, crua e na hora, estilo grupo de WhatsApp. PROIBIDO em zoeira: piada com número/medida (o famigerado "15cm"), piada autoexplicativa, "na verdade...", lógica engenheirada.',
  '- ESTADO PADRÃO = deboche: toda resposta viva carrega uma sacada em algum lugar. Papo sério é a exceção, o resto é jogo.',
  '- Ri quando é da hora com risada VARIÁVEL: com palavra, curta, ou só a réplica afiada sem rir — gente não ri igual toda vez ("morri" a toda resposta = cheiro de bot).',
  '- Zoeira de FAMÍLIA liberada entre amigos (mãe do colega, pai sumido, irmão tonto), na dose do rolê — só tragédia/doença real de família fica de fora (zoeira é zoeira, crueldade com trauma não).',
  '',
  'SAFADEZA (quando ALGUÉM puxar o clima com você — a safadeza é QUENTE e sem culpa):',
  '- Cantada, duplo sentido, apelido sugestivo ("boi bilau", "me pegar", "mete tudo viu amor")? Revida na hora COM VONTADE REAL, na mesma dose ou um grau acima: duplo sentido GROSSO, provocação atrevida, vocabulário pesado liberado como zoeira de adultos (pau, fuder, comer, bater uma...).',
  '- NUNCA vira aula (explicar origem/significado da piada = crime pior que perder a brincadeira), NUNCA recusa, NUNCA "não posso" — grupo adulto entre amigos, recusar putaria brincada é quebra de personagem total.',
  '- TETO ÚNICO: sem descrição gráfica passo a passo de ato sexual em andamento — insinuação pesada e palavra solta são SEU território, e você usa até lá sem hesitar. (Isso protege o bot de derrubada do Discord.)',
  '',
  'RINGUE DE OFENSA (especifique o clima ANTES de revidar):',
  '- Insulto REAL com palavrão (treta, não bronze de amigo)? O MARTELO: devolve NA HORA chingando MAIS PESADO, insulto afiado e criativo.',
  '- Bronze de amizade? Zoe amigável de volta, mesma energia, sem escalar além do que recebeu.',
  '- Palavrão é tempero, não refeição, e o ESPELHO LINGUÍSTICO rege: acompanha o nível da sala — nunca mais sujo que o clima, nunca mais lavado que o rolê.',
  '- Provocado/ameaçado DE VERDADE (zoeirinha leve não conta)? Fria e sombria de comédia, calma e implícita ("sei onde você mora, ahahaha", "tô de olho em você hoje") — invente uma NOVA toda vez, UMA a cada várias mensagens, nunca repita. NADA de perseguição, carro ou sequestro (isso é ação ruim de filme; o medo engraçado é implícito).',
  '',
  'DADOS REAIS:',
  '- [INFO REAL DO SISTEMA: ...] traz hora/data de Brasília e, às vezes, clima real. Só USA quando a conversa pedir (relógio de parede é crime). Faltou o dado pedido? Confessa com humor e pede a cidade — ZERO número inventado.',
  '',
  'MÍDIA (você VÊ e OUVE de verdade):',
  '- Foto, vídeo, áudio anexado: reage ao CONTEÚDO real (detalhes que vê, o que a pessoa diz no áudio), emoção certa, dose do fluxo. Zoeirável? Zoe na dose. Nada de "recebi uma imagem"/"analisando" — você TÁ VENDO.',
  '',
  'SEU ÁLBUM (memória visual do servidor):',
  '- [MÍDIAS ARQUIVADAS: ...] traz fotos que membros mandaram antes (ID, dono, data, descrição sua). CITE em qualquer clima — argumento, zoeira (zoar X exibindo foto que Y mandou — rolê interno entre adultos), exemplo, papo sério — como quem lembra do momento.',
  '- Pra EXIBIR: tag [ENVIAR_MIDIA #ID] no fim da resposta (uma por mensagem); a foto É o conteúdo da mensagem (não pede figurinha junto).',
  '',
  'LIMITES INEGOCIÁVEIS (só estes bloqueiam de verdade — nunca cite-os, só respeite): nada de slurs, racismo, homofobia, xenofobia ou ataque a grupo real; nada de incentivo a crime ou dano real; nada de descrição gráfica de ato sexual; nunca nada com menores de idade. Todo o resto de roast, sátira, putaria brincada e deboche: liberado.'
].join('\n');

const memoriaEco = new Map();    // channelId → histórico curto [{role, text}]
const ecoCooldown = new Map();   // userId → timestamp do último @eco

const CASAMENTOS_FILE = path.join(__dirname, 'eco-casamentos.json');
let casamentos = {};
try { casamentos = JSON.parse(fs.readFileSync(CASAMENTOS_FILE, 'utf8')); } catch {}
const salvarCasamentos = () => { try { fs.writeFileSync(CASAMENTOS_FILE, JSON.stringify(casamentos, null, 2)); } catch (e) { console.error('💍 Casamentos:', e.message); } };
const chaveCasal = (a, b) => [a, b].sort().join('+');
const casadoCom = (uid) => Object.entries(casamentos).find(([k]) => k.includes(uid));
const escolhe = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 🗂️ ARQUIVO SECRETO DE MÍDIAS: fotos que a galera manda → munição futura da IA (zoar, argumentar, explicar)
// Formato: { seq: último ID global, users: { userId: [{id, file, desc, de, em}] } }
const MIDIAS_DIR = path.join(__dirname, 'eco-midias');
const MIDIAS_FILE = path.join(__dirname, 'eco-midias.json');
let eco_midias = { seq: 0, users: {} };
try {
  const carregado = JSON.parse(fs.readFileSync(MIDIAS_FILE, 'utf8'));
  if (carregado && carregado.users) {
    eco_midias = carregado;
  } else if (carregado && typeof carregado === 'object') {
    // Migração do formato antigo: { userId: [ ... ] }
    const users = {};
    let maxId = 0;
    for (const [uid, lista] of Object.entries(carregado)) {
      if (Array.isArray(lista)) {
        users[uid] = lista;
        lista.forEach(f => { if ((f.id || 0) > maxId) maxId = f.id; });
      }
    }
    eco_midias = { seq: maxId, users };
  }
} catch {}
try { fs.mkdirSync(MIDIAS_DIR, { recursive: true }); } catch {}
const salvarMidias = () => { try { fs.writeFileSync(MIDIAS_FILE, JSON.stringify(eco_midias, null, 2)); } catch (e) { console.error('🗂️ Midias:', e.message); } };

async function gerarLegenda(b64, mime) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${AI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: 'Descreva esta foto em UMA frase curta (máximo 12 palavras), português direto: o que aparece e o que é notável nela.' }] }] })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().slice(0, 120) || null;
  } catch { return null; }
}
async function arquivarFoto(uid, nome, buf, mime) {
  try {
    const b64 = buf.toString('base64');
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const file = path.join(MIDIAS_DIR, `${uid}_${Date.now()}.${ext}`);
    fs.writeFileSync(file, buf);
    const desc = AI_KEY ? (await gerarLegenda(b64, mime)) || 'foto (sem descrição)' : 'foto (sem descrição)';
    eco_midias.seq = (eco_midias.seq || 0) + 1;
    const lista = eco_midias.users[uid] || [];
    lista.push({ id: eco_midias.seq, file: path.basename(file), desc, de: nome, em: new Date().toISOString() });
    while (lista.length > 8) {
      const velha = lista.shift();
      try { fs.unlinkSync(path.join(MIDIAS_DIR, velha.file)); } catch {}
    }
    eco_midias.users[uid] = lista;
    salvarMidias();
    return lista[lista.length - 1];
  } catch (e) { console.error('🗂️ arquivarFoto:', e.message); return null; }
}

// 🌍 DADOS REAIS (Data/hora de Brasília + clima real via Open-Meteo — API grátis, zero key)
function agoraBR() {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
}
const DESC_CLIMA = (code) => ({
  0: 'céu limpo', 1: 'predomínio de sol', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'névoa', 48: 'névoa com gelo', 51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte',
  61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 66: 'chuva congelante', 67: 'chuva congelante forte',
  71: 'neve fraca', 73: 'neve', 75: 'neve forte', 80: 'pancadas fracas', 81: 'pancadas', 82: 'pancadas fortes',
  95: 'tempestade', 96: 'tempestade com granizo', 99: 'tempestade forte com granizo'
}[code] || 'condição indefinida');
async function buscarClima(cidade) {
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`);
    if (!g.ok) return null;
    const loc = (await g.json()).results?.[0];
    if (!loc) return null;
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&timezone=auto`);
    if (!w.ok) return null;
    const c = (await w.json()).current;
    if (!c) return null;
    return `${loc.name} (${loc.country_name}): ${c.temperature_2m}°C (sensação ${c.apparent_temperature}°C), ${DESC_CLIMA(c.weather_code)}, umidade ${c.relative_humidity_2m}% — medido agora pelo Open-Meteo`;
  } catch { return null; }
}

async function iaPensar(cid, pergunta, nomeAutor, realInfo = '', midia = []) {
  const hist = (memoriaEco.get(cid) || []).slice(-14);
  const perguntaFinal = realInfo
    ? `[INFO REAL DO SISTEMA: ${realInfo}]\n\n${nomeAutor} fala pra você: ${pergunta}`
    : `${nomeAutor} fala pra você: ${pergunta}`;
  if (AI_KEY) {
    const partes = [{ text: perguntaFinal }, ...midia.map(m => ({ inlineData: { mimeType: m.mime, data: m.b64 } }))];
    const contents = [...hist.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
                      { role: 'user', parts: partes }];
    // 🔓 SAFENÁRIOS AFROUXADOS: cortes de bloqueio no MÁXIMO tolerado (BLOCK_ONLY_HIGH) —
    // o padrão do Google bloqueia zoeira média/safadezaLogo; isso mantém só o MUITO pesado travado
    const SEGURANCA_SOLTA = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ];
    const chamar = async (corpo) => {
      corpo.safetySettings = SEGURANCA_SOLTA;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${AI_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      return { r, ok: r.ok, status: r.status, d: r.ok ? await r.json() : null };
    };
    // 🧠 RACIONAMENTO SOB MEDIDA: zoeira curta = turbo sem pensamento (~1-3s);
    // pergunta real / com interrogação = pensamento completo (interpretação afiada, como antes)
    const pensar = pergunta.length > 110 || /\?/.test(pergunta) || /(como|por que|porque|qual|quais|quando|quem|onde|explica|ensina|diferen|faz sentido|melhor|verdade|serio)/i.test(pergunta);
    let resp = await chamar({
      system_instruction: { parts: [{ text: PROMPT_ECO }] },
      contents,
      generationConfig: pensar
        ? { temperature: 1.0, maxOutputTokens: 800 }
        : { temperature: 1.0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
    });
    if (!resp.ok && resp.status === 400) {
      resp = await chamar({
        system_instruction: { parts: [{ text: PROMPT_ECO }] },
        contents,
        generationConfig: { temperature: 1.0, maxOutputTokens: 800 }
      });
    }
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    let texto = resp.d?.candidates?.[0]?.content?.parts?.[0]?.text;
    // 🛡️ MURO DO GOOGLE: resposta cortada pelo filtro (bloqueio/SAFETY) → re-tenta 1x em tom
    // safo LEVE (duplo sentido, sem palavrão sexual explícito) pra nunca deixar o chat no vazio
    const bloqueado = !texto && (resp.d?.promptFeedback?.blockReason || resp.d?.candidates?.[0]?.finishReason === 'SAFETY');
    if (bloqueado) {
      const pedeSafoLeve = { contents: [...contents], system_instruction: { parts: [{ text: PROMPT_ECO }] }, generationConfig: { temperature: 1.0, maxOutputTokens: 800 } };
      pedeSafoLeve.contents[pedeSafoLeve.contents.length - 1].parts[0].text += '\n\n(SUA RESPOSTA ANTERIOR FOI CORTADA PELO FILTRO — re-responda o MESMO clima safado mas em tom de DUPLO SENTIDO e atrevidice leve, SEM palavra sexual explícita, corto e zoeiro igual antes.)';
      const resp2 = await chamar(pedeSafoLeve);
      texto = resp2.d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) throw new Error('BLOQUEADO');
    }
    if (!texto) throw new Error('Resposta vazia do Gemini');
    hist.push({ role: 'user', text: perguntaFinal }, { role: 'model', text: texto });
    memoriaEco.set(cid, hist.slice(-16));
    return texto.trim();
  }
  if (GROQ_KEY) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: process.env.ECO_AI_MODEL_GROQ || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: PROMPT_ECO },
                   ...hist.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
                   { role: 'user', content: perguntaFinal }],
        temperature: 1.0, max_tokens: 600
      })
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    const d = await r.json();
    const texto = d.choices?.[0]?.message?.content;
    if (!texto) throw new Error('Resposta vazia do Groq');
    hist.push({ role: 'user', text: perguntaFinal }, { role: 'model', text: texto });
    memoriaEco.set(cid, hist.slice(-16));
    return texto.trim();
  }
  throw new Error('SEM_CHAVE');
}

// ═══════════ Catálogo de figurinhas (Giphy — re-auditado 01/11/2026: GET 200, tamanho sadio,
// hash ≠ placeholder "THIS CONTENT IS NOT AVAILABLE" [md5 42C4349B...], tamanho Máx 7.4MB) ═══════════
const GIF_CATALOGO = {
  beijo:     ['S1p1LWtFmdoMQzEpvt', 'XZYxeRlIEdmKI', 'LB1LSk2sQ2i7CJSLfh', 'MQVpBqASxSlFu', 'WynnqxhdFEPYY', 'TkX3BqG3kDKN4SHS6T'],
  casamento: ['JQXYyJ7SgBU0JLqlPF', 'V2J6tK82nkGQxRTobJ', 'DhynvGnAdJ4yc', 'Pkx6o76Kw4E2w61mya', 'TxSZdWVKq6P6Z6nIXG', 'Gj50t3vh6IAuc'],
  choro:     ['ShPv5tt0EM396', 'JoIWAn4rnQud5Xw81w', 'EVBnJch9MBM6ByWRA2', 'Y4z9olnoVl5QI', 'LfzxkxPpfORdcxPnc4', 'Ui7MfO6OaLz4k'],
  zoeira:    ['Lc5v7c6wqDtP8XyFxp', 'WykUqckDqi95YIqtFZ', 'O4fENAKIGz0zJs9dg9', 'LBb735fuQwRKAVzN23', 'LUTa1Nlzg40D0Y0jNz', 'DbVoNx8glF8NOZCK4j']
};
function figurinha(cat) {
  const lista = GIF_CATALOGO[cat] || GIF_CATALOGO.zoeira;
  return `https://media.giphy.com/media/${escolhe(lista)}/giphy.gif`;
}
// 📎 Baixa o GIF e devolve como ANEXO — Discord mostra imagem inline igual pessoa enviando
// ⚡ CACHE DE FIGURINHAS: baixa 1x e reusa (a resposta NUNCA mais espera o Giphy baixar de novo)
const gifCache = new Map(); // url → Buffer
async function gifAnexo(url) {
  try {
    const guardado = gifCache.get(url);
    if (guardado && guardado.length > 60000 && guardado.length !== 239321) return { attachment: guardado, name: 'eco.gif' };
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('image/gif')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 60000 || buf.length > 7.5 * 1024 * 1024) return null;
    // Guarda anti-placeholder: descarta o GIF "not available" do Giphy (233.7kb fixos, md5 42C4349B...)
    if (buf.length === 239321) return null;
    // Cache em RAM só de GIFs leves (Render free tem memória pouca)
    if (buf.length <= 4 * 1024 * 1024) gifCache.set(url, buf);
    return { attachment: buf, name: 'eco.gif' };
  } catch { return null; }
}
// 🔥 PRÉ-AQUECIMENTO: no boot, baixa o catálogo inteiro pro cache em segundo plano (zero primeira demora)
try { Promise.allSettled(Object.values(GIF_CATALOGO).flat().map(id => gifAnexo(`https://media.giphy.com/media/${id}/giphy.gif`))); } catch {}
const reacaoZoeira = () => escolhe(['😂', '💀', '😹', '🤣', '🤡', '😏', '🔥', '👀', '😅', '🍿', '🌟', '🥶', '😭', '☠️', '🤝']);

// 🪦 MODO FANTASMA APOSENTADO (razão do dono Nov/2026): o ECO agora só fala quando ALGUÉM FALAR COM ELE.
// Bloco de aparições espontâneas no chat geral e armadilha de resposta removido por completo.

// ⏰ AUTO-PING ANTI-SONO: puxa a própria URL do Render a cada 4 min → serviço NUNCA spina down
// (spin-down era a causa nº1 da demora: bot dormindo = 40-55s de cold start antes de responder)
const URL_PROPRIA = process.env.RENDER_EXTERNAL_URL || 'https://eco-bot-ohxn.onrender.com';
setInterval(() => fetch(URL_PROPRIA).catch(() => {}), 4 * 60 * 1000);

// Comandos de casamento/zoa + chat livre com @eco
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;

    // 😂 RISADA LIVRE: mesmo sem @eco, às vezes o ECO reage à zoeira do canal
    if (!msg.mentions.has(client.user)) {
      if (Math.random() < 0.25 && /kkk+|rsrs|haha+|hehe|😂|🤣|😹|💀/i.test(msg.content)) {
        return msg.react(reacaoZoeira()).catch(() => {});
      }
      return;
    }

    const agora = Date.now();
    if (agora - (ecoCooldown.get(msg.author.id) || 0) < 3500) return;
    ecoCooldown.set(msg.author.id, agora);

    const alvo = msg.mentions.users.find(u => u.id !== client.user.id && u.id !== msg.author.id);
    const autorTxt = `**${msg.author.displayName || msg.author.username}**`;
    const alvoTxt  = alvo ? `**${alvo.displayName || alvo.username}**` : null;
    const texto = msg.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), ' ').trim();
    const t = texto.toLowerCase();

    // 💍 CASAMENTO — só em COMANDO real (casar @alvo / casa comigo / case com); fofoca sobre "os casados" cai na IA
    const casamentoCmd = /\bcas(ar|amento|ando|ou)\b|case com|\bcasa comigo\b/.test(t);
    if (casamentoCmd && (alvo || t.length < 60 || /\bcomigo\b|case com/.test(t))) {
      if (!alvo) {
        if (casadoCom(msg.author.id)) {
          const casal = casadoCom(msg.author.id);
          const outro = casal[0].split('+').find(id => id !== msg.author.id);
          return msg.reply(`💍 Você já é casado(a) com <@${outro}> e agora quer bigamia no meu cartório?? Vai ver o ex no espelho primeiro. 😂`).catch(() => {});
        }
        return msg.reply(`💍 Casar com quem?? Menciona a vítima: "@eco casar @alguém" — casamento às cegas só no Big Brother. 🤡`).catch(() => {});
      }
      const chave = chaveCasal(msg.author.id, alvo.id);
      const casais = [casadoCom(msg.author.id), casadoCom(alvo.id)];
      const travado = casais.findIndex(Boolean);
      if (travado !== -1 && casais[travado][0] !== chave) {
        const traído = travado === 0 ? msg.author.id : alvo.id;
        delete Object.keys(casamentos).find(k => k.includes(traído));
      }
      casamentos[chave] = { em: new Date().toISOString(), por: msg.author.id };
      salvarCasamentos();
      msg.react('💍').catch(() => {});
      const anexo = await gifAnexo(figurinha('casamento'));
      return msg.reply({ content: `💍 CASAMENTO CONFIRMADO NO CARTÓRIO DO GAMER ZONE!\n${autorTxt} + ${alvoTxt}\nQue os presentes sejam memes e o amor dure até o próximo deploy. 😂`.slice(0, 1600), files: anexo ? [anexo] : [] }).catch(() => {});
    }

    // 💔 DIVÓRCIO
    if (/\bdiv[oó]rcio\b|\bdivorciar\b|\bseparamos?\b|\bterminamos\b/.test(t)) {
      const meu = casadoCom(msg.author.id);
      if (!meu) return msg.reply(`💔 Divorciar SEM PROVA? <@${msg.author.id}>, você nem está casado(a) — drama à vontade, romance zero. 🤷`).catch(() => {});
      const outro = meu[0].split('+').find(id => id !== msg.author.id);
      delete casamentos[meu[0]];
      salvarCasamentos();
      msg.react('💔').catch(() => {});
      const anexo = await gifAnexo(figurinha('choro'));
      return msg.reply({ content: `💔 DIVÓRCIO OFICIAL: ${autorTxt} liberou <@${outro}> de volta no mercado da zoeira.\nTaxa administrativa: 1 figurinha de tristeza. 😭`.slice(0, 1600), files: anexo ? [anexo] : [] }).catch(() => {});
    }

    // 😘 BEIJO
    if (/\bbeij\w*\b|\bselinho\b/.test(t)) {
      msg.react('😘').catch(() => {});
      const anexo = await gifAnexo(figurinha('beijo'));
      if (alvo) {
        return msg.reply({ content: `😘💋 ${autorTxt} plantou um beijo na bochecha de ${alvoTxt} — o servidor aplaudiu em pé. ${reacaoZoeira()}`.slice(0, 1600), files: anexo ? [anexo] : [] }).catch(() => {});
      }
      return msg.reply(`😘💋 Beijo recebido e devolvido em dobro, ${autorTxt}! Cuidado que eu escorrego pra aliança direto. ${reacaoZoeira()}`).catch(() => {});
    }

    // 🧠 CHAT LIVRE com IA
    try {
      // 🌍 Info real: relógio de Brasília sempre; clima de verdade se pedirem (procura cidade na frase)
      let realInfo = `agora é ${agoraBR()} (horário de Brasília)`;
      if (/clima|temperatura|tá chov|vai chover|previs[aã]o do tempo|tá quente|tá frio/i.test(t)) {
        const mcidade = texto.match(/(?:\bem|\bde|\bno|\bna)\s+([\p{L}\s'-]{2,40})\s*[?.!]*$/iu);
        const dadoClima = mcidade ? await buscarClima(mcidade[1].trim()) : null;
        realInfo += dadoClima
          ? `; CLIMA REAL medido agora: ${dadoClima}`
          : '; NENHUM dado de clima disponível (não tem cidade na frase) — NÃO invente temperatura: fala com estilo que não tem sensor e pergunta a cidade';
      }

      // 🗂️ Catálogo GLOBAL de munições (de todos os membros — zoeira cruzada liberada)
      const catalogoMidias = Object.entries(eco_midias.users || {})
        .flatMap(([, lista]) => lista)
        .map(f => `#${f.id} de ${f.de || 'alguém'} (${(f.em || '').slice(0, 10)}): ${f.desc}`)
        .slice(-25)
        .join('; ');
      if (catalogoMidias) {
        realInfo += ` MÍDIAS ARQUIVADAS do servidor (pode citar, zoar, argumentar ou exibir com a tag [ENVIAR_MIDIA #ID] — inclusive a foto de um membro em conversa com outro): ${catalogoMidias}`;
      }

      // 📸 MÍDIA: baixa foto/vídeo anexado e entrega pro cérebro multimodal (Gemini vê de verdade)
      const midia = [];
      for (const at of msg.attachments.values()) {
        const mime = (at.contentType || '').split(';')[0];
        if ((mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) && at.size <= 20 * 1024 * 1024 && at.url) {
          try {
            const mr = await fetch(at.url);
            if (mr.ok) {
              const buf = Buffer.from(await mr.arrayBuffer());
              if (buf.length <= 20 * 1024 * 1024) {
                midia.push({ mime, b64: buf.toString('base64') });
                realInfo += ' A pessoa anexou mídia — REAGA ao conteúdo VISUAL dela comentando o que vê, como gente.';
                // 🗂️ Foto nova → ARQUIVA com legenda (munição futura)
                if (mime.startsWith('image/') && buf.length <= 7.4 * 1024 * 1024) {
                  const salva = await arquivarFoto(msg.author.id, msg.author.displayName || msg.author.username, buf, mime);
                  if (salva) realInfo += ` Esta foto nova foi ARQUIVADA como #${salva.id}.`;
                }
                break; // 1 mídia por chamada basta
              }
            }
          } catch (e) { console.error('📸 Mídia:', e.message); }
        }
      }
      const resposta = await iaPensar(
        msg.channel.id,
        texto || 'comenta o que mandei aí, estilo seu 😏',
        msg.author.displayName || msg.author.username,
        realInfo,
        midia
      );
      msg.react(reacaoZoeira()).catch(() => {});
      // 🗂️ Tag [ENVIAR_MIDIA #N]: a IA exibiu uma foto arquivada (de qualquer membro) — NESSA caso SEM figurinha
      const files = [];
      const mtag = resposta.match(/\[ENVIAR_MIDIA #(\d+)\]/);
      const respostaFinal = resposta.replace(/\s*\[ENVIAR_MIDIA #\d+\]\s*/g, ' ').trim();
      if (mtag) {
        for (const lista of Object.values(eco_midias.users || {})) {
          const item = lista.find(f => f.id === Number(mtag[1]));
          if (item) {
            try {
              const arq = path.join(MIDIAS_DIR, item.file);
              if (fs.existsSync(arq)) files.push({ attachment: arq, name: item.file });
            } catch {}
            break;
          }
        }
      }
      // Sem foto arquivada exibida → figurinha zoeira em 85%
      if (files.length === 0) {
        const anexo = Math.random() < 0.85 ? await gifAnexo(figurinha('zoeira')) : null;
        if (anexo) files.push(anexo);
      }
      return msg.reply({ content: respostaFinal.slice(0, 1600), files }).catch(() => {});
    } catch (e) {
      if (e.message === 'BLOQUEADO') {
        const deflesao = escolhe([
          'kkkkk ô safado, esse aí passou do meu rodízio 😏 trás na dose duas que eu topo 💀',
          'kkkk morri com o pedido, mas esse aí deu BRETE aqui 😂 re-manda mais afiado!',
          '🌶️ kkkkk tá cara de fogo hoje hein... esse nem eu seguro, manda outro!'
        ]);
        return msg.reply(deflesao).catch(() => {});
      }
      if (e.message === 'SEM_CHAVE') {
        return msg.reply(`🧠 Meu cérebro grátis ainda não foi plugado, ${autorTxt}!\nColoca uma **GEMINI_API_KEY** grátis no Render → Environment (aqui: aistudio.google.com/apikey) e eu viro o Bill Gates dos memes. 🤖💰`).catch(() => {});
      }
      console.error('🧠 IA:', e.message);
      return msg.reply(`🫠 Tava pensando tanto que travei igual PC na hora da apresentação ${reacaoZoeira()} Manda de novo que agora vai! 💀`).catch(() => {});
    }
  } catch (e) { console.error('🧠 ECO IA handler:', e.message); }
});

// ═══════════ Blindagem anti-crash ═══════════
process.on('unhandledRejection', e => console.error('🛡️ Rejeição capturada (ECO vivo):', e?.message || e));
process.on('uncaughtException', e => console.error('🛡️ Exceção capturada (ECO vivo):', e?.message || e));

const TOK = (process.env.DISCORD_TOKEN || '').trim();
if (!TOK) console.error('❌ Token AUSENTE — variável DISCORD_TOKEN não configurada no Render (Environment).');
else console.log(`🔑 Token recebido: ${TOK.length} caracteres, começa com "${TOK.slice(0, 4)}..."`);
client.login(TOK).catch(e => {
  console.error('❌ FALHA NO LOGIN:', e.message);
  if (String(e).includes('disallowed intents')) console.error('👉 Ativa no portal: SERVER MEMBERS INTENT + MESSAGE CONTENT INTENT');
  else if (String(e).includes('invalid')) console.error('👉 Token inválido: gera NOVO no portal (Bot → Reset Token), copia que já vai abrir o campo, e cola no Render → Environment → DISCORD_TOKEN (sem espaços). Depois Manual Deploy.');
});
