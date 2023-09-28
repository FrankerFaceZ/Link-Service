'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, linkToken, styleToken, iconToken, imageToken, formatToken, overlayToken, boxToken, galleryToken, refToken} from '../builder';
import dayjs from 'dayjs';

const EMOTE_URL = /^\/(?:emote|emoticons?)\/(\d+)(?:-.*)?$/i,
	LOGO_URL = 'https://cdn.frankerfacez.com/static/logo.png',
	API_SERVER = 'https://api.frankerfacez.com';


export default class FrankerFaceZ extends Resolver {

	transformURL(url, ctx) {
		if ( ! (url.hostname === 'www.frankerfacez.com' || url.hostname === 'frankerfacez.com') )
			return UseMetadata;

		const match = EMOTE_URL.exec(url.pathname);
		if ( match ) {
			const emote_id = ctx.emote_id = parseInt(match[1], 10);
			ctx.cache_key = `ffz-emote-${emote_id}`;
			return `${API_SERVER}/v1/emote/${emote_id}`;
		}

		return UseMetadata;
	}

	processBody(data) {
		if ( ! data || ! data.emote )
			return;

		const emote = data.emote,
			stat = emote.urls,
			images = emote.animated ?? stat,
			pub = emote.public,
			aspect = emote.width / emote.height,
			approved = emote.status === 1,
			user = linkToken(
				`https://www.frankerfacez.com/${emote.owner.name}/submissions`,
				styleToken({weight: 'semibold'}, emote.owner.display_name)
			);
		let status = emote.status;
		if ( status === 0 )
			status = i18nToken('status.0', 'Awaiting Approval');
		else if ( status === 1 )
			status = i18nToken('status.1', 'Approved');
		else if ( status === 2 )
			status = i18nToken('status.2', 'Rejected');
		else
			status = i18nToken('status.-', 'Unknown');

		const preview_image = boxToken({pd: 'large'},
			imageToken(
				images[4] || images[2] || images[1],
				{sfw: approved}
			));

		const created = dayjs(emote.created_at),
			updated = dayjs(emote.last_updated);

		return {
			v: 6,
			i18n_prefix: 'embed.ffz',
			accent: '#4A3C5C',
			fragments: {
				preview: preview_image
			},

			special: emote.public ? {
				type: 'ffz-emote',
				id: emote.id
			} : null,

			short: this.builder()
				.setLogo(stat[2] || stat[1], {sfw: approved, aspect})
				.setTitle(emote.name)
				.setSubtitle([
					iconToken('zreknarf'),
					' ',
					i18nToken('emote', 'Emote'),
					' • ',
					i18nToken('by-line', 'By: {user}', {
						user
					}),
					' • ',
					approved ? i18nToken('user-line', '{count,plural,one {# User} other {{count,number} Users}}', {
						count: emote.usage_count
					}) : status,
					pub ? ' • ' : null,
					pub ? i18nToken('public', 'Public') : null
				]),

			full: this.builder()
				.setLogo(LOGO_URL, {aspect: 1, sfw: true, rounding: 2})
				.setTitle(emote.name)
				.setSubtitle([
					i18nToken('emote', 'Emote'),
					' • ',
					status,
					pub ? ' • ' : null,
					pub ? i18nToken('public', 'Public') : null
				])
				.addConditional(
					true, ! approved ? true : undefined,
					galleryToken([
						overlayToken(
							refToken('preview'),
							{},
							{
								background: '#191919'
							}
						),
						overlayToken(
							refToken('preview'),
							{},
							{
								background: '#f2f2f2'
							}
						)
					])
				)
				.addField(i18nToken('owner', 'Owner'), user, true)
				.addField(i18nToken('users', 'Users'), formatToken('number', emote.usage_count), true)
				.setFooter(null, [
					iconToken('zreknarf'), ' FrankerFaceZ',
					' • ',
					formatToken('datetime', updated || created)
				], null, {compact: true})
		};
	}

}


FrankerFaceZ.hosts = ['frankerfacez.com'];
FrankerFaceZ.examples = [
	{title: 'Home Page', url: 'https://www.frankerfacez.com/'},
	{title: 'Channel', url: 'https://www.frankerfacez.com/channel/sirstendec'},
	{title: 'User', url: 'https://www.frankerfacez.com/wolsk'},
	{title: 'Emote', url: 'https://www.frankerfacez.com/emoticon/24999-AndKnuckles'}
];
