'use strict';

import AbortController from 'abort-controller';
import og_fetch from 'node-fetch';

/**
 * Make an HTTP request using [node-fetch](https://www.npmjs.com/package/node-fetch).
 * This uses [abort-controller](https://www.npmjs.com/package/abort-controller) for
 * generating the appropriate signal to abort a fetch request.
 *
 * @param {String|URL} url The URL to fetch
 * @param {Object} options Options to pass along to the underlying `fetch` request.
 * @param {Number} options.timeout The number of miliseconds to wait before timing out the request.
 * @param {CookieJar} [cookies] A CookieJar for managing cookies for this request sequence.
 * @returns {Promise} The resulting fetch request.
 */
function fetch(url, options, cookies) {
	let timeout;
	const controller = new AbortController(),
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

	const out = og_fetch(url, opts).then(resp => {
		if ( cookies )
			cookies.readCookies(url, resp);

		resp.abort = abort;
		return resp;
	});

	out.abort = abort;
	return out;
}

export default fetch;
