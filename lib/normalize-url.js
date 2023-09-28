'use strict';

let URL = global.URL;
if ( ! URL )
	URL = require('url').URL;

import {RelativeURLError, UnsupportedSchemeError, MalformedURL} from './errors/url';

const SCHEME = /^(?:([a-z][a-z0-9+.-]*):)?(.+)$/i;

/**
 * Normalize a URL.
 *
 * This adds a scheme to URLs without a scheme, ensures that the scheme is
 * either HTTP or HTTPS, removes search hashes, removes trailing dots from
 * hostnames, and removes garbage query parameters such as `utm_` tracking
 * parameters to slim down links for better cache hit rates.
 *
 * If no base URL is provided and the URL is a relative URL, a {@link RelativeURLError}
 * will be thrown. If the scheme is not HTTP or HTTPS, an {@link UnsupportedSchemeError}
 * will be thrown.
 *
 * @param {String|URL} url The URL to normalize.
 * @param {URL} base The base URL for processing relative URLs.
 * @param {String} [default_scheme='http'] The default scheme to set if a URL has no scheme.
 * @returns {URL} The normalized URL
 */
function normalizeURL(url, base, default_scheme = 'http') {
	let parsed;

	if ( ! (url instanceof URL) ) {
		// Remove excess whitespace.
		url = url.trim();

		// Scheme Normalization
		const match = SCHEME.exec(url);
		let scheme = match[1], trail = match[2];
		const had_scheme = scheme != null && scheme.length;

		// If there's no scheme and we have a base URL, then this is a relative
		// URL and we should treat it as such.
		if ( ! had_scheme && base )
			try {
				parsed = new URL(url, base);
			} catch (err) {
				throw new MalformedURL(url);
			}

		else {
			// Otherwise, we need to validate the scheme and all that.
			if ( ! had_scheme )
				scheme = default_scheme;
			else
				scheme = scheme.toLowerCase();

			if ( scheme !== 'http' && scheme !== 'https' )
				throw new UnsupportedSchemeError(url);

			if ( ! trail.startsWith('//') ) {
				if ( trail.startsWith('/') ) {
					throw new RelativeURLError(url);
				}

				trail = `//${trail}`;
			}

			try {
				parsed = new URL(`${scheme}:${trail}`);
			} catch (err) {
				throw new MalformedURL(url);
			}
		}

	} else {
		parsed = url;

		if ( parsed.protocol !== 'https:' && parsed.protocol !== 'http:' )
			throw new UnsupportedSchemeError(parsed);
	}

	// We don't care about hashes, they aren't sent to servers anyway.
	parsed.hash = '';

	// Normalize Host
	if ( parsed.hostname ) {
		// Remove trailing dot
		if ( parsed.hostname.endsWith('.') )
			parsed.hostname = parsed.hostname.slice(0, -1);
	}

	// Remove unwanted query parameters
	for (const key of [...parsed.searchParams.keys()]) {
		if ( key === 'fbclid' || key === 'igshid' || key.startsWith('utm_') )
			parsed.searchParams.delete(key);
	}

	// Sort for good measure.
	parsed.searchParams.sort();

	return parsed;
}

export default normalizeURL;
