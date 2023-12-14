'use strict';

export const WrapSymbol = Symbol('Wrapped');

/**
 * Wrap a fetch API, automatically injecting an abort controller for each
 * request as well as adding support for automatic timeouts.

 * @param {Function} original The original fetch method to wrap.
 * @returns {Function} The wrapped fetch method.
 */
function wrapFetch(original, abortController) {
	// Don't re-wrap.
	if (original[WrapSymbol])
		return original;

	/**
	 * Make an HTTP request using fetch. This uses
	 * [abort-controller](https://www.npmjs.com/package/abort-controller)
	 * for generating the appropriate signal to abort a fetch request.
	 *
	 * @param {String|URL} url The URL to fetch
	 * @param {Object} options Options to pass along to the underlying `fetch` request.
	 * @param {Number} options.timeout The number of miliseconds to wait before timing out the request.
	 * @param {CookieJar} [cookies] A CookieJar for managing cookies for this request sequence.
	 * @param {HSTSCache} [hsts] A HSTSCache for respecting Strict-Transport-Security headers.
	 * @returns {Promise} The resulting fetch request.
	 */
	const result = async function fetch(url, options, cookies, hsts) {
		let timeout;
		const controller = new abortController(),
			abort = () => {
				controller.abort();
				if ( timeout )
					clearTimeout(timeout);
				timeout = false;
			};

		if ( options && options.timeout )
			timeout = setTimeout(abort, options.timeout);

		let opts = {
			...options,
			signal: controller.signal,
			timeout: undefined,
			http_proxy: undefined
		};

		if (!(url instanceof URL))
			url = new URL(url);

		if ( hsts )
			url = hsts.upgrade(url);

		if ( cookies )
			cookies.writeCookies(url, opts);

		//console.log('out-headers', opts.headers);

		let target_url = url;

		if ( options?.http_proxy && ( ! options.http_proxy.shouldProxy || options.http_proxy.shouldProxy(url) ) ) {
			const body = JSON.stringify({
				url: url.toString(),
				method: options.method ?? undefined,
				headers: options.headers,
				body: options.body
			});

			target_url = options.http_proxy.url;

			opts = {
				method: options.http_proxy.method ?? 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body,
				signal: opts.signal,
			};

			const sig = await options.http_proxy.sign(url, body, opts);
			if ( sig )
				opts.headers['X-Signature'] = sig;
		}

		const out = original(target_url, opts).then(resp => {
			if ( cookies )
				cookies.readCookies(url, resp);

			if ( hsts ) {
				const sts = resp.headers.get('Strict-Transport-Security');
				if ( sts )
					hsts.setFromHeader(url, sts);
			}

			resp.textLimit = textLimit;
			resp.jsonLimit = jsonLimit;
			resp.abort = abort;
			return resp;
		});

		out.abort = abort;
		return out;
	}

	result[WrapSymbol] = true;
	return result;

}



const CHARSET_REGEX = /\bcharset=([^;]+)/;

function jsonLimit(limit) {
	if ( ! limit )
		return this.json();

	return this.textLimit(limit).then(resp => JSON.parse(resp));
}

async function textLimit(limit) {
	if ( ! limit )
		return this.text();

	// We need the encoding.
	const type = this.headers.get('Content-Type'),
		match = type && CHARSET_REGEX.exec(type),
		encoding = match && match[1] ? match[1] : 'utf-8';

	const limited = this.body.pipeThrough(new TransformStream({
		async transform(chunk, controller) {
			if ( limit <= 0 ) return;
			if ( chunk.length > limit ) {
				controller.enqueue(chunk.subarray(0, limit));
				limit = 0;
			} else {
				controller.enqueue(chunk);
				limit -= chunk.length;
			}
		}
	}));

	// Make our decoder.
	let decoder;
	try {
		decoder = new TextDecoderStream(encoding);
	} catch(err) {
		// Fallback to UTF-8
		decoder = new TextDecoderStream();
	}

	const decoded = limited.pipeThrough(decoder);

	let result = '';
	for await (const chunk of decoded)
		result += chunk;

	return result;
}


export default wrapFetch;
