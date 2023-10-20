'use strict';

let URL = global.URL;
if ( ! URL )
	URL = require('url').URL;

import {tldExists} from 'tldjs';
import LRUCache from 'mnemonist/lru-cache';

import normalizeURL from './normalize-url';
import {InvalidHostError, UnsupportedPortError, UnsupportedSchemeError} from './errors/url';
import {UseMetadata, Redirect} from './results';
import {RuntimeError, RedirectLoopError, TooManyRedirectsError} from './errors/runtime';
import Resolver from './resolver';
import SafetyCheck, {AdListChecker, CloudflareDNS, DNSZero, GrabifyChecker, SafeBrowsing} from './safetycheck';

import Metadata from './metadata';
import BaseError from './errors/base';
import {i18nToken} from './builder';
import CookieJar from './cookie-jar';
import wrapFetch from './wrap-fetch';
import ShortenerCheck, { UrlShortenerList } from './shortener-check';
import HSTSCache from './hsts-cache';

const PACKAGE = require('../package.json');

let thisCrypto;
try {
	thisCrypto = require('node:crypto');
	if ( ! thisCrypto || typeof thisCrypto.createHmac !== 'function' )
		thisCrypto = globalThis.crypto;
} catch(err) {
	thisCrypto = globalThis.crypto;
}

