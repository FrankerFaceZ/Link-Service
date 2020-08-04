'use strict';

/**
 * When a {@link Resolver} returns an instance of this class, the
 * {@link LinkService} will perform a redirect. The current URL
 * will be recorded, and a new lookup will be performed for the
 * new URL.
 *
 * @param {String|URL} url The URL to redirect to.
 * @param {URL} base The base URL for the redirect. Generally, this is the current URL. Used for resolving relative URLs.
 */
export class Redirect {
	constructor(url, base) {
		this.url = url;
		this.base = base;
	}

	toJSON() {
		return {
			__type: 'redirect',
			url: this.url,
			base: this.base
		}
	}
}

/**
 * When a {@link Resolver} returns this class or an instance of it,
 * the {@link LinkService} will fall back to using the metadata
 * resolver to handle the request.
 *
 * This is useful for falling back to default behavior for pages
 * that don't contain a site's normal content, such as help pages,
 * documentation, etc.
 *
 * @example
 * return UseMetadata;
 *
 */
export class UseMetadata {
	toJSON() {
		return {
			__type: 'use-metadata'
		}
	}
}

UseMetadata.toJSON = () => ({__type: 'use-metadata'});
