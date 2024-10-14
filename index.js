'use strict';

// FFZ Link Service: Testing Shell
// This script provides a REPL and HTTPS server for easy development.

import fs from 'fs';
import {createServer} from 'https';
import path from 'path';
import util from 'util';
import selfsigned from 'selfsigned';
import crypto from 'node:crypto';

import REPL from 'repl';
import Koa from 'koa';
import cheerio from 'cheerio';

import LinkService from './lib';
import {truncate} from './lib/utilities';
import Builder from './lib/builder';
import {SimpleSafetyCheck} from './lib/safetycheck';
import {PassThrough} from 'stream';
import CookieJar from './lib/cookie-jar';
import HSTSCache from './lib/hsts-cache';

let og_fetch = fetch,
	og_abort = AbortController;

if ( ! og_fetch )
	og_fetch = require('node-fetch');
if ( ! og_abort )
	og_abort = require('abort-controller');

// Why is this missing, node?
fs.promises.exists = util.promisify(fs.exists);

// Resolver Initialization, aka the bit you care about

let service_config = {};

try {
	service_config = require('./config.json');
} catch (err) { /* no-op */ }

if ( ! service_config.image_proxy )
	service_config.image_proxy = {};

if ( ! service_config.image_proxy.host )
	service_config.image_proxy.host = LinkService.ALLOW_UNSAFE_IMAGES;

service_config.fetch = og_fetch;
service_config.AbortController = og_abort;

