'use strict';

import cheerio from 'cheerio';
import fetch from './fetch-timeout';
import {UseMetadata, Redirect} from './results';
import RuntimeError, {UnhandledURLError, TimeoutError, NetworkError} from './errors/runtime';
import DocumentBuilder from './builder';

const REFRESH_TARGET = /\d+;\s*url=(.+)$/i;

/**
 * CacheInterface is used by {@link Resolver} to read and write from a
 * generic cache
 */
export class CacheInterface {
	/**
	 * Get an item from the cache.
	 *
	 * @param {String} key The item key to read this item from.
	 * @param {CacheOptions} [options] Options for the cache when getting
	 * this result.
	 * @returns {CacheResult} The cached item. Can be `null`.
	 */
	get(key, options) {
		throw new Error('Not Implemented');
	}

	/**
	 * Save an item to the cache.
	 *
	 * The return value of this method is never checked.
	 *
	 * @param {String} key The item key to save this item at.
	 * @param {Object} value The actual item to save to the cache.
	 * @param {CacheOptions} [options] Options for the cache.
	 */
	set(key, value, options) {
		throw new Error('Not Implemented');
	}
}

/**
 * CacheResult
 *
 * @typedef {Object} CacheResult
 * @property {Boolean} hit Whether or not the item was found in the cache
 * @property {Object} value The item from the cache. May be `null`.
 */

/**
  * CacheOptions
  *
  * @typedef {Object} CacheOptions
  * @property {Number} ttl The number of seconds this item should remain cached.
  */


/**
 * Request Context
 *
 * @typedef {Object} RequestContext
 * @property {String|URL} url Automatic. The current URL of the request. May change
 * after {@link Resolver#transformURL}.
 * @property {URL} original_url Automatic. The original URL of the request.
 * @property {FetchResponse} request Automatic. The `fetch` request object
 * for this request. Not available within {@link Resolver#transformURL}.
 *
 * @property {URL} referrer The referrer of the request. May be changed
 * within {@link Resolver#transformURL} to change the `Referer` header
 * sent with the request.
 * @property {Boolean} [skip_request] If set to true, no fetch request
 * will be performed and instead {@link Resolver#processBody} will be
 * called immediately with only null values and this context object.
 * @property {Function} [fetch] The version of fetch to use. Useful in case
 * you want to wrap fetch with something to, for example, automatically
 * renew a client credential token when necessary and add it to the
 * request. The custom fetch implementation should wrap our custom
 * {@link fetch} with timeout support or provide an equivilent API.
 * @property {Object} [headers] An optional object of headers to send
 * with the request. Has no effect if set outside {@link Resolver#transformURL}.
 * @property {Object} [options] An optional object of options to send to
 * fetch when performing the request. Has no effect is set outside {@link Resolver#transformURL}.
 * @property {Number} [timeout] The number of miliseconds after which the
 * fetch request should time out. Overrides the default value from the
 * {@link LinkService} options. Has no effect if set outside {@link Resolver#transformURL}.
 * @property {Boolean} [follow_redirect=true] Whether or not the
 * {@link Resolver} should automatically follow redirects when fetching
 * the resource. Supports `Location` and `Refresh` header-based redirects.
 * @property {String} [cache_key] The key to use when reading and writing
 * to the configured cache. If this is not set, the request URL will be
 * used instead. This should be used when more than one URL may describe
 * the same resource. If explicitly set to `false`, caching will be
 * disabled. This should probably never be done.
 * @property {CacheOptions} [cache_opts] An optional set of extra
 * options to be passed to cache methods. This can be used to override
 * default timeouts, etc. depending on your {@link CacheInterface}.
 * @property {String} [parse] Override how the response body should be
 * parsed before {@link Resolver#processBody} is called. This can be
 * set in either {@link Resolver#transformURL} or {@link Resolver#processHeaders}.
 * Valid values are: `buffer`, `json`, `html`, and `xml`.
 * @property {Object} [response] The data to return as a response from
 * the {@link Resolver} for this request. If {@link Resolver#processBody}
 * returns `null` or `undefined`, this value is returned instead. This
 * can also be used to return data without ever processing the response
 * body by setting it and then returning a falsey value from
 * {@link Resolver#processHeaders}.
 */

/**
 * Resolvers make requests, parse responses, and format data.
 *
 * @param {LinkService} service The service this Resolver is registered to.
 */
