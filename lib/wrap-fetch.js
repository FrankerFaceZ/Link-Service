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
	 * @returns {Promise} The resulting fetch request.
	 */
	const result = function fetch(url, options, cookies) {
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

		const opts = {
			...options,
			signal: controller.signal,
			timeout: undefined
		};

		if ( cookies )
			cookies.writeCookies(url, opts);

		const out = original(url, opts).then(resp => {
			if ( cookies )
				cookies.readCookies(url, resp);

			resp.abort = abort;
			return resp;
		});

		out.abort = abort;
		return out;
	}

	result[WrapSymbol] = true;
	return result;

}

export default wrapFetch;