const KNOWN_FEDI = [
	'mastodon.social',
	'mindly.social',
	'piaille.fr',
	'kolektiva.social',
	'vt.social',
	'meow.social',
	'universeodon.com',
	'furries.club',
	'techhub.social',
	'infosec.exchange',
	'dice.camp',
	'thehappyfamily.stream',
	'peoplemaking.games',
	'ohai.social',
	'kind.social',
	"pawoo.net",
	"mas.to",
	"social.tchncs.de",
	"mstdn.iroh.tv",
	"mastobate.social",
	"livellosegreto.it",
	"mastodon.art",
	"equestria.social",
	"mastodon.gamedev.place",
	"masto.ai",
	"mastodon.online",
	"chaos.social",
	"cyberfurz.social",
	"sauropods.win",
	"rivals.space",
	"troet.cafe",
	"ocw.social",
	"mastodon.world",
	"lsbt.me",
	"nerdculture.de",
	"eldritch.cafe",
	"hachyderm.io",
	"retrochat.online",
	"mstdn.social",
	"wuffs.org",
	"ravenation.club",
	"ludosphere.fr",
	"queer.party",
	"red.fox.yt",
	"corteximplant.com",
	"chitter.xyz",
	"twitchfr.social",
	"wobbl.xyz",
	"mastouille.fr",
	"mamot.fr",
	"retro.pizza",
	"rollenspiel.social",
	"xoxo.zone",
	"nrw.social",
	"social.linux.pizza",
	"mastodon.lubar.me",
	"mastodon.cloud",
	"vgn.church",
	"soc.gsg.live",
	"streamers.social",
	"tech.lgbt",
	"g33ks.coffee",
	"octodon.social",
	"tenforward.social",
	"dialup.space",
	"idlethumbs.social",
	"social.chiefgyk3d.com",
	"mastodon.murkworks.net",
	"toot.garden",
	"mstdn.games",
	"chillpeep.zone",
	"mastodon.coffee",
	"todon.nl",
	"aus.social",
	"trans.house",
	"jorts.horse",
	"respublicae.eu",
	"wandering.shop",
	"masto.pt",
	"astral.camp",
	"teal.social",
	"social.sdf.org",
	"craftodon.social",
	"gervtuber.de",
	"shrike.club",
	"androiddev.social",
	"topspicy.social",
	"imaginair.es",
	"xn--8r9a.com",
	"xarxa.cloud",
	"wetdry.world",
	"haqueers.com",
	"fosstodon.org",
	"mstdn.ca",
	"social.notjustbikes.com",
	"pub.ehrengruppe.de",
	"raru.re",
	"socel.net",
	"blacktwitter.io",
	"oliphaunt.social",
	"mastodon.rosiesocosy.com",
	"botsin.space",
	"sakurajima.moe",
	"journa.host",
	"bolha.one",
	"blind.lol",
	"eggplant.social",
	"leds.social",
	"pony.social",
	"awoo.space",
	"loli.best",
	"void.danitheskunk.com",
	"f.cz",
	"anarchism.space",
	"mostlygood.xyz",
	"social.mootech.eu",
	"todon.eu",
	"furry.engineer",
	"mastodon.tymoon.eu",
	"idiots.chat",
	"lou.lt",
	"oldbytes.space",
	"mastodon.pnpde.social",
	"pawb.fun",
	"v2br.social",
	"mastodon.nuwus.org",
	"cubhub.social",
	"thx.gg",
	"vtuber.house",
	"mastodonapp.uk",
	"mastodonczech.cz",
	"creators.social",
	"baraag.net",
	"lile.cl",
	"trg.social",
	"social.pawsitiv.space",
	"social.hackerspace.pl",
	"mastodon.wssmagazine.com",
	"noagendasocial.com",
	"bat.chat",
	"floss.social",
	"shelter.moe",
	"noot.pingu4.me",
	"wspanialy.eu",
	"bears.town",
	"blorbo.social",
	"mcyt.cc",
	"mastodon.furrycon.social",
	"social.spejset.org",
	"w3c.social",
	"mstdn.animexx.de",
	"pounced-on.me",
	"ursal.zone",
	"plush.city",
	"cc.chat",
	"framapiaf.org",
	"defcon.social",
	"phpc.social",
	"mastodon.design",
	"bitbang.social",
	"ioc.exchange",
	"toot.majorshouse.com",
	"twit.social",
	"cr8r.gg",
	"wires.social",
	"trekkies.social",
	"this.mouse.rocks",
	"toot.cat",
	"beige.party",
	"broken.graphics",
	"toot.wales",
	"nextham.duckdns.org",
	"digitalcourage.social",
	"social.network.europa.eu",
	"nosocialnet.work",
	"dotnet.social",
	"lasersare.fun",
	"stormwaltz.net",
	"witter.cz",
	"yiff.life",
	"mastodon.xyz",
	"social.growyourown.services",
	"wisskomm.social",
	"mstdn.party",
	"toot.io",
	"mastodon.green",
	"ieji.de",
	"mastodon.sandwich.net",
	"ecoevo.social",
	"mograph.social",
	"velour.social",
	"e-sports.sk",
	"systemli.social",
	"mastodon.pretendo.network",
	"norden.social",
	"genart.social",
	"mathstodon.xyz",
	"chat.trueffzido.de",
	"gnurfl.de",
	"dook.business",
	"press.coop",
	"is.nota.live",
	"flipboard.social",
	"mastodon.exok.com",
	"kafeneio.social",
	"starbase80.wtf",
	"pone.social",
	"glitterkitten.co.uk",
	"soylent.green",
	"alaskan.social",
	"fedinerds.social",
	"rubber.social",
	"brands.town",
	"freeradical.zone",
	"sueden.social",
	"social.sp-codes.de",
	"cathode.church",
	"vis.social",
	"pdx.social",
	"toot.shortbus.fail",
	"fediscience.org",
	"sunny.garden",
	"toot.aquilenet.fr",
	"med-mastodon.com",
	"literatur.social",
	"mastodon.sdf.org",
	"squawk.social",
	"veganism.social",
	"mastodon.nu",
	"social.lol",
	"zirk.us",
	"toad.social",
	"catcatnya.com",
	"mastodon.nz",
	"linuxrocks.online",
	"connected.so",
	"dads.so",
	"md.ilyamikcoder.com",
	"hear-me.social",
	"macrofurs.social",
	"tsukihi.me",
	"mastodon.me.uk",
	"mstdn.lalafell.org",
	"social.sciences.re",
	"social.security.plumbing",
	"federated.press",
	"ciberlandia.pt",
	"fulda.social",
	"mastodontti.fi",
	"snowmans.land",
	"dragon.style",
	"federate.social",
	"unstable.systems",
	"sfba.social",
	"social.coop",
	"genomic.social",
	"toot.berlin",
	"fed.mthie.com",
	"tvwatch.party",
	"astrodon.social",
	"discuss.systems",
	"hessen.social",
	"fandom.ink",
	"pogs.cafe",
	"e.fo",
	"laserdisc.party",
	"bolha.us",
	"mastoart.social",
	"mastodon.tinyfox.dev",
	"whitehouse.org",
	"social.furry.nz",
	"jammer.social",
	"social.vivaldi.net",
	"m.benui.ca",
	"blimps.xyz",
	"configure.ac",
	"foule.net",
	"lucitt.social",
	"famichiki.jp",
	"silversword.online",
	"eigenmagic.net",
	"floofy.tech",
	"mastodon.nl",
	"amicale.net",
	"tkz.one",
	"cyberplace.social",
	"haters.pro",
	"pol.social",
	"neovibe.app",
	"23.social",
	"gensokyo.social",
	"glaceon.social",
	"social.treehouse.systems",
	"mastoot.fr",
	"mastodon.zaclys.com",
	"mastodon.com.br",
	"fox.nexus",
	"ellie.chat",
	"lgbt.io",
	"social.gamingecke.space",
	"fedi.simonwillison.net",
	"mastodon.de",
	"vkl.world",
	"anticapitalist.party",
	"billys.mom",
	"mstdn.crmbl.uk",
	"unfufadoo.net",
	"history.lol",
	"c.im",
	"graphics.social",
	"indiepocalypse.social",
	"elekk.xyz",
	"wehavecookies.social",
	"mastodon.sergal.org",
	"bzh.social",
	"transfur.social",
	"bnnuy.space",
	"toot.community",
	"shark.community",
	"meta.masto.host",
	"fluffs.au",
	"warhammer.social",
	"noauthority.social",
	"bookstodon.com",
	"wien.rocks",
	"cyberpunk.lol",
	"paquita.masto.host",
	"toot.cafe",
	"tivia.social",
	"wayland.social",
	"101010.pl",
	"moris.social",
	"d20.social",
	"strangeobject.space",
	"speedlines.stctp.zone",
	"buttplug.zone",
	"buttplug.engineer",
	"fellies.social",
	"newsie.social",
	"glammr.us",
	"im-in.space",
	"mozilla.social",
	"metalhead.club",
	"inaccessible.ac",
	"bark.lgbt",
	"mastodon.archive.org",
];

