'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {formatSize, truncate} from '../utilities';
import {formatToken, i18nToken, imageToken, linkToken, refToken, styleToken} from '../builder';

const BAD_URLS = [
	'login',
	'signup',
	'languages',
	'archive',
	'faq',
	'tools',
	'night_mode',
	'news',
	'pro',
	'dmca',
	'report-abuse',
	'contact'
];

const ICON = 'https://pastebin.com/favicon.ico';
const LOGO = 'https://pastebin.com/themes/pastebin/img/pastebin_logo_side_outline.png';

export default class Pastebin extends Resolver {

	transformURL(url) {
		if ( url.pathname === '/' || url.pathname.startsWith('/doc_') || url.pathname.startsWith('/site/') )
			return UseMetadata;

		if ( BAD_URLS.includes(url.pathname.slice(0)) )
			return UseMetadata;

		return url;
	}

	processBody(body, mode, ctx) {
		if ( ! body || mode !== 'html' )
			return;

		const title = body('.info-top h1').first().text();
		const user_link = body('.username a').first(),
			name = user_link.text(),
			url = user_link.attr('href');

		const format = body('.top-buttons .left a').first().text();
		const raw = body('.source').first().text().trim();

		const avatar_src = body('.user-icon img').first().attr('src');
		const avatar = avatar_src ? new URL(avatar_src, ctx.url).toString() : null;

		const views = parseFloat(body('.visits').first().text().replace(/[^\d.]/g, ''));

		const user = name ? linkToken(new URL(url, ctx.url), styleToken({
			weight: 'semibold', color: 'base'
		}, name)) : null;

		return {
			v: 6,

			fragments: {
				title: user ? styleToken({color: 'alt'}, i18nToken('embed.pastebin.by', '{title} by {user}', {
					title: styleToken({color: 'base'}, title),
					user
				})) : title,
				text: truncate(raw, 2000, undefined, undefined, false),
				info: i18nToken(
					'embed.pastebin.sub',
					'{format} • {size} • {views, plural, one {# View} other {# Views}}',
					{
						format,
						size: formatSize(raw.length),
						views
					}
				),
				foot: this.builder()
					.setFooter(
						null,
						'Pastebin.com',
						imageToken(
							this.proxyImage(ICON),
							{sfw: true, aspect: 1, size: '16'}
						)
					)
			},

			short: this.builder()
				.setLogo(this.proxyImage(LOGO), {sfw: true, aspect: 1})
				.setTitle(refToken('title'))
				.setSubtitle(refToken('info'))
				.setExtra(['Pastebin.com']),

			mid: this.builder()
				.setCompactHeader()
				.setLogo(this.proxyImage(avatar ?? LOGO), {sfw: avatar ? false : true, aspect: 1})
				.setTitle(refToken('title'))
				.setSubtitle(refToken('info'))
				.addBox({
					wrap: 'pre-wrap',
					lines: 5
				}, refToken('text'))
				.addRef('foot'),

			full: this.builder()
				.setLogo(this.proxyImage(avatar ?? LOGO), {sfw: avatar ? false : true, aspect: 1})
				.setTitle(refToken('title'))
				.setSubtitle(refToken('info'))
				.addBox({
					wrap: 'pre-wrap',
					lines: 20,
					'mg-y': 'small'
				}, refToken('text'))
				.addRef('foot')
		};
	}

}

Pastebin.hosts = ['pastebin.com'];
Pastebin.examples = [{title: 'Some Paste', url: 'https://pastebin.com/jqnQXqYx'}];
