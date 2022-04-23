'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, linkToken, styleToken, galleryToken, overlayToken, imageToken, boxToken} from '../builder';

const EMOTE_URL = /^\/emotes\/([0-9a-f]+)/i,
	LOGO_URL = 'https://7tv.app/assets/icons/icon-72x72.png',
	API_SERVER = 'https://api.7tv.app';


export default class SevenTV extends Resolver {

	transformURL(url, ctx) {
		const match = EMOTE_URL.exec(url.pathname);
		if ( match ) {
			const emote_id = ctx.emote_id = match[1];
			ctx.cache_key = `7tv-emote-${emote_id}`;
			return `${API_SERVER}/v2/emotes/${emote_id}`;
		}

		return UseMetadata;
	}

	processBody(data) {
		if ( ! data || ! data.id || ! data.visibility || ! data.urls || ! data.width || ! data.height || ! data.owner )
			return;

		const flags = data.visibility,
			isPrivate					= flags & 1,
			isGlobal					= flags >>> 1 & 1,
			isUnlisted				= flags >>> 2 & 1,
			isZeroWidth				= flags >>> 7 & 1,
			isPermanentlyUnlisted		= flags >>> 8 & 1,
			isApproved = !(isUnlisted || isPermanentlyUnlisted),
			image = data.urls[3] && data.urls[3][1],
			aspect = data.width[3] / data.height[3]

		const user = linkToken(
				`https://7tv.app/users/${data.owner.id}`,
				styleToken({weight: 'semibold'}, data.owner.display_name)
			),
			emote = isGlobal ? i18nToken('embed.7tv.global_emote', 'Global Emote') : i18nToken('embed.7tv.emote', 'Emote'),
			preview_image = boxToken({pd: 'large'},
				imageToken(
					image,
					{sfw: isApproved}
				)
			);

		const visibilityFlags = [];
		if (isZeroWidth) {
			visibilityFlags.push(' • ');
			visibilityFlags.push(i18nToken('embed.7tv.zero_width', 'Zero-Width'));
		}
		if (isPrivate) {
			visibilityFlags.push(' • ');
			visibilityFlags.push(i18nToken('embed.7tv.private', 'Private'));
		}
		if (isUnlisted || PermanentlyUnlisted) {
			visibilityFlags.push(' • ');
			visibilityFlags.push(i18nToken('embed.7tv.unlisted', 'Unlisted'));
		}

		return {
			v: 5,
			accent: '#4FC2BC',

			short: this.builder()
				.setLogo(image, {sfw: isApproved, aspect: aspect})
				.setSFWLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(data.name)
				.setSubtitle([
					'7TV ',
					emote,
					' • ',
					i18nToken('embed.7tv.by-line', 'By: {user}', {
						user
					}),
					...visibilityFlags
				]),

			full: this.builder()
				.setLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(data.name)
				.setSubtitle([
					'7TV ',
					emote
				])
				.addConditional(true, isApproved ? undefined : true,
					galleryToken([
						overlayToken(
							preview_image,
							{},
							{
								background: '#191919'
							}
						),
						overlayToken(
							preview_image,
							{},
							{
								background: '#f2f2f2'
							}
						)
					])
				)
				.addField(i18nToken('embed.7tv.uploader', 'Uploader:'), user, true)
				.addField(i18nToken('embed.7tv.flags', 'Flags:'), visibilityFlags, true)
		}
	}

}

SevenTV.hosts = ['7tv.app'];
SevenTV.examples = [
	{title: 'Home Page', url: 'https://7tv.app'},
	{title: 'Emote', url: 'https://7tv.app/emotes/60afbfbaa3648f409a6e5211'},
	{title: 'User', url: 'https://7tv.app/users/60c5600515668c9de42e6d69'}
]
