'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {styleToken, galleryToken, imageToken} from '../builder';

const LOGO = 'https://xkcd.com/s/0b7742.png';

export default class XKCD extends Resolver {

	transformURL(url, ctx) {
		if ( url.pathname === '/' ) {
			ctx.cache_key = `xkcd-latest`;
			return 'https://xkcd.com/info.0.json';
		}

		const match = /^\/(\d+)(?:\/|$)/.exec(url.pathname);
		if ( match ) {
			ctx.cache_key = `xkcd-${match[1]}`;
			return `https://xkcd.com/${match[1]}/info.0.json`;
		}

		return UseMetadata;
	}

	processBody(data, mode) {
		if ( ! data || mode !== 'json' )
			return;

		const builder = this.builder()
			.setTitle(data.title)
			.setSubtitle([
				'xkcd #',
				styleToken({weight: 'semibold'}, data.num)
			])
			.setLogo(LOGO)
			.addConditional(true, undefined, [
				galleryToken(imageToken(data.img, {sfw: true})),
				styleToken({color: 'alt-2'}, data.alt)
			]);

		return {
			v: 5,
			accent: '#96A8C8',

			short: builder.header,
			full: builder
		};
	}

}

XKCD.hosts = ['xkcd.com'];
XKCD.examples = [
	{title: 'Home Page', url: 'https://xkcd.com/'},
	{title: 'Comic', url: 'https://xkcd.com/221/'}
];