class Resolver {

	constructor(service) {
		this.service = service;
		this.sort = this.constructor.sort ?? 0;
		this.hosts = this.constructor.hosts;
	}

	/**
	 * Determine whether or not this Resolver can handle a request
	 * for a given domain.
	 *
	 * The default implementation checks if Resolver class has a
	 * static array called `hosts` and, if so, checks to see if
	 * the host is in that list.
	 *
	 * If you're not using the `hosts` array, you must override
	 * the method. Otherwise, it will throw an error.
	 *
	 * @example
	 * class MyResolver extends Resolver { };
	 * MyResolver.hosts = ['example.org'];
	 *
	 * const inst = new MyResolver(link_service);
	 *
	 * inst.handles('google.com'); // === false
	 * inst.handles('example.org'); // === true
	 * inst.handles('test.example.org'); // === true
	 *
	 * @param {String} host The domain to check.
	 * @returns {Boolean} Whether or not this Resolver can handle requests for that domain.
	 */
	handles(host) {
		if ( this.hosts ) {
			if ( this.hosts.includes(host) )
				return true;

			let i = this.hosts.length;
			while (i--) {
				if ( host.endsWith(this.hosts[i]) )
					return true;
			}

			return false;
		}

		throw new Error('Not Implemented');
	}

	/**
	 * Create a new {@link DocumentBuilder} instance. Purely a convenience method.
	 * @returns {DocumentBuilder} New instance.
	 */
	builder() {
		return new DocumentBuilder();
	}

	/**
	 * Create a URL for passing an image through a proxy, used to
	 * avoid leaking end-user IP addresses and to perform sanity
	 * checks on the contents of the image.
	 *
	 * This just calls {@link LinkService#proxyImage} as a convenience
	 * method.
	 *
	 * @param {String|URL} url The URL to proxy.
	 * @param {Number} [size=324] The size parameter to pass to the proxy server.
	 * @returns {String} The proxied image URL, or `null` if no proxy server is configured.
	 */
	proxyImage(...args) {
		return this.service.proxyImage(...args);
	}

	/**
	 * The first method called while a Resolver works. This method is used for
	 * further processing a URL and determining what resource we actually want
	 * to fetch from the remove host, if any.
	 *
	 * Here, we can process a URL and, rather than requesting the normal
	 * webpage, redirect the request to the site's API. If we determine that we
	 * can't actually handle a specific URL, we can also fall back to the
	 * metadata provider here or outright redirect to another URL.
	 *
	 * We can also set `cache_key` on the ctx object to improve the cache hit
	 * rate when multiple URLs can describe the same resource.
	 *
	 * @example
	 * transformURL(url, ctx) {
	 *     if ( ! url.pathname.startsWith('/video/') )
	 *         return UseMetadata;
	 *
	 *     const video_id = url.pathname.slice(7);
	 *     ctx.cache_key = `my-service--${video_id}`;
	 *     return `https://api.service.example/v2/video?id=${video_id}`;
	 * }
	 *
	 * @param {URL} url The URL we're processing.
	 * @param {RequestContext} ctx A context object that will be maintained
	 * while processing this URL to keep track of extra data.
	 * @returns {String|URL|UseMetadata|Redirect} If a String or URL are
	 * returned, they will be requested. If {@link UseMetadata} or
	 * {@link Redirect} are returned, the Resolver will pass control back
	 * to its {@link LinkService}.
	 */
	transformURL(url, ctx) { // eslint-disable-line no-unused-vars
		return url;
	}

	/**
	 * The second method called while a Resolver works. This method is used
	 * for determining what to do once we've received response headers.
	 *
	 * The default implementation of this method just returns `request.ok`
	 * to request response body handling if the request is okay. (Meaning:
	 * the status code was in the range of 200-299.)
	 *
	 * In some cases, we'll receive all the information we need in just the
	 * response headers. In those cases, we can return a falsey value from
	 * this method to avoid parsing the response body at all.
	 *
	 * If we need to redirect, or we determine that the metadata resolver
	 * would have better results, we can also fall back to those behaviors.
	 *
	 * > **Note:** If `ctx.follow_redirects` has not been set to false,
	 * > the {@link Resolver} instance will automatically handle `Location`
	 * > and `Refresh` headers. The following example is only an example
	 * > and does not need to be replicated in your own functions.
	 *
	 * @example
	 * processHeaders(request, ctx) {
	 *     if ( ! request.ok )
	 *         return false;
	 *
	 *     if ( request.headers.has('Location') )
	 *         return new Redirect(request.headers.get('Location'), ctx.url);
	 *
	 *     return true;
	 * }
	 *
	 * @param {FetchResponse} request The result after waiting for our `fetch`
	 * request to resolve.
	 * @param {RequestContext} ctx A context object that will be maintained
	 * while processing this URL to keep track of extra data.
	 * @returns {Boolean|UseMetadata|Redirect} If {@link UseMetadata} or
	 * {@link Redirect} are returned, the Resolver will pass control back
	 * to its {@link LinkService}. Otherwise, the truthiness of the return
	 * value will be used to determine whether or not we should spend the
	 * time to handle the response body.
	 */
	processHeaders(request, ctx) { // eslint-disable-line no-unused-vars
		return request.ok;
	}

