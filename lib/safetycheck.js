'use strict';

const { Resolver } = require('dns').promises;

/**
 * CheckedURL
 *
 * @typedef {Object} CheckedURL
 * @property {String} URL the URL that was checked
 * @property {Boolean} unsafe Whether or not the URL should
 * be considered unsafe.
 * @property {Boolean} shortened Whether or not the URL matches
 * a known URL shortener.
 * @property {String[]} flags A list of reasons why the URL
 * is unsafe.
 */


/**
 * SafetyCheck instances check URLs for potential safety issues.
 *
 * @param {LinkService} service The service this SafetyCheck is
 * registered to.
 */
class SafetyCheck {

	constructor(service) {
		this.service = service;

		if ( this.fetch )
			this.fetch = this.service.wrapFetch(this.fetch.bind(this));
		else
			this.fetch = this.service.fetch;
	}

	/**
	 * Get an array of example URLs that this SafetyCheck can handle.
	 * Used for populating a selection field in testing clients.
	 *
	 * The default implementation checks if the SafetyCheck class has
	 * a static array called `examples` and, if so, returns that.
	 *
	 * It is not necessary to provide examples, but examples do
	 * make testing easier.
	 *
	 * @example
	 * class MyCheck extends SafetyCheck { };
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
	 * Check to see if the provided URLs should be considered safe or
	 * not. This method may return a Promise, but is not required to.
	 *
	 * Rather than returning a value, this method should modify the
	 * CheckedURLs by setting `unsafe` to true if necessary and by
	 * adding strings to flags.
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
 * SimpleSafetyCheck allows you to check single URLs at once
 * using the checkSingle method, while handling iteration over
 * each URL for you.
 *
 * @example
 *
 * const blacklist = new Set();
 *
 * blacklist.add('http://www.google.com/');
 *
 * class BlacklistedURLs extends SimpleSafetyCheck {
 *     checkSingle(url) {
 *         return blacklist.has(url.toString());
 *     }
 * }
 *
 */
export class SimpleSafetyCheck extends SafetyCheck {

	constructor(service) {
		super(service);
		this.name = this.constructor.name;
	}

	/**
	 * Check to see if the provided URL should be considered safe
	 * or not. Returns a truthy value if the URL is flagged as
	 * potentially unsafe. Return a string to give a specific
	 * reason, otherwise the name of the check will be used.
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
		if ( ! result )
			return;

		data.unsafe = true;

		if ( ! Array.isArray(result) )
			result = [result];

		for (let flag of result) {
			if ( typeof flag === 'string' )
				flag = `${this.name}:${flag}`;
			else
				flag = this.name;

			if ( ! data.flags.includes(flag) )
				data.flags.push(flag);
		}
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


export class SafeBrowsing extends SafetyCheck {

	constructor(service, url) {
		super(service);
		this.url = url;
	}

	async check(urls) {
		if ( ! this.url || ! urls )
			return null;

		const data = await this.fetch(`${this.url}/v4/threatMatches:find`, {
			method: 'POST',
			body: JSON.stringify({
				threatInfo: {
					threatTypes: ['UNWANTED_SOFTWARE', 'MALWARE', 'SOCIAL_ENGINEERING'],
					platformTypes: ['ANY_PLATFORM'],
					threatEntryTypes: ['URL'],
					threatEntries: Object.keys(urls).map(url => ({url}))
				}
			}),
			headers: {
				'Content-Type': 'application/json'
			},
			timeout: 1000
		}).then(resp => resp.ok ? resp.json() : null).catch(err => {
			return null;
		});

		if ( ! data || ! Array.isArray(data.matches) || ! data.matches.length )
			return null;

		for (const match of data.matches) {
			const url = match?.threat?.url,
				data = urls[url];
			if ( ! data )
				continue;

			const type = `SafeBrowsing:${match.threatType}`;
			data.unsafe = true;
			if ( ! data.flags.includes(type) )
				data.flags.push(type);
		}
	}

}

SafeBrowsing.examples = [
	{title: 'Malware', url: 'http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/MALWARE/URL/'}
];


export class CloudflareDNS extends SimpleSafetyCheck {

	constructor(service) {
		super(service);

		this.resolver = new Resolver();
		this.resolver.setServers([
			'1.1.1.2' // Cloudflare DNS + Malware Detection
		]);
	}

	async checkSingle(url) {
		if (!(url instanceof URL))
			url = new URL(url);

		let result;
		try {
			result = await this.resolver.resolve4(url.hostname);
		} catch(err) {
			return;
		}

		if ( Array.isArray(result) && result[0] === '0.0.0.0' )
			return ['Malware'];
	}

}

CloudflareDNS.examples = [
	{title: 'Malware', url: 'https://malware.testcategory.com/'}
]


export class DNSZero extends SimpleSafetyCheck {

	async checkSingle(url) {
		if (!(url instanceof URL))
			url = new URL(url);

		const result = await this.fetch(`https://zero.dns0.eu?type=A&name=${encodeURIComponent(url.hostname)}`, {
				headers: {
					Accept: 'application/dns-json'
				}
			}).then(resp => resp.ok ? resp.json() : null).catch(err => null);

		const auth = result?.Authority?.[0];

		if ( auth?.data && auth.data.includes('negative-caching.dns0.eu') )
			return ['Malware'];

	}

}


export default SafetyCheck;
