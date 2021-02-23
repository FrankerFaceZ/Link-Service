'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {styleToken, galleryToken, imageToken, overlayToken, iconToken} from '../builder';

const FRANKERZ_LOGO = 'http://tehurn.com/media/FrankerZ.png',
	FRANKERZ_IMAGE = 'http://tehurn.com/media/FrankerZ-BG.jpg';

const TEHURN_LOGO = 'http://tehurn.com/favicon.ico',
	TEHURN_WEBM = 'http://tehurn.com/media/LUIGI_9001_SUPER_SWAGG_XXXX.webm',
	TEHURN_MP4 = 'http://tehurn.com/media/LUIGI_9001_SUPER_SWAGG_XXXX.mp4';

export default class TehUrn extends Resolver {

	transformURL(url, ctx) {
		if ( url.pathname === '/frankerz' ) {
			ctx.page = 'frankerz';
			ctx.skip_request = true;
			return url;

		} else if ( url.pathname === '/' ) {
			ctx.page = 'tehurn';
			ctx.skip_request = true;
			return url;
		}

		return UseMetadata;
	}

	processBody(b, m, ctx) {
		if ( ctx.page === 'frankerz' ) {
			const builder = this.builder()
				.setTitle('FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ')
				.setSubtitle('FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ')
				.setLogo(this.proxyImage(FRANKERZ_LOGO))
				.addConditional(true, undefined, [
					galleryToken(imageToken(this.proxyImage(FRANKERZ_IMAGE), {sfw: true})),
					styleToken({color: 'alt-2'}, `FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ FrankerZ`)
				]);

			return {
				v: 5,
				accent: '#6D5241',

				short: builder.header,
				full: builder
			};
		}

		if ( ctx.page === 'tehurn' ) {
			const builder = this.builder()
				.setTitle('TEH URN!!1!')
				.setLogo(this.proxyImage(TEHURN_LOGO))
				.addConditional(true, undefined, [
					galleryToken(
						overlayToken(
							{
								type: 'tag',
								tag: 'video',
								attrs: {
									muted: true, loop: true, autoplay: true
								},
								content: [
									{
										type: 'tag', tag: 'source',
										attrs: {
											type: 'video/webm', src: this.proxyImage(TEHURN_WEBM)
										}
									},
									{
										type: 'tag', tag: 'source',
										attrs: {
											type: 'video/mp4', src: this.proxyImage(TEHURN_MP4)
										}
									}
								]
							},
							{
								'top-right': iconToken('volume-off')
							}
						)
					)
				]);

			return {
				v: 5,

				short: builder.header,
				full: builder
			}
		}
	}
}

TehUrn.hosts = ['tehurn.com'];
