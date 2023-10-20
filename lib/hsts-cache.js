
export default class HSTSCache {

	upgrade(url) {
		if (!(url instanceof URL))
			url = new URL(url);

		if ( url.protocol === 'http:' && this.match(url.hostname) )
			url.protocol = 'https:';

		return url;
	}

	match(domain) {
		if ( this.exact ) {
			let record = this.exact[domain],
				now = Date.now();
			if ( record && record.expires < now )
				this.exact[domain] = record = null;
			else if ( record ) {
				console.debug('[HSTS] matched', domain, 'exactly with value', record);
				return record.value;
			}
		}

		if ( this.wildcard ) {
			let i = this.wildcard.length;
			while(i--) {
				const entry = this.wildcard[i];
				if ( domain.endsWith(entry[0]) ) {
					record = entry[1];
					if ( record && record.expires < now ) {
						this.wildcard.splice(i, 1);
						record = null;
					} else if ( record ) {
						console.debug('[HSTS] matched', domain, 'against wildcard', entry[0], 'with value', record);
						return record.value;
					}
				}
			}
		}

		return null;
	}

	set(domain, wildcard, expires, value = true) {
		expires = Date.now() + (expires * 1000);

		// Always set an exact entry, even for wildcards.
		if ( ! this.exact )
			this.exact = {};

		this.exact[domain] = {
			value,
			expires
		};

		if ( ! wildcard )
			return;

		// Check for an existing wildcard, and just
		// update the expirey if we have it.
		const wcd = '.' + domain;

		if ( this.wildcard ) {
			let i = this.wildcard.length;
			while(i--) {
				const entry = this.wildcard[i];
				if ( entry[0] === wcd ) {
					entry[1].expires = expires;
					entry[1].value = value;
					return;
				}
			}

		} else
			this.wildcard = [];

		this.wildcard.push([
			wcd,
			{
				expires,
				value
			}
		]);
	}

	setFromHeader(url, input) {
		const parts = input.trim().split(/\s*;\s*/g);
		let expires = -1,
			subdomains = false;

		for(const part of parts) {
			if ( part === 'includeSubDomains' )
				subdomains = true;
			else {
				const match = /^\s*max-age\s*=\s*(\d+)\s*$/i.exec(part);
				if ( match )
					expires = parseInt(match[1], 10);
			}
		}

		if ( expires < 0 )
			return;

		return this.set(url.hostname, subdomains, expires);
	}

}
