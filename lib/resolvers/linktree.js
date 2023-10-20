'use strict';

import { i18nToken, imageToken, linkToken, refToken } from '../builder';
import Resolver from '../resolver';
import { UseMetadata } from '../results';
import { truncate } from '../utilities';

const SOCIAL_LINKS = {
	YOUTUBE: 'YouTube',
	ANDROID_PLAY_STORE: 'Play Store',
	APPLE_APP_STORE: 'App Store',
	ONLY_FANS: 'OnlyFans',
	X: 'Twitter'
};

export default class LinkTree extends Resolver {

	processBody(body, mode, ctx) {
		if ( mode !== 'html' )
			return UseMetadata;

		const raw = body('script#__NEXT_DATA__').text();
		let data;
		try {
			data = JSON.parse(raw);
		} catch(err) {
			/* no-op */
		}

		if ( data?.props?.pageProps?.username && Array.isArray(data.props.pageProps.links) )
			return this.processTree(data.props.pageProps, ctx);

		return this.service.metadata_resolver.extractMetadata(body, ctx);
	}

	async processTree(data, ctx) {
		//console.log('data', data);

		const fragments = {
			desc: truncate(data.description, 1000, undefined, undefined, false)
		};

		const links = [];

		for(const link of data.links) {
			if ( ! link.url || ! link.title )
				continue;

			//console.log('link', link);

			links.push(linkToken(
				link.url,
				{
					type: 'header',
					compact: true,
					image: link.thumbnail
						? imageToken(await this.proxyImage(link.thumbnail))
						: null,
					title: link.title
				},
				{
					embed: true,
					interactive: true
				}
			));

			if ( links.length >= 10 )
				break;
		}

		if ( Array.isArray(data.socialLinks) && data.socialLinks.length ) {
			const bits = [];
			for(const link of data.socialLinks) {
				let name = SOCIAL_LINKS[link.type];
				if ( ! name )
					name = link.type.toLowerCase()
						.replace(/_/g, ' ')
						.replace(/\b[a-z]/g, m => m[0].toUpperCase());

				bits.push(linkToken(
					link.url,
					name
				));
			}

			// Spooky~
			for(let i = 1; i < bits.length; i += 2)
				bits.splice(i, 0, ' • ');

			links.push(bits);
		}

		const logo = await this.proxyImage(data.account.profilePictureUrl);

		let full = this.builder()
			.setLogo(logo)
			.setTitle(data.pageTitle)
			.setExtra('Linktree');

		if ( fragments.desc )
			full = full
				.addBox({'mg-y': 'small'}, refToken('desc'));

		full = full.addBox({'mg-y': 'small'}, links);

		return {
			v: 9,
			i18n_prefix: 'embed.linktree',
			fragments,

			short: this.builder()
				.setLogo(logo)
				.setTitle(data.pageTitle)
				.setSubtitle(refToken('desc'))
				.setExtra([
					'Linktree',
					' • ',
					i18nToken('links', '{count,plural,one{# Link}other{# Links}}', {
						count: data.links?.length ?? 0
					})
				]),

			full
		}

	}

};

LinkTree.hosts = [
	'linktr.ee'
];

LinkTree.examples = [
	{title: 'User', url: 'https://linktr.ee/360chrism'}
];
