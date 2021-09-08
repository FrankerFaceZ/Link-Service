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
 * @returns {Promise} The resulting fetch request.
 */
function fetch(url, options) {
	if ( ! options || ! options.timeout )
		return og_fetch(url, options);

	let timeout;
	const controller = new AbortController(),
		abort = () => {
			controller.abort();
			if ( timeout )
				clearTimeout(timeout);
			timeout = false;
		}/*,
		timeout_fn = val => {
			if ( timeout !== false ) {
				clearTimeout(timeout);
				if ( val > 0 )
					timeout = setTimeout(abort, val);
			}
		}*/;

	if ( options.timeout )
		timeout = setTimeout(abort, options.timeout);

	const out = og_fetch(url, {
		...options,
		signal: controller.signal,
		timeout: undefined
	}).then(resp => {
		resp.abort = abort;
		//resp.timeout = timeout_fn;
		return resp;
	});

	out.abort = abort;
	//out.timeout = timeout_fn;

	return out;
}

export default fetch;
