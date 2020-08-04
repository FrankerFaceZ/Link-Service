import {expect} from 'chai';

import normalizeURL from '../lib/normalize-url';

function check(input) {
	for (const [key, val] of Object.entries(input)) {
		expect(normalizeURL(key).toString()).to.equal(val);
	}
}

describe('normalize-url', function() {
	it('accepts minimum viable URLs', function() {
		check({
			'google.com': 'http://google.com/',
			'google.com.': 'http://google.com/'
		})
	});

	it('has a default protocol', function() {
		check({
			'google.com': 'http://google.com/',
			'//google.com': 'http://google.com/',
			'https://google.com': 'https://google.com/'
		})
	});
});
