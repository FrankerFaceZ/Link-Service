'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {imageToken, refToken} from '../builder';

const NAME = 'Saturday Morning Breakfast Cereal',
	SMBC_TITLE = `${NAME} - `;

export default class SMBC extends Resolver {

	transformURL(url, ctx) {
		if ( url.pathname === '/' || url.pathname === '/index.php' ) {
			ctx.cache_key = `smbc-latest`;
			return url;
		}

		if ( url.pathname.startsWith('/comic/') )
			return url;

		return UseMetadata;
	}

	processBody(body, mode) {
		if ( ! body || mode !== 'html' )
			return;

		const image = body('img#cc-comic').first(),
			image_url = image.attr('src'),
			image_title = image.attr('title');

		let title = body('title').first().text();
		if ( title.startsWith(SMBC_TITLE) )
			title = title.slice(SMBC_TITLE.length);

		return {
			v: 6,

			accent: '#FF5900',

			fragments: {
				full: this.builder()
					.setTitle(title)
					.setSubtitle(NAME)
					.addConditional(true)
					.content()
					.addGallery(
						imageToken(image_url, {title: image_title, sfw: false})
					)
			},

			short: this.builder()
				.setLogo(image_url, {title: image_title, sfw: false})
				.setTitle(title)
				.setSubtitle(NAME),

			mid: refToken('full'),
			full: refToken('full')
		};
	}

}

SMBC.hosts = ['smbc-comics.com'];
SMBC.examples = [
	{title: 'Home Page', url: 'https://www.smbc-comics.com'},
	{title: 'Comic', url: 'https://www.smbc-comics.com/comic/punishment'}
];