	/**
	 * The final method called while a Resolver works. This method is used
	 * for handling the parsed response body. If this method returns a
	 * non-`null` value, that value will be the result emitted from the
	 * {@link LinkService}.
	 *
	 * Depending on the parsing mode, `body` will be one of several different
	 * objects. If the `mode` is `buffer`, then `body` will be a {@link Buffer}
	 * instance as returned from {@link node-fetch}. If `mode` is `json`, then
	 * `body` will be the parsed JSON object.
	 *
	 * If `mode` is `html` or `xml`, then `body` will be a
	 * [cheerio](https://www.npmjs.com/package/cheerio) instance.
	 *
	 * @example
	 * processBody(body, mode) {
	 *     if ( ! body?.video || mode !== 'json' )
	 *         return UseMetadata;
	 *
	 *     return {
	 *         v: 5,
	 *         accent: '#f00',
	 *         short: this.builder()
	 *             .setTitle(body.video.title)
	 *             .setSubtitle('Example Service')
	 *             .setLogo(SERVICE_LOGO)
	 *             .addImage(body.video.thumbnail)
	 *             .addField(
	 *                 i18nToken('embed.example.length', 'Length'),
	 *                 formatToken('duration', body.video.length)
	 *             )
	 *     };
	 * }
	 *
	 * @param {Buffer|Object|cheerio} body The parsed response body. This can
	 * be one of several different objects, depending on the detected
	 * `Content-Type` of the response. If `ctx.parse` is set, the response
	 * body will be parsed in that manner rather than through content detection.
	 * @param {String} mode The mode used for parsing the response body. This
	 * will be one of: `buffer`, `json`, `html`, or `xml`
	 * @param {RequestContext} ctx A context object that will be maintained
	 * while processing this URL to keep track of extra data.
	 * @param {FetchResponse} request The result of our `fetch` request, in
	 * case it's still needed for some reason.
	 * @returns {Object|UseMetadata|Redirect} If an object is returned, that
	 * data will be used as the final response. If {@link UseMetadata} or
	 * {@link Redirect} are returned, the Resolver will pass control back
	 * to its {@link LinkService}.
	 */
	processBody(body, mode, ctx, request) { // eslint-disable-line no-unused-vars
		throw new Error('Not Implemented');
	}