service_config.fediverse_check = host => KNOWN_FEDI.includes(host) ? 'mastodon': false;

service_config.bluesky_api.loadSession = () => {
	return fs.promises.readFile('./bsky-session.json')
		.then(data => JSON.parse(data))
		.catch(() => null);
}

service_config.bluesky_api.saveSession = data => {
	return fs.promises.writeFile('./bsky-session.json', JSON.stringify(data, null, '\t'));
}

/*
const PROXY_HOSTS = [
	'api.steampowered.com',
	'store.steampowered.com',
	'www.dota2.com',
	'steamcommunity.com'
];

service_config.http_proxy = {
	url: 'http://localhost:6969/proxy',
	method: 'POST',
	shouldProxy(url) {
		return PROXY_HOSTS.includes(url.hostname.toLowerCase())
	},
	async sign(url, body, opts) {
		const key = await fs.promises.readFile('privkey.pem', 'utf8');

		const sign = crypto.createSign('SHA256');
		sign.write(body);
		sign.end();

		return sign.sign(key, 'base64');
	}
}*/


const service = new LinkService(service_config);

service.registerDefaultResolvers();

// PhishTank
let pt_urls = null, phishtank_urls = null;

try {
	phishtank_urls = require('./verified_online.json');
} catch (err) { /* no-op */ }

if ( phishtank_urls ) {
	pt_urls = new Set;
	for (const entry of phishtank_urls) {
		if ( ! entry || ! entry.verified || ! entry.online || ! entry.url )
			continue;

		let url;
		try {
			url = service.normalizeURL(entry.url);
		} catch (err) {
			continue;
		}

		pt_urls.add(url.toString());
	}

	// Free that memory.
	phishtank_urls = null;

	class PhishTank extends SimpleSafetyCheck {
		checkSingle(url) {
			return pt_urls.has(url.toString());
		}
	}

	service.registerSafetyCheck(PhishTank);
}


// From this point on, everything is about setting up the REPL + HTTP server.
// You probably don't care about it.

// HTTP Server

