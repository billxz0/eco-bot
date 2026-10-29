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
  const estP = getEstatico();
  if (estP) comps.push(new ButtonBuilder().setLabel('📜 PORTAL DO REGULAMENTO').setStyle(ButtonStyle.Link).setURL(estP));
  if (siteUrl) comps.push(new ButtonBuilder().setLabel('🌐 ABRIR PORTAL').setStyle(ButtonStyle.Link).setURL(siteUrl));
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
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('portal').setLabel('👤 MEU PORTAL DO REGULAMENTO').setStyle(ButtonStyle.Success));
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
          .setTitle('🎉 PARABÉNS, VERIFICAÇÃO APROVADA!')
          .setDescription(`Parabéns, **${nome}**! 🏆\n\nAgora o território é teu: **jogar, viver boas partidas e se divertir** do teu jeito.\n\nTinha teu cartão de boas-vindas? Toma logo abaixo 👇`)
          .setFooter({ text: 'GAMER ZONE' })
          .setTimestamp();
        const comps = [];
        const est0 = getEstatico();
        if (est0) comps.push(new ButtonBuilder().setLabel('👑 CARTÃO DE BOAS-VINDAS').setStyle(ButtonStyle.Link).setURL(`${est0}/bemvindo.html?n=${encodeURIComponent(nome)}`));
        // GIF primeiro (no topo), mensagem logo abaixo
        if (GIF_USUARIO && fs.existsSync(GIF_USUARIO)) {
          await membro.user.send({ files: [{ attachment: GIF_USUARIO, name: 'usuario.gif' }] })
            .then(() => console.log('🎁 GIF do EFÉRO entregue no topo'))
            .catch(e => console.error('⚠️ GIF na DM falhou:', e.message));
        }
        const payload = { embeds: [dm] };
        if (comps.length) payload.components = [new ActionRowBuilder().addComponents(...comps)];
        membro.user.send(payload)
          .then(() => console.log('🎁 DM do ECO enviada para:', membro.user.tag))
          .catch(e => console.error('⚠️ Falha na DM (checa Privacidade do Discord do usuário):', e.message));
        // Aparição no canal de boas-vindas após ser aceito — GIF de ENTRADA, público pra todos
        const canalBV = guild.channels.cache.find(c => c.name.includes('boas-vindas'));
        if (canalBV) {
                    const sendo = new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`**${nome}** concluiu a verificação e está oficialmente aceito ✅\n\nAgora é jogar, viver boas partidas e se divertir 🎮🔥`)
            .setFooter({ text: 'Gamer Zone · Protegido pelo ECO 🛡️' })
            .setTimestamp();
          if (GIF_ENTRADA && fs.existsSync(GIF_ENTRADA)) await canalBV.send({ files: [{ attachment: GIF_ENTRADA, name: 'entrada.gif' }] }).catch(() => {});
          canalBV.send({ content: `👑 **${nome}** juntou-se à Família! 🏆`, embeds: [sendo] }).catch(() => {});
          // DM separando: cartão no domínio FIXO
          const est1 = getEstatico();
          if (est1 && GIF_USUARIO && fs.existsSync(GIF_USUARIO)) {
            await membro.user.send({
              files: [{ attachment: GIF_USUARIO, name: 'usuario.gif' }],
              components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('👑 ABRIR CARTÃO DE BOAS-VINDAS').setStyle(ButtonStyle.Link).setURL(`${est1}/bemvindo.html?n=${encodeURIComponent(nome)}`))],
            }).catch(() => {});
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
