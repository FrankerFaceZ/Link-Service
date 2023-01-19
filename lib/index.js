'use strict';

import {tldExists} from 'tldjs';
import {URL} from 'url';
import crypto from 'crypto';
import requireAll from 'require-all';
import LRUCache from 'mnemonist/lru-cache';

import normalizeURL from './normalize-url';
import {InvalidHostError, UnsupportedPortError, UnsupportedSchemeError} from './errors/url';
import {UseMetadata, Redirect} from './results';
import {RuntimeError, RedirectLoopError, TooManyRedirectsError} from './errors/runtime';
import Resolver from './resolver';
import SafetyCheck, {SafeBrowsing} from './safetycheck';

import Metadata from './metadata';
import BaseError from './errors/base';
import {i18nToken} from './builder';
import CookieJar from './cookie-jar';

const PACKAGE = require('../package.json');

function b64tourl(data) {
	return data.replace(/\+/g, '-').replace(/\//g, '_');
}


/**
 * The LinkService class manages {@link Resolver} instances, stores
 * configuration, and performs the main look-up look for links including
 * SafeBrowsing hits if configured.
 *
 * @param {Object} [opts] Options for initializing the serice.
 * @param {CacheInterface} [opts.cache] A cache interface for use in caching intermediate and final responses.
 * @param {Number} [opts.max_redirects=20] The maximum number of redirects to follow.
 * @param {Number} [opts.domain_cache_size=300] The maximum number of domains to cache in the LRU cache.
 * @param {String} [opts.safe_browsing_server] The URL of a Google SafeBrowsing API server to use for looking up SafeBrowsing data.
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

		this.domain_cache = new LRUCache(this.opts.domain_cache_size);
		this.resolvers = [];
		this.safety_checks = [];

		if ( this.opts.cache )
			this.cache = this.opts.cache;

		this.metadata_resolver = new Metadata(this);

		if ( this.opts.safe_browsing_server )
			this.registerSafetyCheck(new SafeBrowsing(this, this.opts.safe_browsing_server));
	}

	/**
	 * Register all of the default resolvers that come packaged with
	 * the LinkService. A list of those resolvers can be found at
	 * {@link https://github.com/FrankerFaceZ/link-service/tree/master/lib/resolvers}
	 */
	registerDefaultResolvers() {
		requireAll({
			dirname: `${__dirname  }/resolvers`,
			resolve: module => {
				if ( module?.default )
					this.registerResolver(module.default);
			}
		});
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
		if ( resolver && resolver.prototype instanceof Resolver )
			resolver = new resolver(this);

		this.resolvers.push(resolver);
		this.resolvers.sort((a, b) => (b.priority ?? b.constructor.priority ?? 0) - (a.priority ?? a.constructor.priority ?? 0));
		this.domain_cache.clear();

		return resolver;
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
						example.resolver = resolver.constructor.name;

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
	 * @param {String|URL} url The URL to proxy.
	 * @param {Number} [size=324] The size parameter to pass to the proxy server.
	 * @returns {String} The proxied image URL, or `null` if no proxy server is configured.
	 */
	proxyImage(url, size = 324) {
		const host = this.opts.image_proxy?.host;
		if ( host === LinkService.ALLOW_UNSAFE_IMAGES )
			return url;
		else if ( ! host )
			return null;

		if ( typeof size !== 'string' )
			size += ',fit';

		url = url.toString();

		let signature = '';
		if ( this.opts.image_proxy.key )
			signature = `,s${b64tourl(crypto.createHmac('SHA256', this.opts.image_proxy.key).update(url).digest('base64'))}`;

		return `${host}/${size}${signature}/${url}`;
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
			cookies = new CookieJar();
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

			try {
				result = await resolver._run(url, referrer, cookies);
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
				if ( visited_urls.includes(url) ) {
					result = new RedirectLoopError();
					break;
				}

				visited_urls.push(url);
				force_metadata = false;

				redirects++;

			} else
				url = null;
		}


		// Were we still redirecting?
		if ( result instanceof Redirect )
			result = new TooManyRedirectsError();

		// Did we get an error?
		if ( result instanceof BaseError ) {
			result = {
				error: result.getMessage() ?? result.toString()
			}
		}

		if ( ! result )
			result = {
				error: i18nToken('card.error.empty', 'No Information Available')
			};


		// Safety Checks
		let unsafe = false;
		const urls = [], url_map = {};
		for (const url of visited_urls)
			urls.push(url_map[url.toString()] = {
				url,
				unsafe: false,
				flags: []
			});

		if ( this.safety_checks.length ) {
			const promises = [];
			for (const check of this.safety_checks)
				promises.push(check.check(url_map));

			await Promise.all(promises);

			for (const url of urls)
				if ( url.unsafe )
					unsafe = true;
		}

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

	// The URL of a Safe Browsing cache server. Safe Browsing only runs when this is set.
	safe_browsing_server: null,

	// The user agent to use when making requests.
	user_agent: `Mozilla/5.0 (compatible; FFZBot/${PACKAGE.version}; +https://www.frankerfacez.com)`,

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


export default LinkService;