async function getCert() {
	const cert_path = path.join(__dirname, './server/cert.pem');

	let exists = await fs.promises.exists(cert_path);
	if ( exists ) {
		const stats = await fs.promises.stat(cert_path);
		if ( Date.now() - stats.ctime > (1000 * 60 * 60 * 24 * 2) ) {
			console.log('SSL certificate is more than 2 days old. Removing.');
			await fs.promises.unlink(cert_path);
			exists = false;
		}
	}

	if ( ! exists ) {
		console.log('Generating SSL certificate.');
		const pems = selfsigned.generate([{name: 'commonName', value: 'localhost'}], {
			algorithm: 'sha256',
			days: 3,
			keySize: 2048,
			extensions: [
				{
					name: 'keyUsage',
					keyCertSign: false,
					digitalSignature: true,
					nonRepudiation: true,
					keyEncipherment: true,
					dataEncipherment: true
				},
				{
					name: 'extKeyUsage',
					serverAuth: true,
					clientAuth: false,
					codeSigning: false,
					timeStamping: false
				},
				{
					name: 'subjectAltName',
					altNames: [
						{type: 2, value: 'localhost'},
						{type: 2, value: 'localhost.localdomain'},
						{type: 2, value: '[::1]'},
						{type: 7, ip: '127.0.0.1'},
						{type: 7, ip: 'fe80::1'}
					]
				}
			]
		});

		const cert = pems.private + pems.cert;
		await fs.promises.mkdir(path.dirname(cert_path), {recursive: true});
		await fs.promises.writeFile(cert_path, cert, {encoding: 'utf8'});
		return cert;
	}

	return fs.promises.readFile(cert_path, {encoding: 'utf8'});
}

const app = new Koa();
let server;


app.use(async ctx => {
	ctx.set('Access-Control-Allow-Origin', '*');
	if ( ctx.path === '/sse' ) {
		if ( ctx.method === 'OPTIONS' ) {
			ctx.status = 204;
			return;

		} else if ( ctx.method !== 'GET' )
			ctx.throw(405);

		ctx.req.socket.setTimeout(0);
		ctx.req.socket.setNoDelay(true);
		ctx.req.socket.setKeepAlive(true);

		ctx.set({
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		});

		const stream = new PassThrough();

		ctx.status = 200;
		ctx.body = stream;

		stream.write('data: connected\n\n');

		const interval = setInterval(() => {
			stream.write(`data: ping\n\n`);
		}, 30000);

		stream.on('close', () => clearInterval(interval));

	} else if ( ctx.path === '/examples' ) {
		if ( ctx.method === 'OPTIONS' ) {
			ctx.status = 204;
			return;

		} else if ( ctx.method !== 'GET' )
			ctx.throw(405);

		ctx.body = {
			examples: await service.getExamples()
		};

	} else if ( ctx.path === '/' ) {
		if ( ! ctx.query.url )
			ctx.throw(404);

		if ( ctx.method === 'OPTIONS' ) {
			ctx.status = 204;
			return;

		} else if ( ctx.method !== 'GET' )
			ctx.throw(405);

		console.log('Request:', ctx.query.url);

		const data = await service.resolve(ctx.query.url);
		ctx.body = data;

	} else
		ctx.throw(404);
});

async function runServer(port) {
	const valid_port = port > 0 && port < 65536;

	if ( server != null ) {
		if ( ! valid_port )
			console.info('Stopping server.');
		server.close();
		server = null;
	}

	if ( valid_port ) {
		const cert = await getCert(),
			s = createServer({key: cert, cert}, app.callback());

		s.listen(port);
		console.info(`Listening on port :${port}`);
		server = s;
	}
}


// Config Garbage

let config;

async function readServerConfig() {
	if ( config === undefined )
		try {
			config = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'server/config.json'), {encoding: 'utf8'}));
		} catch {
			config = null;
		}

	if ( ! config )
		config = {port: 8002};

	return config;
}

async function writeServerConfig() {
	await fs.promises.mkdir(path.join(__dirname, 'server'), {recursive: true});
	await fs.promises.writeFile(path.join(__dirname, 'server/config.json'), JSON.stringify(config, null, '\t'), {encoding: 'utf8'});
}


// Help

console.info('@ffz/link-service -- Development Shell');
console.info('--------------------------------------');
console.info('Variables:');
console.info(' - service -- LinkService instance');
console.info(' - Builder -- DocumentBuilder class')
console.info('Commands:');
console.info(' - .fetch [url]     -- Fetch a URL and store the parsed response into $0');
console.info(' - .normalize [url] -- Normalize a URL');
console.info(' - .resolve [url]   -- Resolve a URL');
console.info(' - .start [port]    -- Start the built-in web server (Default Port: 8002)')
console.info(' - .stop            -- Stop the built-in web server');
console.info('');


// REPL Initialization

const repl = REPL.start('>>> ');

function initializeContext(ctx) {
	ctx.service = service;
	ctx.Builder = Builder;
	ctx.fetch = service.fetch;
	ctx.getCert = getCert;
	ctx.truncate = truncate;
	ctx.pt_urls = pt_urls;
}

initializeContext(repl.context);

readServerConfig().then(async () => {
	repl.clearBufferedCommand();
	await runServer(config.port);
	repl.displayPrompt();
});

repl.on('reset', initializeContext);

