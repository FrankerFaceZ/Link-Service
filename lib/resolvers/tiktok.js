'use strict';

import {iconToken, imageToken, linkToken, overlayToken, styleToken} from '../builder';
import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {URL} from 'url';

const VIDEO_URL = /^\/([^/]+)\/video\/(\d+)/,
	MOBILE_VIDEO_URL = /^\/v\/(\d+)/,
	LOGO_URL = 'https://s16.tiktokcdn.com/musical/resource/wap/static/image/logo_144c91a.png';

export default class TikTok extends Resolver {
	transformURL(url, ctx) {
		if ( url.hostname === 'vm.tiktok.com' )
			return UseMetadata;

		if ( url.hostname === 'm.tiktok.com' ) {
			const match = MOBILE_VIDEO_URL.exec(url.pathname);
			if ( match ) {
				ctx.video_id = match[1];
				ctx.cache_key = `tiktok-vid-${ctx.video_id}`;
				return `https://www.tiktok.com/oembed?url=${url.toString()}`;
			}
		}

		const match = VIDEO_URL.exec(url.pathname);
		if ( match ) {
			ctx.username = match[1];
			ctx.video_id = match[2];
			ctx.cache_key = `tiktok-vid-${ctx.video_id}`;
			return `https://www.tiktok.com/oembed?url=${url.toString()}`;
		}
	}

	processBody(data) {
		if ( data?.type !== 'video' )
			return null;

		const url_name = new URL(data.author_url).pathname.slice(1),
			has_name = ! /^user\d+$/.test(data.author_name);

		return {
			v: 5,
			accent: '#000',

			short: this.builder()
				.setLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(linkToken(
					data.author_url,
					[
						styleToken({color: 'base'}, has_name ? data.author_name : url_name),
						has_name ? ' ' : null,
						has_name ? styleToken({color: 'alt-2'}, url_name) : null
					]
				))
				.setSubtitle(data.title)
				.setExtra(data.provider_name),

			full: this.builder()
				.setLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(linkToken(
					data.author_url,
					styleToken({color: 'base'}, has_name ? data.author_name : url_name)
				))
				.setSubtitle(has_name ? linkToken(
					data.author_url,
					styleToken({color: 'alt-2'}, url_name)
				) : null)
				.addBox({wrap: 'pre-wrap', 'mg-y': 'small', lines: 10}, data.title)
				.addConditional(
					true, true,
					overlayToken(
						imageToken(data.thumbnail_url, {aspect: data.thumbnail_width / data.thumbnail_height}),
						{
							center: styleToken({size: '1'}, iconToken('play'))
						}
					)
				)
				.setFooter(null, [data.provider_name], null, {compact: true})
		}
	}
}

TikTok.hosts = ['www.tiktok.com', 'm.tiktok.com'];
TikTok.examples = [
	{
		title: 'VM Link',
		url: 'https://vm.tiktok.com/ZMeJ8NDB1/'
	},
	{
		title: 'Full Link',
		url: 'https://www.tiktok.com/@littlewolfiebird/video/6924638564206628097'
	}
];
