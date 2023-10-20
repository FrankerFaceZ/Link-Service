'use strict';

/**
 * ShortenerCheck instances check URLs to see if they match a known
 * URL shortener.
 */
class ShortenerCheck {

	constructor(service) {
		this.service = service;

		if ( this.fetch )
			this.fetch = this.service.wrapFetch(this.fetch.bind(this));
		else
			this.fetch = this.service.fetch;
	}

	/**
	 * Get an array of example URLs that this ShortenerCheck will report
	 * as shortened. Used for populating a selection field in
	 * testing clients.
	 *
	 * The default implementation checks if the ShortenerCheck class has
	 * a static array called `examples` and, if so, returns that.
	 *
	 * It is not necessary to provide examples, but examples do
	 * make testing easier.
	 *
	 * @example
	 * class MyCheck extends ShortenerCheck { };
	 * MyCheck.examples = [
	 *     {title: 'Some Page', url: 'https://example.com/'}
	 * ];
	 *
	 * @returns {ExampleURL[]|String[]|URL[]} List of URLs.
	 */
	getExamples() {
		return this.constructor.examples ?? null;
	}

	/**
	 * Check to see if the provided URLs should be considered shortened or
	 * not. This method may return a Promise, but is not required to.
	 *
	 * Rather than returning a value, this method should modify the
	 * CheckedURLs by setting `shortened` to true if necessary and by
	 * adding strings to flags if relevant.
	 *
	 * @param {Object.<string, CheckedURL>} urls The URLs to check.
	 * @returns {Promise|undefined} If a Promise is returned, the
	 * LinkService will wait until the Promise resolves to consider
	 * the URLs checked.
	 */
	check(urls) {
		throw new Error('Not Implemented');
	}

}


/**
 * SimpleShortenerCheck allows you to check single URLs at once
 * using the checkSingle method, while handling iteration over
 * each URL for you.
 *
 * @example
 *
 * const list = new Set();
 *
 * blacklist.add('bit.ly');
 *
 * class SomeShorteners extends SimpleSafetyCheck {
 *     checkSingle(url) {
 *         return blacklist.has(url.toString());
 *     }
 * }
 *
 */
export class SimpleShortenerCheck extends ShortenerCheck {

	/**
	 * Check to see if the provided URL should be considered shortened
	 * or not. Returns a truthy value if the URL is flagged as
	 * shortened.
	 *
	 * If this returns a Promise, the Promise will be awaited.
	 *
	 * @param {URL} url The URL to be tested.
	 * @returns {Promise<Boolean|String>|Boolean|String} The
	 * result of the safety check.
	 */
	checkSingle(url) {
		throw new Error('Not Implemented');
	}

	_handle(data, result) {
		if ( result )
			data.shortened = true;
	}

	check(urls) {
		if ( ! urls )
			return null;

		const promises = [];

		for (const data of Object.values(urls)) {
			const result = this.checkSingle(data.url);
			if ( result instanceof Promise )
				promises.push(result.then(r => this._handle(data, r)));
			else
				this._handle(data, result);
		}

		if ( promises.length )
			return Promise.all(promises);
	}
}


export class UrlShortenerList extends ShortenerCheck {


	constructor(service, source) {
		super(service);

		this.source = source || 'https://raw.githubusercontent.com/PeterDaveHello/url-shorteners/master/list';
	}


	refreshData() {
		if ( ! this._refresh_wait )
			this._refresh_wait = this._refreshData().catch(err => {
				console.error('unable to load url shortener list', err);
				if ( ! this.data )
					this.data = new Set();
				this.loaded = true;

			}).finally(() => {
				this._refresh_wait = null;
			});

		return this._refresh_wait;
	}

	async _refreshData() {
		this.loaded = false;
		const data = await this.fetch(this.source)
			.then(resp => resp.ok ? resp.text() : null)
			.catch(() => null);

		// If we got data, do something about it.
		if ( data ) {
			const lines = data
				.split(/\s*\n\s*/)
				.filter(line => line.length && ! line.startsWith('#'))
				.map(line => line.toLowerCase());

			this.data = new Set(lines);

		} else
			this.data = new Set();

		console.log('Loaded %d shortener domains.', this.data.size);
		this.loaded = true;
	}

	check(urls) {
		if ( ! urls )
			return null;

		if ( ! this.loaded )
			return this.refreshData().then(() => this.check(urls));

		for(const data of Object.values(urls)) {
			let url = data.url;
			if (!(url instanceof URL))
				url = new URL(url);

			if ( this.data.has(url.hostname.toLowerCase()) )
				data.shortened = true;
		}
	}

}


export default ShortenerCheck;