repl.defineCommand('stop', {
	help: 'Stop the built-in web server',
	async action() {
		config.port = 0;
		this.clearBufferedCommand();
		await Promise.all([
			runServer(0),
			writeServerConfig()
		]);
		this.displayPrompt();
	}
});

repl.defineCommand('start', {
	help: 'Start the built-in web server',
	async action(input) {
		this.clearBufferedCommand();
		input = input && input.trim();
		const port = input ? parseInt(input, 10) : 8002;
		if ( isNaN(port) || ! isFinite(port) || port < 1 || port > 65536 )
			console.info(`Error: Port ${port} is out of range.`);
		else {
			config.port = port;
			await Promise.all([
				runServer(port),
				writeServerConfig()
			]);
		}

		this.displayPrompt();
	}
})


repl.defineCommand('normalize', {
	help: 'Normalize a URL',
	action(input) {
		this.clearBufferedCommand();
		console.info('     Input:', input);
		try {
			console.info('Normalized:', service.normalizeURL(input));
		} catch (err) {
			console.error('Error Parsing URL', err);
		}
		this.displayPrompt();
	}
});

repl.defineCommand('fetch', {
	help: 'Fetch a page, parse it, and stick the output in the variable $0',
	async action(input) {
		let url;
		try {
			url = service.normalizeURL(input);
		} catch (err) {
			this.clearBufferedCommand();
			console.error('Error Parsing URL', err);
			this.displayPrompt();
			return;
		}

		let cookies = new CookieJar,
			hsts = new HSTSCache;

		let req;
		const urls = [];

		let referer = service.opts.default_referrer;

		while(true) {
			urls.push(url);
			if ( urls.length > 20 ) {
				console.error('Maximum redirect count exceeded. Stopping.');
				break;
			}

			try {
				req = await service.fetch(url, {
					headers: {
						Referer: referer,
						'User-Agent': service.opts.user_agent
					},
					redirect: 'manual',
					size: 5000000,
					timeout: service.opts.resolver_timeout
				},  cookies, hsts);
			} catch (err) {
				this.clearBufferedCommand();
				console.error('Error Requesting URL', err);
				this.displayPrompt();
				return;
			}

			let redirect = null,
				status = req.status;

			if ( status >= 300 && status < 400 )
				redirect = req.headers.get('Location');
			else if ( req.headers.has('Refresh') ) {
				const match = REFRESH_TARGET.exec(request.headers.get('Refresh')),
					matched = match && (match[2] || match[3]);
				if ( matched )
					redirect = matched;
			}

			if ( redirect ) {
				req.abort();

				let target = hsts.upgrade(new URL(redirect, url));
				const target_str = target.toString(),
					req_str = url.toString();
				if ( target_str === req_str && target_str === referer ) {
					console.error('Infinite redirect loop detected. Breaking.');
					break;
				}

				referer = req_str;
				url = target;
				continue;
			}

			break;
		}

		repl.context.$r = req;
		repl.context.$c = cookies;
		repl.context.$h = hsts;
		repl.context.$u = urls;

		const content_type = req.headers.get('content-type') || '';
		let body;

		try {
			if ( content_type.includes('application/json') )
				body = await req.json();

			else if ( content_type.includes('text/html') || content_type.includes('application/xhtml+xml') )
				body = cheerio.load(await req.text());

			else if ( content_type.includes('xml') )
				body = cheerio.load(await req.text(), {xmlMode: true});

			else
				body = await req.text();

		} catch (err) {
			this.clearBufferedCommand();
			console.info('Stored request as $r. Stored URL chain as $u. Stored cookies as $c. Stored HSTS as $h.');
			console.error('Error Parsing Body', err);
			this.displayPrompt();
			return;
		}

		repl.context.$0 = body;
		this.clearBufferedCommand();
		console.info('Stored request as $r. Stored response as $0. Stored URL chain as $u. Stored cookies as $c. Stored HSTS as $h.');
		this.displayPrompt();
	}
})

repl.defineCommand('resolve', {
	help: 'Resolve a URL',
	async action(input) {
		let result;
		try {
			result = await service.resolve(input);
		} catch (err) {
			this.clearBufferedCommand();
			console.info('Input:', input);
			console.error(err);
			this.displayPrompt();
			return;
		}

		this.clearBufferedCommand();
		console.info('Input:', input);
		console.info('Result:');
		console.log(result);
		repl.context.$0 = result;
		console.info('Stored response as $0.');
		this.displayPrompt();
	}
});
