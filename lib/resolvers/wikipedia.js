'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {truncate} from '../utilities';
import {galleryToken} from '../builder';

const LOGO_URL = 'https://en.wikipedia.org/static/apple-touch/wikipedia.png',
	BAD_ELEMENTS = ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'style'];

export default class Wikipedia extends Resolver {

	transformURL(url) {
		// TODO: Mobile support
		// TODO: Maybe just request mobile for saner HTML to parse?

		if ( ! url.pathname.startsWith('/wiki/') )
			return UseMetadata;

		return url;
	}

	processBody(body, mode) {
		if ( ! body || mode !== 'html' )
			return null;

		const image = body('img.thumbimage').first().attr('src'),

			bits = [];

		for (const bit of Array.from(body('.mw-parser-output').children())) {
			if ( BAD_ELEMENTS.includes(bit.name) )
				continue;

			bits.push(body(bit).text());
		}

		const text = bits.join('').trim(),
			title = body('title').text();

		return {
			v: 5,

			short: this.builder()
				.setLogo(LOGO_URL, {rounding: 3, aspect: 1})
				.setTitle(title)
				.setSubtitle(truncate(text)),

			full: this.builder()
				.setTitle(title)
				.setLogo(LOGO_URL, {rounding: -1, aspect: 1})
				.setCompactHeader()
				.addBox({lines: 10, wrap: 'pre-wrap', 'mg-y': 'small'}, truncate(text, 1000, undefined, undefined, false))
				.addConditional(true, true, galleryToken(image))
		};
	}

}

Wikipedia.hosts = ['wikipedia.org'];
