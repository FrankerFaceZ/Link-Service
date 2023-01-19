'use strict';

// FFZ Link Service: Testing Shell
// This script provides a REPL and HTTPS server for easy development.


import fs from 'fs';
import {createServer} from 'https';
import path from 'path';
import util from 'util';
import selfsigned from 'selfsigned';

import REPL from 'repl';
import Koa from 'koa';
import cheerio from 'cheerio';

import LinkService from './lib';
import fetch from './lib/fetch-timeout';
import {truncate} from './lib/utilities';
import Builder from './lib/builder';
import {SimpleSafetyCheck} from './lib/safetycheck';
import {PassThrough} from 'stream';

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
		ctx.body = {
			examples: await service.getExamples()
		};

	} else if ( ctx.path === '/' ) {
		if ( ! ctx.query.url )
			ctx.throw(404);

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
	ctx.fetch = fetch;
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

		let req;
		try {
			req = await fetch(url, {
				headers: {
					Referer: service.opts.default_referrer,
					'User-Agent': service.opts.user_agent
				},
				size: 5000000,
				timeout: service.opts.resolver_timeout
			});
		} catch (err) {
			this.clearBufferedCommand();
			console.error('Error Requesting URL', err);
			this.displayPrompt();
			return;
		}

		repl.context.$r = req;

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
			console.info('Stored request as $r');
			console.error('Error Parsing Body', err);
			this.displayPrompt();
			return;
		}

		repl.context.$0 = body;
		this.clearBufferedCommand();
		console.info('Stored request as $r. Stored response as $0.');
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