	async _run(url, referrer) {
		const ctx = {
			url,
			original_url: url,
			referrer,
			follow_redirects: true
		};

		// Step 1. URL Transformation
		const request_url = await this.transformURL(url, ctx);
		if ( ! request_url )
			throw new UnhandledURLError(url);
		else if ( request_url === UseMetadata || request_url instanceof UseMetadata || request_url instanceof Redirect )
			return request_url;

		// Step 2. Caching
		if ( this.service.cache && ctx.cache_key !== false ) {
			if ( ctx.cache_key == null )
				ctx.cache_key = request_url.toString();

			if ( ctx.cache_key ) {
				const resp = await this.service.cache.get(ctx.cache_key, ctx.cache_opts);
				if ( resp?.hit ) {
					let value = resp.value;
					const type = value?.__type;
					if ( type === 'redirect' )
						value = new Redirect(value.url, value.base);
					else if ( type === 'use-metadata' )
						value = UseMetadata;

					if ( typeof value === 'object' )
						value.cache = 'hit';

					return resp.value;
				}
			}
		}

		// Step 3. The Request
		let data;

		if ( ! ctx.skip_request ) {
			if ( ctx.referrer )
				referrer = ctx.referrer;

			ctx.url = request_url;

			let headers = {
				Referer: referrer ? referrer.toString() : this.service.opts.default_referrer,
				'User-Agent': this.service.opts.user_agent
			};

			if ( ctx.headers )
				headers = {...headers, ...ctx.headers};

			// Let individual resolvers override fetch if they need to.
			const req_fetch = ctx.fetch ?? fetch;

			let options = {
				headers,
				redirect: 'manual',
				size: 5000000,
				timeout: ctx.timeout ?? this.service.opts.resolver_timeout
			};

			if ( ctx.options )
				options = Object.assign(options, ctx.options);

			let request;
			try {
				request = ctx.request = await req_fetch(request_url.toString(), options);

			} catch (err) {
				if ( err.type === 'aborted' )
					throw new TimeoutError;
				else
					throw new NetworkError;
			}

			if ( ! request ) {
				console.error(new RuntimeError('Missing Fetch Result', ctx.fetch), request_url);
				throw new NetworkError();
			}

			// Redirect Check: Support Location for 3xx, and Refresh for all response codes.
			if ( ctx.follow_redirects ) {
				let redirect = null;

				const status = request.status;
				if ( status >= 300 && status < 400 )
					redirect = request.headers.get('Location');
				else if ( request.headers.has('Refresh') ) {
					const match = REFRESH_TARGET.exec(request.headers.get('Refresh'));
					if ( match )
						redirect = match[1];
				}

				if ( redirect ) {
					request.abort();
					const out = new Redirect(redirect, ctx.url);

					if ( this.service.cache && ctx.cache_key )
						await this.service.cache.set(ctx.cache_key, out, ctx.cache_opts);

					return out;
				}
			}

			// Step 4. Process Headers
			let wants_body = await this.processHeaders(request, ctx);
			data = null;

			// Step 5. Process Body
			if ( wants_body === UseMetadata || wants_body instanceof UseMetadata || wants_body instanceof Redirect ) {
				data = wants_body;

			} else if ( wants_body ) {
				// Process the body.
				if ( wants_body === true )
					wants_body = ctx.parse || true;

				if ( wants_body === true ) {
					const content_type = request.headers.get('content-type') || '';
					if ( content_type.includes('application/json') )
						wants_body = 'json';
					else if ( content_type.includes('text/html') || content_type.includes('application/xhtml+xml') )
						wants_body = 'html';
					else if ( content_type.includes('xml') )
						wants_body = 'xml';
				}

				let body, mode = null;

				try {
					if ( wants_body === 'buffer' ) {
						body = await request.buffer();
						mode = 'buffer';

					} else if ( wants_body === 'json' ) {
						body = await request.json();
						mode = 'json';

					} else if ( wants_body === 'html' ) {
						const raw = await request.text();
						body = cheerio.load(raw);
						mode = 'html';

					} else if ( wants_body === 'xml' ) {
						const raw = await request.text();
						body = cheerio.load(raw, {xmlMode: true});
						mode = 'xml';
					}

				} catch (err) {
					request.abort();
					console.error(err);
					return ctx.response;
				}

				data = this.processBody(body, mode, ctx, request);
			}

			// Step 6. Finish up.

			// Make sure we're done. We should be.
			request.abort();

		} else {
			// If we didn't want to make a request, just call
			// processBody directly.

			data = this.processBody(null, null, ctx, null);
		}


		let out = data ?? ctx.response;

		// Make sure we haven't done any oopses with our builders.
		if ( out instanceof DocumentBuilder ) {
			const obj = out.done().toJSON();
			out = {v: 5};

			if ( obj ) {
				if ( ! Array.isArray(obj) ) {
					if ( obj.type === 'header' )
						out.short = obj;
					else
						out.full = obj;

				} else {
					out.full = obj;
					if ( obj[0].type === 'header' )
						out.short = obj[0];
				}
			} else
				out = null;

		} else {
			if ( out?.short instanceof DocumentBuilder )
				out.short = out.short.done();
			if ( out?.full instanceof DocumentBuilder )
				out.full = out.full.done();
		}

		if ( this.service.cache && ctx.cache_key )
			await this.service.cache.set(ctx.cache_key, out, ctx.cache_opts);

		if ( this.service.cache && out )
			out.cache = 'miss';

		if ( ctx.cache_key === false && out )
			out.cache = 'off';

		return out;
	}
}


export default Resolver;
