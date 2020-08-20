'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, linkToken, styleToken, iconToken, imageToken, formatToken, overlayToken, boxToken, galleryToken} from '../builder';
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
			images = emote.urls,
			pub = emote.public,
			aspect = emote.width / emote.height,
			approved = emote.status === 1,
			user = linkToken(
				`https://www.frankerfacez.com/${emote.owner.name}/submissions`,
				styleToken({weight: 'semibold'}, emote.owner.display_name)
			);
		let status = emote.status;
		if ( status === 0 )
			status = i18nToken('emote.ffz.status.0', 'Awaiting Approval');
		else if ( status === 1 )
			status = i18nToken('emote.ffz.status.1', 'Approved');
		else if ( status === 2 )
			status = i18nToken('emote.ffz.status.2', 'Rejected');
		else
			status = i18nToken('emote.ffz.status.-', 'Unknown');

		const preview_image = boxToken({pd: 'large'},
			imageToken(
				images[4] || images[2] || images[1],
				{sfw: approved}
			));

		const created = dayjs(emote.created_at),
			updated = dayjs(emote.last_updated);

		return {
			v: 5,
			accent: '#4A3C5C',

			short: this.builder()
				.setLogo(images[2] || images[1], {sfw: approved, aspect})
				.setTitle(emote.name)
				.setSubtitle([
					iconToken('zreknarf'),
					' ',
					i18nToken('embed.ffz.emote', 'Emote'),
					' • ',
					i18nToken('embed.ffz.by-line', 'By: {user}', {
						user
					}),
					' • ',
					approved ? i18nToken('embed.ffz.user-line', '{count,plural,one {# User} other {{count,number} Users}}', {
						count: emote.usage_count
					}) : status,
					pub ? ' • ' : null,
					pub ? i18nToken('embed.ffz.public', 'Public') : null
				]),

			full: this.builder()
				.setLogo(LOGO_URL, {aspect: 1, sfw: true, rounding: 2})
				.setTitle(emote.name)
				.setSubtitle([
					i18nToken('embed.ffz.emote', 'Emote'),
					' • ',
					status,
					pub ? ' • ' : null,
					pub ? i18nToken('embed.ffz.public', 'Public') : null
				])
				.addConditional(
					true, ! approved ? true : undefined,
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
				.addField(i18nToken('embed.ffz.owner', 'Owner'), user, true)
				.addField(i18nToken('embed.ffz.users', 'Users'), formatToken('number', emote.usage_count), true)
				.setFooter(null, [
					iconToken('zreknarf'), ' FrankerFaceZ',
					' • ',
					formatToken('datetime', updated || created)
				], null, {compact: true})
		};
	}

}


FrankerFaceZ.hosts = ['frankerfacez.com'];