function b64tourl(data) {
	return data.replace(/\+/g, '-').replace(/\//g, '_');
}


/**
 * The LinkService class manages {@link Resolver} instances, stores
 * configuration, and performs the main look-up look for links including
 * SafeBrowsing hits if configured.
 *
 * @param {Object} [opts] Options for initializing the serice.
 * @param {Function} [opts.fetch] A fetch method to use for performing requests. This should implement the standard fetch API.
 * @param {Class} [opts.AbortController] A class to use as an AbortController with fetch.
 * @param {CacheInterface} [opts.cache] A cache interface for use in caching intermediate and final responses.
 * @param {Number} [opts.max_redirects=20] The maximum number of redirects to follow.
 * @param {Number} [opts.domain_cache_size=300] The maximum number of domains to cache in the LRU cache.
 * @param {String} [opts.safe_browsing_server] The URL of a Google SafeBrowsing API server to use for looking up SafeBrowsing data.
 * @param {Boolean} [opts.use_cloudflare_dns] When true, domains will be checked for malware/safety against Cloudflare DNS.
 * @param {Boolean} [opts.use_dnszero] When true, domains will be checked for malware/safety against DNS0 Zero.
 * @param {String} [opts.user_agent] The `User-Agent` to send with all HTTP requests.
 * @param {String|URL} [opts.default_referrer] The default Referer to use when making HTTP requests.
 * @param {Number} [opts.resolver_timeout=4000] The number of miliseconds to wait for a remote server before timing out.
 * @param {Object} [opts.image_proxy] Options for an imageproxy server.
 * @param {String} [opts.image_proxy.host] The URL of an imageproxy server for use when proxying images.
 * @param {String} [opts.image_proxy.key] The base-64 signing key to use for authenticating proxied image URLs.
 */
class LinkService {
	constructor(opts = {}) {
		this.opts = Object.assign({}, LinkService.DEFAULT_OPTS, opts);

		let fetch = this.opts.fetch || global.fetch,
			abort = this.opts.AbortController || global.AbortController;

		if ( ! fetch )
			throw new Error("No fetch specified and cannot find fetch");
		if ( ! abort )
			throw new Error("No AbortController specified and cannot find AbortController");

		this.abortController = abort;
		this.unwrapped_fetch = fetch;
		this.fetch = this.wrapFetch();

		this.domain_cache = new LRUCache(this.opts.domain_cache_size);
		this.resolvers = [];
		this.safety_checks = [];
		this.shortener_checks = [];

		if ( this.opts.cache )
			this.cache = this.opts.cache;

		this.metadata_resolver = new Metadata(this);

		if ( this.opts.safe_browsing_server )
			this.registerSafetyCheck(new SafeBrowsing(this, this.opts.safe_browsing_server));

		if ( this.opts.use_cloudflare_dns )
			this.registerSafetyCheck(new CloudflareDNS(this));

		if ( this.opts.use_dnszero )
			this.registerSafetyCheck(new DNSZero(this));

		if ( this.opts.use_shortener_list )
			this.registerShortenerCheck(new UrlShortenerList(this));

		if ( this.opts.use_grabify_check )
			this.registerSafetyCheck(new GrabifyChecker(this));

		if ( this.opts.use_iplogger_list )
			this.registerSafetyCheck(new AdListChecker(this,
				'https://raw.githubusercontent.com/piperun/iploggerfilter/master/filterlist',
				'ip-logger',
				true
			));
	}


	wrapFetch(fetch, abort) {
		return wrapFetch(fetch ?? this.unwrapped_fetch, abort ?? this.abortController);
	}


	/**
	 * Register all of the default resolvers that come packaged with
	 * the LinkService. A list of those resolvers can be found at
	 * {@link https://github.com/FrankerFaceZ/link-service/tree/master/lib/resolvers}
	 */
	registerDefaultResolvers() {
		this.registerResolver(require('./resolvers/7tv'));
		this.registerResolver(require('./resolvers/archiveofourown'));
		this.registerResolver(require('./resolvers/betterttv'));
		this.registerResolver(require('./resolvers/bluesky'));
		this.registerResolver(require('./resolvers/discord'));
		this.registerResolver(require('./resolvers/etrogg'));
		this.registerResolver(require('./resolvers/ffz'));
		this.registerResolver(require('./resolvers/fxtwitter'));
		this.registerResolver(require('./resolvers/horaro'));
		this.registerResolver(require('./resolvers/imgur'));
		this.registerResolver(require('./resolvers/linktree'));
		this.registerResolver(require('./resolvers/makercentral'));
		this.registerResolver(require('./resolvers/mastodon'));
		this.registerResolver(require('./resolvers/opencourseworld'));
		this.registerResolver(require('./resolvers/pastebin'));
		this.registerResolver(require('./resolvers/reddit'));
		this.registerResolver(require('./resolvers/smbc'));
		this.registerResolver(require('./resolvers/smm2viewer'));
		this.registerResolver(require('./resolvers/speedrun'));
		this.registerResolver(require('./resolvers/tehurn'));
		this.registerResolver(require('./resolvers/tiktok'));
		//this.registerResolver(require('./resolvers/twitch'));
		this.registerResolver(require('./resolvers/waifutcg'));
		this.registerResolver(require('./resolvers/wikipedia'));
		this.registerResolver(require('./resolvers/xkcd'));
		this.registerResolver(require('./resolvers/youtube'));
	}

	/**
	 * Register a new {@link Resolver} with the LinkService. If a
	 * class is passed, an instance will be created automatically.
	 *
	 * > *Note:* Registering a resolver has the side effect of
	 * > clearing the domain cache.
	 *
	 * @param {Resolver} resolver The resolver to register.
	 * @returns {Resolver} The registered resolver.
	 */
	registerResolver(resolver) {
		if ( resolver && resolver.default && resolver.default.prototype instanceof Resolver )
			resolver = resolver.default;

		if ( resolver && resolver.prototype instanceof Resolver )
			resolver = new resolver(this);

		this.resolvers.push(resolver);
		this.resolvers.sort((a, b) => (b.priority ?? b.constructor.priority ?? 0) - (a.priority ?? a.constructor.priority ?? 0));
		this.domain_cache.clear();

		return resolver;
	}

	/**
	 * Get a {@link Resolver} instance from the LinkService.
	 *
	 * @param {String} name The name of the resolver to fetch.
	 * @returns {Resolver|null} The resolver, if it exists, or null
	 */
	getResolver(name) {
		for(const resolver of this.resolvers) {
			const resname = resolver.name ?? resolver.constructor.name;
			if ( resname === name )
				return resolver;
		}

		return null;
	}


	/**
	 * Register a new {@link SafetyCheck} with the LinkService.
	 * If a class is passed, an instance will be created
	 * automatically.
	 *
	 * @param {SafetyCheck} checker The safety check to register.
	 * @returns {SafetyCheck} The registered safety check.
	 */
	registerSafetyCheck(checker) {
		if ( checker && checker.prototype instanceof SafetyCheck )
			checker = new checker(this);

		this.safety_checks.push(checker);
		return checker;
	}

	/**
	 * Register a new {@link ShortenerCheck} with the LinkService.
	 * If a class is passed, an instance will be created
	 * automatically.
	 *
	 * @param {ShortenerCheck} checker The shortener check to register.
	 * @returns {ShortenerCheck} The registered shortener check.
	 */
	registerShortenerCheck(checker) {
		if ( checker && checker.prototype instanceof ShortenerCheck )
			checker = new checker(this);

		this.shortener_checks.push(checker);
		return checker;
	}

	/**
	 * Gather an array of example URLs from all the registered
	 * resolvers, for use in populating a selection field in
	 * a testing client.
	 * @returns {ExampleURL[]} List of URLs.
	 */
	getExamples() {
		const out = [];
		for (const resolver of [...this.resolvers, this.metadata_resolver]) {
			if ( ! resolver )
				continue;

			const name = resolver.constructor.name,
				examples = resolver.getExamples();
			if ( Array.isArray(examples) )
				for (let example of examples) {
					if ( example instanceof URL || typeof example === 'string' )
						example = {
							url: example
						};
					else if ( typeof example !== 'object' )
						throw new TypeError(`Invalid result from getExamples from resolver: ${name}`, example);

					if ( example.url instanceof URL )
						example.url = example.url.toString();
					else if ( typeof example.url !== 'string' )
						throw new TypeError(`Invalid result from getExamples from resolver: ${name}`, example);

					if ( ! example.resolver )
						example.resolver = name;

					out.push(example);
				}
		}

		for(const resolver of this.safety_checks) {
			if ( ! resolver )
				continue;

			const name = resolver.constructor.name,
				examples = resolver.getExamples();
			if ( Array.isArray(examples) )
				for (let example of examples) {
					if ( example instanceof URL || typeof example === 'string' )
						example = {
							url: example
						};
					else if ( typeof example !== 'object' )
						throw new TypeError(`Invalid result from getExamples from safety check: ${name}`, example);

					if ( example.url instanceof URL )
						example.url = example.url.toString();
					else if ( typeof example.url !== 'string' )
						throw new TypeError(`Invalid result from getExamples from safety check: ${name}`, example);

					if ( ! example.resolver ) {
						example.resolver = 'Safety Checks';
						example.title = `${name}: ${example.title}`;
					}

					out.push(example);
				}
		}

		for(const resolver of this.shortener_checks) {
			if ( ! resolver )
				continue;

			const name = resolver.constructor.name,
				examples = resolver.getExamples();
			if ( Array.isArray(examples) )
				for (let example of examples) {
					if ( example instanceof URL || typeof example === 'string' )
						example = {
							url: example
						};
					else if ( typeof example !== 'object' )
						throw new TypeError(`Invalid result from getExamples from shortener check: ${name}`, example);

					if ( example.url instanceof URL )
						example.url = example.url.toString();
					else if ( typeof example.url !== 'string' )
						throw new TypeError(`Invalid result from getExamples from shortener check: ${name}`, example);

					if ( ! example.resolver ) {
						example.resolver = 'Shortener Checks';
						example.title = `${name}: ${example.title}`;
					}

					out.push(example);
				}
		}

		return out;
	}


	/**
	 * Create a URL for passing an image through a proxy, used to
	 * avoid leaking end-user IP addresses and to perform sanity
	 * checks on the contents of the image.
	 *
	 * Currently, this method is written to generate URLs for the
	 * {@link https://github.com/willnorris/imageproxy} project, as
	 * that's what FrankerFaceZ is using.
	 *
	 * This returns `null` if no `image_proxy_host` is set in
	 * options as end-user security should be the default. If you
	 * really, really want to pass URLs through unmodified this
	 * must be set to {@link LinkService.ALLOW_UNSAFE_IMAGES}.
	 *
	 * This potentially returns a Promise, so make sure to await the result.
	 *
	 * @param {String|URL} url The URL to proxy.
	 * @param {Number} [size=324] The size parameter to pass to the proxy server.
	 * @returns {Promise|String|null} The proxied image URL, or `null` if no proxy server is configured.
	 */
	proxyImage(url, size = 384) {
		url = url.toString();

		//console.log('image url', url);

		// No need to proxy data URLs.
		if ( url.startsWith('data:') )
			return url;

		const host = this.opts.image_proxy?.host;
		if ( host === LinkService.ALLOW_UNSAFE_IMAGES )
			return url;
		else if ( ! host )
			return null;

		if ( typeof size !== 'string' )
			size += ',fit';

		url = url.toString();

		if ( ! this.opts.image_proxy.key )
			return `${host}/${size}/${url}`;

		const fmt = signature => `${host}/${size},s${b64tourl(signature)}/${url}`;

		const result = this.signUrlForProxy(url);
		if ( result instanceof Promise )
			return result.then(fmt);

		return fmt(result);
	}

	/**
	 * This is the actual method that handles URL signing for the default
	 * implementation of {@link proxyImage}. It may return a promise, or
	 * it may not, depending on whether or not node crypto is available.
	 *
	 * If it needs to fall back to crypto.subtle, it will necessarily be
	 * asynchronous as that API is asynchronous only.
	 *
	 * @param {String} input The input string to sign.
	 * @returns {Promise|String} The resulting signature.
	 */
	signUrlForProxy(url) {
		if ( thisCrypto.createHmac )
			return thisCrypto.createHmac('SHA256', this.opts.image_proxy.key)
				.update(url)
				.digest('base64');

		const enc = new TextEncoder();

		return thisCrypto.subtle.importKey(
			'raw',
			enc.encode(this.opts.image_proxy.key),
			{name: 'HMAC', hash: 'SHA-256'},
			false,
			['sign', 'verify']
		).then(key => thisCrypto.subtle.sign(
			'HMAC',
			key,
			enc.encode(url)
		)).then(sig => Buffer.from(sig).toString('base64'));
	}


	/**
	 * Normalize a URL. This method is used by the LinkService to
	 * normalize all URLs that it encounters. Normalization helps
	 * ensure better cache hit rates and lets the service work with
	 * a degree of garbage input.
	 *
	 * This method can be overwritten for custom behavior, and
	 * by default it just calls the {@link normalizeURL} method
	 * from utilities.
	 *
	 * @param {String|URL} url The URL to normalize
	 * @param {URL} base A base URL to use to build an absolute URL, if the input URL is relative.
	 * @returns {URL} A normalized URL
	 */
	normalizeURL(url, base) {
		return normalizeURL(url, base, this.opts.default_scheme);
	}

	/**
	 * Pick the best resolver to handle a given URL from the list of
	 * known {@link Resolver} instances. This also caches the
	 * decision in a LRU cache to speed up subsequent URLs from
	 * the same domain.
	 * @param {String|URL} url The URL to pick a resolver for. If this is a String, it will be run through {@link LinkService#normalizeURL} first.
	 * @returns {Resolver} The resolver instance to use for processing.
	 */
	pickResolver(url) {
		if ( ! (url instanceof URL) )
			url = this.normalizeURL(url);

		const host = url.host;

		let resolver = this.domain_cache.get(host);
		if ( resolver !== undefined )
			return resolver;

		for (const r of this.resolvers) {
			if ( r.handles(host) ) {
				resolver = r;
				break;
			}
		}

		if ( ! resolver ) {
			if ( tldExists(url.hostname) )
				resolver = this.metadata_resolver;
			else
				resolver = null;
		}

		this.domain_cache.set(host, resolver);
		return resolver;
	}

	/**
	 * Normalize a URL and use {@link Resolver} instances to retrieve metadata
	 * for the URL, keeping track of redirects and looking up SafeBrowsing
	 * records on all URLs. Essentially: the heart of the service.
	 *
	 * Returns a response, as in: {@tutorial responses}
	 *
	 * @param {String|URL} url The URL to resolve.
	 * @returns {Object} The metadata to be sent to clients.
	 */
	async resolve(url) {
		try {
			url = this.normalizeURL(url);
		} catch (err) {
			if ( err instanceof BaseError ) {
				return {
					error: err.getMessage() ?? err.toString()
				}
			} else
				throw err;
		}

		const visited_urls = [],
			resolvers = new Map,
			cookies = new CookieJar(),
			hsts = new HSTSCache();
		let redirects = 0,
			referrer = null,
			result = null,
			force_metadata = false;

		// Main Resolve Loop
		visited_urls.push(url);

		while (url && redirects < this.opts.max_redirects) {
			if ( ! (url instanceof URL) )
				url = this.normalizeURL(url);

			// Do not handle URLs with non-standard ports.
			// Do not handle URLs without http: or https:
			if ( url.protocol !== 'https:' && url.protocol !== 'http:' ) {
				result = new UnsupportedSchemeError(url);
				break;
			}

			if ( url.port ) {
				const is_https = url.protocol === 'https:',
					expected = is_https ? 443 : 80;

				// eslint-disable-next-line eqeqeq
				if ( url.port != expected ) {
					result = new UnsupportedPortError(url);
					break;
				}
			}

			// Don't allow access to localhost, in a simple way.
			if ( url.host === 'localhost' || url.host === '127.0.0.1' || url.host === '[::1]' ) {
				result = new InvalidHostError(url);
				break;
			}

			let resolver;
			try {
				resolver = force_metadata ? this.metadata_resolver : this.pickResolver(url);
			} catch (err) {
				if ( err instanceof BaseError ) {
					result = err;
					break;
				} else
					throw err;
			}

			if ( ! resolver ) {
				result = new InvalidHostError(url);
				break;
			}

			resolvers.set(url, resolver.name ?? resolver.constructor.name);

			try {
				result = await resolver._run(url, referrer, cookies, hsts);
			} catch (err) {
				if ( err instanceof BaseError ) {
					result = err;
					break;
				} else
					throw err;
			}

			if ( result === UseMetadata || result instanceof UseMetadata ) {
				if ( resolver === this.metadata_resolver )
					throw new RuntimeError('Unexpected response from Metadata Resolver');

				force_metadata = true;

			} else if ( result instanceof Redirect ) {
				referrer = url;
				url = this.normalizeURL(result.url, result.base || referrer);

				if ( ! result.silent ) {
					if ( visited_urls.includes(url) ) {
						result = new RedirectLoopError();
						break;
					}

					visited_urls.push(url);
					redirects++;
				}

				force_metadata = false;

			} else
				url = null;
		}


		// Were we still redirecting?
		let too_many_redirects = false;

		if ( result instanceof Redirect ) {
			result = new TooManyRedirectsError();
			// We never actually loaded the last URL, so remove it
			// from the list to avoid confusion.
			visited_urls.pop();
			too_many_redirects = true;
		}

		// Did we get an error?
		if ( result instanceof BaseError ) {
			let status = result.getStatus?.() ?? result.status;
			result = {
				error: result.getMessage() ?? result.toString()
			};

			if ( status )
				result.status = status;
		}

		if ( ! result )
			result = {
				error: i18nToken('card.error.empty', 'No Information Available')
			};

		// Safety / Shortened Checks
		let unsafe = false;
		const urls = [], url_map = {};
		for (const url of visited_urls)
			urls.push(url_map[url.toString()] = {
				url,
				resolver: resolvers.get(url) ?? null,
				unsafe: false,
				shortened: false,
				flags: []
			});


		if ( this.safety_checks.length || this.shortener_checks.length ) {
			const promises = [];
			for (const check of this.safety_checks) {
				const result = check.check(url_map);
				if ( result instanceof Promise )
					promises.push(result);
			}
			for (const check of this.shortener_checks) {
				const result = check.check(url_map);
				if ( result instanceof Promise )
					promises.push(result);
			}

			if ( promises.length )
				await Promise.all(promises);

			for (const url of urls)
				if ( url.unsafe )
					unsafe = true;
		}

		// Override the shortener check for the last URL. The last URL was
		// always not a redirect.
		if ( ! too_many_redirects )
			urls[urls.length - 1].shortened = false;

		result.unsafe = unsafe;
		result.urls = urls;

		return result;
	}

}

LinkService.ALLOW_UNSAFE_IMAGES = Symbol('ALLOW_UNSAFE_IMAGES');

// If you add stuff here, remember to add them to the jsdoc on the class as
// well so they end up in the documentation.

LinkService.DEFAULT_OPTS = {
	// The maximum number of redirects to follow.
	max_redirects: 20,

	// Number of domains to cache in the resolver look-up table.
	domain_cache_size: 300,

	// Whether or not to disable the use of tag tokens for emitting HTML tags.
	disable_tags: false,

	// The URL of a Safe Browsing cache server. Safe Browsing only runs when this is set.
	safe_browsing_server: null,

	// Whether or not to use Cloudflare DNS for safety checks.
	use_cloudflare_dns: true,

	// Whether or not to use DNS0 Zero for safety checks.
	use_dnszero: false,

	// Whether or not to use the URL Shortener List for shortener checks.
	use_shortener_list: true,

	// Whether or not to check URLs against Grabify.
	use_grabify_check: true,

	// Whether or not to check URLs against an ip logger list.
	use_iplogger_list: true,

	// Whether or not to use the mmmagic package to detect mime types.
	use_mmmagic: true,

	// Whether or not to log to the console when a request returns an error response.
	log_error_responses: false,

	// The user agent to use when making requests.
	user_agent: `Mozilla/5.0 (compatible; FFZLinkService/${PACKAGE.version}; +https://github.com/FrankerFaceZ/Link-Service)`,

	// The default referrer to use when making requests.
	default_referrer: null,

	// The number of ms to wait for a remote server before timing out.
	resolver_timeout: 4000,

	// Image Stuff
	// The built-in implementation is made for use with
	// https://github.com/willnorris/imageproxy but the function can be
	// replaced fairly easily.
	image_proxy: {
		host: null,
		key: null
	}
}

LinkService.VERSION = PACKAGE.version;


export { BaseError, ShortenerCheck, SafetyCheck };

export default LinkService;
